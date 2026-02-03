import { SessionFactory } from './SessionFactory'
import { SessionData, SessionType } from '@main/types/session'

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

  private generateSessionId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `session-${timestamp}-${random}`
  }
}
