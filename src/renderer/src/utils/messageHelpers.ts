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
 */
export function buildChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map((msg) => ({
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
export { sessionToChatMessage, buildChatMessages as buildChatMessagesFromSession } from '@shared/utils'
