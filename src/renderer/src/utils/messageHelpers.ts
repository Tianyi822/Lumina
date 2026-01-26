import type { ChatMessage, Message, SessionMessage } from '../types'

/**
 * 将 SessionMessage 转换为 Message
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
 * 构建发送给后端的消息历史
 */
export function buildChatMessages(messages: Message[]): ChatMessage[] {
  return messages.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }))
}

/**
 * 深拷贝消息数组
 */
export function deepCopyMessages(messages: Message[]): Message[] {
  return messages.map((msg) => ({ ...msg }))
}
