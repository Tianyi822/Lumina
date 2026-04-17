import { SessionFactory } from './SessionFactory'
import { SessionData, SessionType } from '@main/types/session'

export class PaperSessionFactory implements SessionFactory {
  private readonly defaultTitle = '论文对话'

  create(title?: string): SessionData {
    const sessionId = this.generateSessionId()
    const now = new Date().toISOString()
    const sessionTitle = title || this.defaultTitle

    return {
      sessionId,
      title: sessionTitle,
      sessionType: 'paper',
      createdAt: now,
      updatedAt: now,
      messages: []
    }
  }

  getType(): SessionType {
    return 'paper'
  }

  private generateSessionId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `session-${timestamp}-${random}`
  }
}
