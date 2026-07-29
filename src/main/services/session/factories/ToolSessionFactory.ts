import { SessionFactory } from './SessionFactory'
import { SessionData, SessionResourceRef, SessionType } from '@main/types/session'

/**
 * 工具会话工厂
 * 用于创建工具调用类型的会话
 */
export class ToolSessionFactory implements SessionFactory {
  private readonly defaultTitle = '工具对话'

  create(title?: string, _resourceRef?: SessionResourceRef): SessionData {
    const sessionId = this.generateSessionId()
    const now = new Date().toISOString()
    const sessionTitle = title || this.defaultTitle

    return {
      sessionId,
      title: sessionTitle,
      sessionType: 'tool',
      createdAt: now,
      updatedAt: now,
      messages: []
    }
  }

  /**
   * 获取工厂类型
   */
  getType(): SessionType {
    return 'tool'
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
