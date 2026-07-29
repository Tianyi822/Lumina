import { SessionFactory } from './SessionFactory'
import { SessionData, SessionResourceRef, SessionType } from '@main/types/session'

/**
 * 论文对话会话工厂
 * 用于创建论文阅读类型的会话
 */
export class PaperSessionFactory implements SessionFactory {
  private readonly defaultTitle = '论文对话'

  create(title?: string, _resourceRef?: SessionResourceRef): SessionData {
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

  /**
   * 获取工厂类型
   */
  getType(): SessionType {
    return 'paper'
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
