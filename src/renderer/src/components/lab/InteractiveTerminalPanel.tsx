import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { IDisposable } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { labApi } from '@renderer/services/labApi'
import type { DockerTerminalDataEvent, DockerTerminalExitEvent } from '@renderer/types/lab'
import type { SshTerminalDataEvent, SshTerminalExitEvent } from '@shared/types/lab'
import styles from './InteractiveTerminalPanel.module.css'

type TerminalBackend = 'docker' | 'ssh'
type TerminalStatus = 'opening' | 'connected' | 'closed' | 'error'

interface TerminalSize {
  cols: number
  rows: number
}

interface InteractiveTerminalPanelProps {
  backend: TerminalBackend
  targetId: string
  title: string
  subtitle?: string
}

function readCssVar(name: string, fallback: string): string {
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

export default function InteractiveTerminalPanel({
  backend,
  targetId,
  title,
  subtitle
}: InteractiveTerminalPanelProps) {
  const terminalHostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const inputDisposableRef = useRef<IDisposable | null>(null)
  const removeDataListenerRef = useRef<(() => void) | null>(null)
  const removeExitListenerRef = useRef<(() => void) | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const resizeFrameRef = useRef(0)
  const lastSizeRef = useRef<TerminalSize | null>(null)
  const disposedRef = useRef(false)

  const [status, setStatus] = useState<TerminalStatus>('opening')
  const [statusMessage, setStatusMessage] = useState('')

  const statusLabel = useMemo(() => {
    const labels: Record<TerminalStatus, string> = {
      opening: '连接中',
      connected: '已连接',
      closed: '已关闭',
      error: '异常'
    }
    return labels[status]
  }, [status])

  const statusClass = useMemo(() => `status-${status}`, [status])
  const backendLabel = useMemo(
    () => (backend === 'ssh' ? 'SSH 终端' : 'Docker 终端'),
    [backend]
  )

  const readTerminalSize = useCallback((): TerminalSize => {
    const terminal = terminalRef.current
    return {
      cols: terminal?.cols || 80,
      rows: terminal?.rows || 24
    }
  }, [])

  const resizeRemoteTerminal = useCallback(
    async (size: TerminalSize): Promise<void> => {
      const sid = sessionIdRef.current
      if (!sid || status !== 'connected') return

      const result =
        backend === 'ssh'
          ? await window.api.ssh.terminal.resize(sid, size)
          : await labApi.terminal.resize(sid, size)

      if (!result.success) {
        setStatus('error')
        setStatusMessage(result.error || '终端尺寸同步失败')
      }
    },
    [backend, status]
  )

  const fitTerminal = useCallback(() => {
    try {
      fitAddonRef.current?.fit()
    } catch {
      /* xterm 尚未完成首帧测量时可安全忽略 */
    }
  }, [])

  const scheduleFitAndResize = useCallback(() => {
    if (resizeFrameRef.current) {
      window.cancelAnimationFrame(resizeFrameRef.current)
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = 0
      fitTerminal()
      const size = readTerminalSize()
      const last = lastSizeRef.current
      if (last && last.cols === size.cols && last.rows === size.rows) return
      lastSizeRef.current = size
      void resizeRemoteTerminal(size)
    })
  }, [fitTerminal, readTerminalSize, resizeRemoteTerminal])

  const writeRemoteTerminal = useCallback(
    async (data: string): Promise<void> => {
      const sid = sessionIdRef.current
      if (!sid || status !== 'connected') return

      const result =
        backend === 'ssh'
          ? await window.api.ssh.terminal.write(sid, data)
          : await labApi.terminal.write(sid, data)

      if (!result.success) {
        setStatus('error')
        setStatusMessage(result.error || '终端写入失败')
      }
    },
    [backend, status]
  )

  const handleSshData = useCallback(
    (event: SshTerminalDataEvent): void => {
      if (backend !== 'ssh' || event.sessionId !== sessionIdRef.current) return
      terminalRef.current?.write(event.data)
    },
    [backend]
  )

  const handleDockerData = useCallback(
    (event: DockerTerminalDataEvent): void => {
      if (backend !== 'docker' || event.sessionId !== sessionIdRef.current) return
      terminalRef.current?.write(event.data)
    },
    [backend]
  )

  const markClosed = useCallback((reason?: string): void => {
    sessionIdRef.current = null
    setStatus((prev) => (prev !== 'error' ? 'closed' : prev))
    setStatusMessage(reason || '终端已关闭')
  }, [])

  const handleSshExit = useCallback(
    (event: SshTerminalExitEvent): void => {
      if (backend !== 'ssh' || event.sessionId !== sessionIdRef.current) return
      markClosed(event.reason)
    },
    [backend, markClosed]
  )

  const handleDockerExit = useCallback(
    (event: DockerTerminalExitEvent): void => {
      if (backend !== 'docker' || event.sessionId !== sessionIdRef.current) return
      markClosed(event.reason)
    },
    [backend, markClosed]
  )

  const closeRemoteTerminal = useCallback(
    async (id: string): Promise<void> => {
      if (backend === 'ssh') {
        await window.api.ssh.terminal.close(id)
        return
      }
      await labApi.terminal.close(id)
    },
    [backend]
  )

  const disposeTerminal = useCallback(
    (closeRemote: boolean): void => {
      if (resizeFrameRef.current) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = 0
      }

      const currentSessionId = sessionIdRef.current
      sessionIdRef.current = null

      removeDataListenerRef.current?.()
      removeExitListenerRef.current?.()
      removeDataListenerRef.current = null
      removeExitListenerRef.current = null

      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      inputDisposableRef.current?.dispose()
      inputDisposableRef.current = null

      terminalRef.current?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      lastSizeRef.current = null

      if (closeRemote && currentSessionId) {
        void closeRemoteTerminal(currentSessionId)
      }
    },
    [closeRemoteTerminal]
  )

  // 初始化终端
  useEffect(() => {
    const host = terminalHostRef.current
    if (!host) return

    disposedRef.current = false
    setStatus('opening')
    setStatusMessage('')

    // 创建终端实例
    const terminal = new Terminal({
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 5000,
      fontFamily: readCssVar('--sm-font-mono', 'Menlo, Monaco, Consolas, monospace'),
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: readCssVar('--sm-color-bg-embedded', '#111111'),
        foreground: readCssVar('--sm-color-text-primary', '#f0f0f0'),
        cursor: readCssVar('--sm-color-accent-hover', '#8ab4ff'),
        selectionBackground: readCssVar('--sm-color-accent-18', '#2f5f9f')
      }
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // 键盘输入 → 远程写入
    inputDisposableRef.current = terminal.onData((data) => {
      void writeRemoteTerminal(data)
    })

    // 监听容器尺寸变化
    const observer = new ResizeObserver(() => scheduleFitAndResize())
    observer.observe(host)
    resizeObserverRef.current = observer

    // 监听远程数据/退出
    if (backend === 'ssh') {
      removeDataListenerRef.current = window.api.ssh.terminal.onData(handleSshData)
      removeExitListenerRef.current = window.api.ssh.terminal.onExit(handleSshExit)
    } else {
      removeDataListenerRef.current = labApi.terminal.onData(handleDockerData)
      removeExitListenerRef.current = labApi.terminal.onExit(handleDockerExit)
    }

    // 打开远程终端
    const size: TerminalSize = { cols: terminal.cols, rows: terminal.rows }
    ;(async () => {
      let result: { success: boolean; sessionId?: string; error?: string }
      if (backend === 'ssh') {
        result = await window.api.ssh.terminal.open(targetId, size)
      } else {
        result = await labApi.terminal.open(targetId, size)
      }

      if (disposedRef.current) return

      if (!result.success || !result.sessionId) {
        setStatus('error')
        setStatusMessage(result.error || '终端打开失败')
        return
      }

      sessionIdRef.current = result.sessionId
      setStatus('connected')
      setStatusMessage('')
      terminal.focus()
      await resizeRemoteTerminal(readTerminalSize())
    })()

    return () => {
      disposedRef.current = true
      disposeTerminal(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, targetId])

  const handleRestart = useCallback(async () => {
    disposeTerminal(true)
    disposedRef.current = false
    // 重新触发 useEffect 需要 key 变化，由父组件控制
    // 此处直接重新初始化
    const host = terminalHostRef.current
    if (!host) return

    setStatus('opening')
    setStatusMessage('')

    const terminal = new Terminal({
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 5000,
      fontFamily: readCssVar('--sm-font-mono', 'Menlo, Monaco, Consolas, monospace'),
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: readCssVar('--sm-color-bg-embedded', '#111111'),
        foreground: readCssVar('--sm-color-text-primary', '#f0f0f0'),
        cursor: readCssVar('--sm-color-accent-hover', '#8ab4ff'),
        selectionBackground: readCssVar('--sm-color-accent-18', '#2f5f9f')
      }
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    inputDisposableRef.current = terminal.onData((data) => {
      void writeRemoteTerminal(data)
    })

    const observer = new ResizeObserver(() => scheduleFitAndResize())
    observer.observe(host)
    resizeObserverRef.current = observer

    if (backend === 'ssh') {
      removeDataListenerRef.current = window.api.ssh.terminal.onData(handleSshData)
      removeExitListenerRef.current = window.api.ssh.terminal.onExit(handleSshExit)
    } else {
      removeDataListenerRef.current = labApi.terminal.onData(handleDockerData)
      removeExitListenerRef.current = labApi.terminal.onExit(handleDockerExit)
    }

    const size: TerminalSize = { cols: terminal.cols, rows: terminal.rows }
    let result: { success: boolean; sessionId?: string; error?: string }
    if (backend === 'ssh') {
      result = await window.api.ssh.terminal.open(targetId, size)
    } else {
      result = await labApi.terminal.open(targetId, size)
    }

    if (disposedRef.current) return

    if (!result.success || !result.sessionId) {
      setStatus('error')
      setStatusMessage(result.error || '终端打开失败')
      return
    }

    sessionIdRef.current = result.sessionId
    setStatus('connected')
    setStatusMessage('')
    terminal.focus()
    await resizeRemoteTerminal(readTerminalSize())
  }, [
    backend,
    targetId,
    disposeTerminal,
    writeRemoteTerminal,
    scheduleFitAndResize,
    handleSshData,
    handleSshExit,
    handleDockerData,
    handleDockerExit,
    resizeRemoteTerminal,
    readTerminalSize
  ])

  return (
    <section className={styles['sm-interactive-terminal-panel']}>
      <header className={styles['sm-interactive-terminal-panel__header']}>
        <div className={styles['sm-interactive-terminal-panel__copy']}>
          <span className={styles['sm-interactive-terminal-panel__eyebrow']}>
            {backendLabel}
          </span>
          <div className={styles['sm-interactive-terminal-panel__headline']}>
            <h2>{title}</h2>
            <span className={`sm-badge ${styles[statusClass]}`}>{statusLabel}</span>
          </div>
          {subtitle && <p>{subtitle}</p>}
        </div>

        {status !== 'opening' && (
          <button
            className="sm-button sm-button--secondary sm-button--small"
            onClick={() => void handleRestart()}
          >
            重开终端
          </button>
        )}
      </header>

      <div className={styles['sm-interactive-terminal-panel__body']}>
        <div
          ref={terminalHostRef}
          className={styles['sm-interactive-terminal-panel__terminal']}
        ></div>
        {status !== 'connected' && (
          <div className={styles['sm-interactive-terminal-panel__overlay']}>
            <span>{statusMessage || statusLabel}</span>
          </div>
        )}
      </div>
    </section>
  )
}
