import { SessionFactory } from './SessionFactory'
import { SessionData, SessionType } from '@main/types/session'

// 默认会话工厂
// 用于创建标准对话类型的会话
export class DefaultSessionFactory implements SessionFactory {
  create(title?: string): SessionData {
    const sessionId = this.generateSessionId()
    const now = new Date().toISOString()
    const sessionTitle = title || '新对话'

    return {
      sessionId,
      title: sessionTitle,
      sessionType: 'default',
      createdAt: now,
      updatedAt: now,
      messages: []
    }
  }

  getType(): SessionType {
    return 'default'
  }

  // 生成会话 ID
  // 格式: session-{timestamp}-{random}
  private generateSessionId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `session-${timestamp}-${random}`
  }
}
