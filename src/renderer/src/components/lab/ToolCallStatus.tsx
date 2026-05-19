import { useState } from 'react'
import styles from './ToolCallStatus.module.css'

export type ToolStatus = 'pending' | 'running' | 'success' | 'error'

export interface ToolCallInfo {
  id: string
  name: string
  params: Record<string, unknown>
  status: ToolStatus
  result?: unknown
  error?: string
  startTime?: string
  endTime?: string
}

interface ToolCallStatusProps {
  toolCall: ToolCallInfo
  onToggleExpand?: () => void
}

function statusIcon(status: ToolStatus): string {
  switch (status) {
    case 'pending':
      return '⏳'
    case 'running':
      return '▶️'
    case 'success':
      return '✓'
    case 'error':
      return '✗'
    default:
      return '•'
  }
}

function statusText(status: ToolStatus): string {
  switch (status) {
    case 'pending':
      return '等待执行'
    case 'running':
      return '执行中'
    case 'success':
      return '成功'
    case 'error':
      return '失败'
    default:
      return status
  }
}

export default function ToolCallStatus({ toolCall, onToggleExpand }: ToolCallStatusProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  function toggleExpand(): void {
    setIsExpanded((prev) => !prev)
    onToggleExpand?.()
  }

  return (
    <div className={`${styles['tool-call-status']} ${styles[`status-${toolCall.status}`]}`}>
      <div className={styles['status-header']} onClick={toggleExpand}>
        <span className={styles['status-icon']}>{statusIcon(toolCall.status)}</span>
        <span className={styles['status-name']}>{toolCall.name}</span>
        <span className={styles['status-text']}>{statusText(toolCall.status)}</span>
      </div>
      {isExpanded && (
        <div className={styles['status-details']}>
          {toolCall.startTime && <div>开始: {toolCall.startTime}</div>}
          {toolCall.endTime && <div>结束: {toolCall.endTime}</div>}
          {toolCall.error && <div className={styles['error-message']}>{toolCall.error}</div>}
        </div>
      )}
    </div>
  )
}
