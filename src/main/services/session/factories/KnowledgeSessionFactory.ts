import { SessionFactory } from './SessionFactory'
import { SessionData, SessionType } from '@main/types/session'

export class KnowledgeSessionFactory implements SessionFactory {
  private readonly defaultTitle = '知识库查询'

  create(title?: string): SessionData {
    const sessionId = this.generateSessionId()
    const now = new Date().toISOString()
    const sessionTitle = title || this.defaultTitle

    return {
      sessionId,
      title: sessionTitle,
      sessionType: 'knowledge',
      createdAt: now,
      updatedAt: now,
      messages: []
    }
  }

  getType(): SessionType {
    return 'knowledge'
  }

  private generateSessionId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `session-${timestamp}-${random}`
  }
}
