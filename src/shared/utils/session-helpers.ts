import { truncateText } from './data-processors'

/**
 * 根据第一条消息生成会话标题
 */
export function generateTitle(firstMessage: string): string {
  return truncateText(firstMessage, 20)
}

/**
 * 生成一个新的会话 ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `session-${timestamp}-${random}`
}

/**
 * 验证会话 ID 的格式是否正确
 */
export function isValidSessionId(sessionId: string): boolean {
  return /^session-\d{13}-[a-z0-9]{6}$/.test(sessionId)
}
