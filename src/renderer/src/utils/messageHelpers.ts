import type { Message, ChatMessage } from '../types'
import type { SessionMessage } from '@shared/types'

/**
 * 将 SessionMessage 转换为 Message（UI 层特有）
 */
export function sessionMessageToMessage(msg: SessionMessage): Message {
  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    reasoning: msg.reasoning,
    timestamp: msg.timestamp,
    modelName: msg.modelName,
    usage: msg.usage,
    isStreaming: false
  }
}

/**
 * 构建发送给后端的消息历史（UI 层特有）
 * 过滤掉 content 为空的助手消息，避免 API 报错
 */
export function buildChatMessages(messages: Message[]): ChatMessage[] {
  return messages
    .filter((msg) => {
      // 过滤掉 content 为空的助手消息（保留有 tool_calls 的助手消息）
      if (msg.role === 'assistant') {
        const hasContent = msg.content && msg.content.trim().length > 0
        const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0
        return hasContent || hasToolCalls
      }
      return true
    })
    .map((msg) => ({
      role: msg.role,
      content: msg.content
    }))
}

/**
 * 深拷贝消息数组（UI 层特有）
 */
export function deepCopyMessages(messages: Message[]): Message[] {
  return messages.map((msg) => ({ ...msg }))
}

// 重新导出共享工具函数（供主进程使用）
export {
  sessionToChatMessage,
  buildChatMessages as buildChatMessagesFromSession
} from '@shared/utils'
