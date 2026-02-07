import type { StreamEvent } from '@shared/types'

/**
 * 判断流式事件是否已完成
 * 包括正常完成和错误完成
 */
export function isStreamComplete(event: StreamEvent): boolean {
  return event.type === 'done' || event.type === 'error'
}

/**
 * 判断事件是否包含内容
 * 内容类型包括文本、推理、工具调用和工具结果
 */
export function hasContent(event: StreamEvent): boolean {
  return (
    event.type === 'content' ||
    event.type === 'reasoning' ||
    event.type === 'tool_call' ||
    event.type === 'tool_result'
  )
}

/**
 * 获取流式事件的文本内容
 * 用于在界面上展示
 */
export function getEventText(event: StreamEvent): string | null {
  switch (event.type) {
    case 'content':
    case 'reasoning':
      return event.content || null
    case 'tool_call':
      return `调用工具: ${event.toolCall?.name || 'unknown'}`
    case 'tool_result':
      return event.toolResult?.success
        ? `工具结果: ${event.toolResult?.name || 'unknown'}`
        : `工具错误: ${event.toolResult?.error || 'unknown'}`
    default:
      return null
  }
}
