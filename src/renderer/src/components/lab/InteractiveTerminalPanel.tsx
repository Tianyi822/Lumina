import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useSshTerminal } from './hooks/useSshTerminal'
import styles from './InteractiveTerminalPanel.module.css'

type TerminalStatus = 'opening' | 'connected' | 'closed' | 'error'

interface TerminalSize {
  cols: number
  rows: number
}

interface InteractiveTerminalPanelProps {
  targetId: string
  title: string
  subtitle?: string
}

function readCssVar(name: string, fallback: string): string {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export default function InteractiveTerminalPanel({
  targetId,
  title,
  subtitle
}: InteractiveTerminalPanelProps) {
  const terminalHostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const inputDisposableRef = useRef<ReturnType<Terminal['onData']> | null>(null)
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

  const readTerminalSize = useCallback((): TerminalSize => {
    const terminal = terminalRef.current
    return {
      cols: terminal?.cols || 80,
      rows: terminal?.rows || 24
    }
  }, [])

  const markClosed = useCallback((reason?: string): void => {
    setStatus((prev) => (prev !== 'error' ? 'closed' : prev))
    setStatusMessage(reason || '终端已关闭')
  }, [])

  const {
    open: sshOpen,
    write: sshWrite,
    resize: sshResize,
    close: sshClose,
    sessionId: sshSessionIdRef
  } = useSshTerminal({
    targetId,
    enabled: true,
    onData: useCallback((data: string): void => {
      terminalRef.current?.write(data)
    }, []),
    onExit: useCallback(
      (reason?: string): void => {
        markClosed(reason)
      },
      [markClosed]
    )
  })

  const resizeRemoteTerminal = useCallback(
    async (size: TerminalSize): Promise<void> => {
      if (!sshSessionIdRef.current) return
      const result = await sshResize(size)
      if (result && !result.success) {
        setStatus('error')
        setStatusMessage(result.error || '终端尺寸同步失败')
      }
    },
    [sshResize, sshSessionIdRef]
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
      if (!sshSessionIdRef.current) return
      const result = await sshWrite(data)
      if (result && !result.success) {
        setStatus('error')
        setStatusMessage(result.error || '终端写入失败')
      }
    },
    [sshWrite, sshSessionIdRef]
  )

  const focusTerminal = useCallback((): void => {
    window.requestAnimationFrame(() => {
      terminalRef.current?.focus()
    })
  }, [])

  const disposeTerminal = useCallback(
    (closeRemote: boolean): void => {
      if (resizeFrameRef.current) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = 0
      }

      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      inputDisposableRef.current?.dispose()
      inputDisposableRef.current = null

      terminalRef.current?.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      lastSizeRef.current = null

      if (closeRemote) {
        void sshClose()
      }
    },
    [sshClose]
  )

  // 初始化终端
  useEffect(() => {
    const host = terminalHostRef.current
    if (!host) return

    disposedRef.current = false
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

    const size: TerminalSize = { cols: terminal.cols, rows: terminal.rows }
    ;(async () => {
      const result = await sshOpen(size)

      if (disposedRef.current) return

      if (!result.success || !result.sessionId) {
        setStatus('error')
        setStatusMessage(result.error || '终端打开失败')
        return
      }

      setStatus('connected')
      setStatusMessage('')
      focusTerminal()
      await resizeRemoteTerminal(readTerminalSize())
    })()

    return () => {
      disposedRef.current = true
      disposeTerminal(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId])

  const handleRestart = useCallback(async () => {
    disposeTerminal(true)
    disposedRef.current = false

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

    const size: TerminalSize = { cols: terminal.cols, rows: terminal.rows }
    const result = await sshOpen(size)

    if (disposedRef.current) return

    if (!result.success || !result.sessionId) {
      setStatus('error')
      setStatusMessage(result.error || '终端打开失败')
      return
    }

    setStatus('connected')
    setStatusMessage('')
    focusTerminal()
    await resizeRemoteTerminal(readTerminalSize())
  }, [targetId, disposeTerminal, writeRemoteTerminal, scheduleFitAndResize, resizeRemoteTerminal, readTerminalSize, focusTerminal, sshOpen])

  return (
    <section className={styles['sm-interactive-terminal-panel']}>
      <header className={styles['sm-interactive-terminal-panel__header']}>
        <div className={styles['sm-interactive-terminal-panel__copy']}>
          <span className={styles['sm-interactive-terminal-panel__eyebrow']}>SSH 终端</span>
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
