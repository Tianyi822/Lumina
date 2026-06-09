import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useSshTerminal } from './hooks/useSshTerminal'
import styles from './InteractiveTerminalPanel.module.css'

/** 终端生命周期状态：opening（连接中）、connected（已连接）、closed（已关闭）、error（异常） */
type TerminalStatus = 'opening' | 'connected' | 'closed' | 'error'

interface TerminalSize {
  cols: number
  rows: number
}

/** 交互式 xterm 终端面板，管理 xterm.js 实例与 SSH 远程终端的双向通信 */
interface InteractiveTerminalPanelProps {
  targetId: string
  title: string
  subtitle?: string
}

/** 读取 CSS 变量值，读取失败时返回 fallback 默认值 */
function readCssVar(name: string, fallback: string): string {
  // 从 CSS 变量读取并 trim，获取不到时使用 fallback 默认值
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export default function InteractiveTerminalPanel({
  targetId,
  title,
  subtitle
}: InteractiveTerminalPanelProps) {
  // xterm 实例与容器引用
  const terminalHostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const inputDisposableRef = useRef<ReturnType<Terminal['onData']> | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const resizeFrameRef = useRef(0)
  const lastSizeRef = useRef<TerminalSize | null>(null)
  // 标记组件是否已销毁，防止异步回调访问已卸载实例
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

  /** 读取当前终端列/行数，用于远程同步尺寸变化 */
  const readTerminalSize = useCallback((): TerminalSize => {
    const terminal = terminalRef.current
    return {
      cols: terminal?.cols || 80,
      rows: terminal?.rows || 24
    }
  }, [])

  /** 标记终端为 closed（若当前不是 error 则覆盖），设置关闭原因 */
  const markClosed = useCallback((reason?: string): void => {
    // 仅在当前不是 error 状态时标记为 closed，避免覆盖异常状态
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

  /** 同步本地终端尺寸到远程 SSH 终端 */
  const resizeRemoteTerminal = useCallback(
    async (size: TerminalSize): Promise<void> => {
      // 无远程会话时跳过尺寸同步
      if (!sshSessionIdRef.current) return
      const result = await sshResize(size)
      if (result && !result.success) {
        setStatus('error')
        setStatusMessage(result.error || '终端尺寸同步失败')
      }
    },
    [sshResize, sshSessionIdRef]
  )

  /** 自适应容器尺寸，xterm 尚未完成首帧测量时可安全忽略异常 */
  const fitTerminal = useCallback(() => {
    try {
      fitAddonRef.current?.fit()
    } catch {
      /* xterm 尚未完成首帧测量时可安全忽略 */
    }
  }, [])

  /** 调度异步尺寸适配：防抖 RAF + 尺寸变化检测，避免重复 resize */
  const scheduleFitAndResize = useCallback(() => {
    if (resizeFrameRef.current) {
      window.cancelAnimationFrame(resizeFrameRef.current)
    }
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = 0
      fitTerminal()
      const size = readTerminalSize()
      const last = lastSizeRef.current
      // 尺寸未变化时跳过远程 resize 请求
      if (last && last.cols === size.cols && last.rows === size.rows) return
      lastSizeRef.current = size
      void resizeRemoteTerminal(size)
    })
  }, [fitTerminal, readTerminalSize, resizeRemoteTerminal])

  /** 将本地终端输入数据写入远程 SSH 终端 */
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

  /** 延迟一帧后聚焦终端（等待渲染完成） */
  const focusTerminal = useCallback((): void => {
    window.requestAnimationFrame(() => {
      terminalRef.current?.focus()
    })
  }, [])

  /** 清理 xterm 实例、ResizeObserver、远程连接等资源 */
  const disposeTerminal = useCallback(
    (closeRemote: boolean): void => {
      // 取消待执行的 RAF 帧，避免已卸载后触发 resize
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

      // 按需关闭远程 SSH 会话
      if (closeRemote) {
        void sshClose()
      }
    },
    [sshClose]
  )

  // 初始化终端：创建 xterm 实例、绑定数据回调、监听容器尺寸变化、建立远程连接
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

    // 绑定用户输入 → 远程写入
    inputDisposableRef.current = terminal.onData((data) => {
      void writeRemoteTerminal(data)
    })

    // ResizeObserver 监听容器尺寸变化，自动适配终端
    const observer = new ResizeObserver(() => scheduleFitAndResize())
    observer.observe(host)
    resizeObserverRef.current = observer

    const size: TerminalSize = { cols: terminal.cols, rows: terminal.rows }
    // 异步建立 SSH 会话，连接成功后再同步终端尺寸和焦点
    ;(async () => {
      const result = await sshOpen(size)

      // 组件已卸载时放弃连接结果，避免在已销毁实例上更新状态
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

    // 组件卸载或 targetId 变化时，标记已销毁并清理终端资源
    return () => {
      disposedRef.current = true
      disposeTerminal(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId])

  /** 重开终端：先销毁旧实例，再完整重建 xterm + 新连接 */
  const handleRestart = useCallback(async () => {
    disposeTerminal(true)
    // 重置销毁标记，重新建立终端容器引用
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
