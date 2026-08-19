import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
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

/** 将未知类型的值序列化为可展示的字符串 */
function stringifyValue(value: unknown): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** 工具调用状态文案 key（paper.chat.toolCall.status*） */
const STATUS_KEYS: Record<PaperChatToolCallPanelItem['status'], ParseKeys> = {
  pending: 'paper.chat.toolCall.statusWaiting',
  running: 'paper.chat.toolCall.statusRunning',
  success: 'paper.chat.toolCall.statusSuccess',
  error: 'paper.chat.toolCall.statusError'
}

/** 根据工具状态返回对应的字符图标 */
function getStatusIcon(status: PaperChatToolCallPanelItem['status']): string {
  if (status === 'success') return '✓'
  if (status === 'error') return '!'
  if (status === 'running') return '…'
  return '•'
}

/** 计算工具调用的执行耗时（秒） */
function formatTimeCost(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) return ''
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return ''
  return `${((end - start) / 1000).toFixed(1)}s`
}

/** 单次工具调用的可折叠面板组件，展示状态、参数、结果和执行耗时 */
export default function PaperChatToolCallPanel({ toolCall, index }: PaperChatToolCallPanelProps) {
  const { t } = useTranslation()
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
            {t(STATUS_KEYS[toolCall.status])}
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
                <span className={styles['paper-chat-tool-call__section-title']}>
                  {t('paper.chat.toolCall.params')}
                </span>
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
                <span className={styles['paper-chat-tool-call__section-title']}>
                  {t('paper.chat.toolCall.result')}
                </span>
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
