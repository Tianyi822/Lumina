import { useState, useRef, useEffect, useCallback } from 'react'
import type { TerminalLog } from '@renderer/types/lab'
import styles from './TerminalPanel.module.css'

interface TerminalPanelProps {
  containerId: string
  containerName: string
  logs: TerminalLog[]
  loading?: boolean
  onExecute: (command: string) => void
  onClear: () => void
}

const quickCommands = [
  { label: 'ls -la', command: 'ls -la' },
  { label: 'pwd', command: 'pwd' },
  { label: 'whoami', command: 'whoami' },
  { label: 'env', command: 'env' },
  { label: 'ps aux', command: 'ps aux' },
  { label: 'df -h', command: 'df -h' },
  { label: 'free -m', command: 'free -m' },
  { label: 'cat /etc/os-release', command: 'cat /etc/os-release' }
]

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function TerminalPanel({
  containerId,
  containerName,
  logs,
  loading,
  onExecute,
  onClear
}: TerminalPanelProps) {
  const [commandInput, setCommandInput] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const logsContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    if (autoScroll) scrollToBottom()
  }, [logs.length, autoScroll, scrollToBottom])

  function handleExecute(): void {
    const command = commandInput.trim()
    if (!command) return
    onExecute(command)
    setCommandInput('')
  }

  function handleKeydown(event: React.KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleExecute()
    }
  }

  const hasLogs = logs.length > 0

  return (
    <div className={styles['terminal-panel']}>
      <div className={styles['terminal-header']}>
        <div className={styles['terminal-header__copy']}>
          <span className={styles['terminal-header__eyebrow']}>交互终端</span>
          <div className={styles['terminal-header__headline']}>
            <h2>{containerName}</h2>
            <span className={styles['terminal-id']}>{containerId.substring(0, 12)}</span>
          </div>
          <p>直接向容器发送 Shell 命令，用于巡检、诊断和临时操作。</p>
        </div>
        <div className={styles['terminal-actions']}>
          <label className={styles['auto-scroll-toggle']}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            <span>自动滚动</span>
          </label>
          <button className="sm-button sm-button--secondary sm-button--small" onClick={onClear}>
            清空
          </button>
        </div>
      </div>

      <div ref={logsContainerRef} className={styles['terminal-output']}>
        {!hasLogs ? (
          <div className={styles['empty-logs']}>
            <p>在下方输入命令开始执行</p>
            <p className={styles['empty-hint']}>支持常见 Shell 命令</p>
          </div>
        ) : (
          <div className={styles['log-list']}>
            {logs.map((log, index) => (
              <div key={index} className={`${styles['log-entry']} ${styles[`log-${log.type}`]}`}>
                <span className={styles['log-time']}>[{formatTime(log.timestamp)}]</span>
                <span className={styles['log-prefix']}>
                  {log.type === 'input' ? '$' : log.type === 'error' ? 'x' : '>'}
                </span>
                <pre className={styles['log-content']}>{log.content}</pre>
              </div>
            ))}
          </div>
        )}
        {loading && (
          <div className={styles['loading-indicator']}>
            <span className={styles['loading-dots']}>执行中</span>
          </div>
        )}
      </div>

      <div className={styles['terminal-input-section']}>
        <div className={styles['input-caption']}>
          <span>Shell</span>
          <span>Enter 执行</span>
        </div>
        <div className={styles['input-wrapper']}>
          <span className={styles['input-prompt']}>$</span>
          <input
            value={commandInput}
            type="text"
            className={styles['terminal-input']}
            placeholder="输入命令..."
            disabled={loading}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={handleKeydown}
          />
          <button
            className={styles['execute-btn']}
            disabled={!commandInput.trim() || loading}
            onClick={handleExecute}
          >
            执行
          </button>
        </div>
      </div>

      <div className={styles['quick-commands']}>
        <span className={styles['quick-label']}>快捷命令</span>
        <div className={styles['quick-list']}>
          {quickCommands.map((cmd) => (
            <button
              key={cmd.command}
              className={styles['sm-terminal-panel__quick-button']}
              disabled={loading}
              onClick={() => setCommandInput(cmd.command)}
            >
              {cmd.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
