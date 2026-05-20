import { useMemo, useState } from 'react'
import styles from './PaperChatToolCallPanel.module.css'

export interface PaperChatToolCallPanelItem {
  id: string
  name: string
  serverName?: string
  params?: unknown
  result?: unknown
  error?: string
  status: 'pending' | 'running' | 'success' | 'error'
  startTime?: string
  endTime?: string
}

interface PaperChatToolCallPanelProps {
  toolCall: PaperChatToolCallPanelItem
  index: number
}

function stringifyValue(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function getStatusText(status: PaperChatToolCallPanelItem['status']): string {
  if (status === 'running') return '执行中'
  if (status === 'success') return '完成'
  if (status === 'error') return '失败'
  return '等待'
}

function getStatusIcon(status: PaperChatToolCallPanelItem['status']): string {
  if (status === 'success') return '✓'
  if (status === 'error') return '!'
  if (status === 'running') return '…'
  return '•'
}

function formatTimeCost(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) return ''
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return ''
  return `${((end - start) / 1000).toFixed(1)}s`
}

export default function PaperChatToolCallPanel({ toolCall, index }: PaperChatToolCallPanelProps) {
  const [expanded, setExpanded] = useState(toolCall.status === 'error')
  const paramsText = useMemo(() => stringifyValue(toolCall.params), [toolCall.params])
  const resultText = useMemo(() => stringifyValue(toolCall.result), [toolCall.result])
  const timeCost = formatTimeCost(toolCall.startTime, toolCall.endTime)
  const statusClass = styles[`paper-chat-tool-call--${toolCall.status}`]

  return (
    <div
      className={`${styles['paper-chat-tool-call']} ${statusClass || ''} ${
        expanded ? styles.expanded : ''
      }`}
    >
      <button
        className={styles['paper-chat-tool-call__header']}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={styles['paper-chat-tool-call__header-left']}>
          <span className={styles['paper-chat-tool-call__step-number']}>#{index + 1}</span>
          <span className={styles['paper-chat-tool-call__status-icon']}>
            {getStatusIcon(toolCall.status)}
          </span>
          <span className={styles['paper-chat-tool-call__tool-name']}>
            {toolCall.serverName ? `${toolCall.serverName}__${toolCall.name}` : toolCall.name}
          </span>
        </span>
        <span className={styles['paper-chat-tool-call__header-right']}>
          <span className={styles['paper-chat-tool-call__status-text']}>
            {getStatusText(toolCall.status)}
          </span>
          {timeCost && (
            <span className={styles['paper-chat-tool-call__execution-time']}>{timeCost}</span>
          )}
          <span className={styles['paper-chat-tool-call__expand-icon']}>▶</span>
        </span>
      </button>

      {expanded && (
        <div className={styles['paper-chat-tool-call__content']}>
          {paramsText && (
            <section className={styles['paper-chat-tool-call__section']}>
              <div className={styles['paper-chat-tool-call__section-header']}>
                <span className={styles['paper-chat-tool-call__section-title']}>参数</span>
              </div>
              <pre
                className={`${styles['paper-chat-tool-call__code']} ${styles['paper-chat-tool-call__params']}`}
              >
                {paramsText}
              </pre>
            </section>
          )}

          {(resultText || toolCall.error) && (
            <section className={styles['paper-chat-tool-call__section']}>
              <div className={styles['paper-chat-tool-call__section-header']}>
                <span className={styles['paper-chat-tool-call__section-title']}>结果</span>
              </div>
              <pre
                className={`${styles['paper-chat-tool-call__code']} ${
                  toolCall.status === 'error' ? styles.error : styles.success
                } ${styles['paper-chat-tool-call__result']}`}
              >
                {toolCall.error || resultText}
              </pre>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
