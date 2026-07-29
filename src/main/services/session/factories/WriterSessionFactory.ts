import type { SessionFactory } from './SessionFactory'
import type { SessionData, SessionResourceRef, SessionType } from '@main/types/session'

/**
 * 写作对话会话工厂
 * 创建绑定写作文档资源引用的独立会话
 */
export class WriterSessionFactory implements SessionFactory {
  private readonly defaultTitle = '写作对话'

  create(title?: string, resourceRef?: SessionResourceRef): SessionData {
    if (!resourceRef || resourceRef.kind !== 'writer') {
      throw new Error('写作会话必须提供 kind 为 writer 的 resourceRef')
    }

    const sessionId = this.generateSessionId()
    const now = new Date().toISOString()
    const sessionTitle = title || this.defaultTitle

    return {
      sessionId,
      title: sessionTitle,
      sessionType: 'writer',
      createdAt: now,
      updatedAt: now,
      messages: [],
      resourceRef: {
        kind: 'writer',
        id: resourceRef.id
      }
    }
  }

  getType(): SessionType {
    return 'writer'
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
