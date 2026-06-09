import { SessionFactory } from './SessionFactory'
import { SessionData, SessionType } from '@main/types/session'

/**
 * 知识库会话工厂
 * 用于创建知识库查询类型的会话
 */
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

  /**
   * 获取工厂类型
   */
  getType(): SessionType {
    return 'knowledge'
  }

  /**
   * 生成会话 ID
   * 格式: session-{timestamp}-{random}
   */
  private generateSessionId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `session-${timestamp}-${random}`
  }
}
