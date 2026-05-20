import { useEffect, useRef, useState, useMemo } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import styles from './InteractiveTerminalPanel.module.css'

type TerminalBackend = 'docker' | 'ssh'
type TerminalStatus = 'opening' | 'connected' | 'closed' | 'error'

interface InteractiveTerminalPanelProps {
  backend: TerminalBackend
  targetId: string
  title: string
  subtitle?: string
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

  useEffect(() => {
    if (!terminalHostRef.current) return

    disposedRef.current = false
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: { background: '#121212', foreground: '#d4d4d4' }
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalHostRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const resizeObserver = new ResizeObserver(() => fitAddonRef.current?.fit())
    if (terminalHostRef.current) resizeObserver.observe(terminalHostRef.current)
    ;(async () => {
      try {
        const cols = terminal.cols
        const rows = terminal.rows
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await window.api.lab.terminal.open(targetId)

        if (disposedRef.current) return
        void cols
        void rows

        if (result?.success && result.data) {
          sessionIdRef.current = result.data.sessionId
          setStatus('connected')
        } else {
          setStatus('error')
          setStatusMessage(result?.error || '连接失败')
          terminal.write(`\r\n[错误] ${result?.error || '连接失败'}\r\n`)
        }
      } catch (error) {
        setStatus('error')
        setStatusMessage(error instanceof Error ? error.message : String(error))
      }
    })()

    return () => {
      disposedRef.current = true
      if (sessionIdRef.current) {
        window.api.lab.terminal.close(sessionIdRef.current)
        sessionIdRef.current = null
      }
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [backend, targetId])

  return (
    <div className={styles['interactive-terminal-panel']}>
      <div className={styles['terminal-header']}>
        <div className={styles['terminal-header__copy']}>
          <span className={styles['terminal-header__eyebrow']}>
            {backend === 'ssh' ? 'SSH 终端' : 'Docker 终端'}
          </span>
          <h2>{title}</h2>
          {subtitle && <span className={styles['terminal-subtitle']}>{subtitle}</span>}
        </div>
        <span className={`sm-badge ${styles[`status-${status}`]}`}>{statusLabel}</span>
      </div>
      {statusMessage && <div className={styles['status-message']}>{statusMessage}</div>}
      <div ref={terminalHostRef} className={styles['terminal-host']} />
    </div>
  )
}
