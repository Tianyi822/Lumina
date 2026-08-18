import type { SessionFactory } from './SessionFactory'
import type { SessionData, SessionResourceRef, SessionType } from '@main/types/session'
import { t } from '@main/services/i18n'

/**
 * 写作对话会话工厂
 * 创建绑定写作文档资源引用的独立会话
 */
export class WriterSessionFactory implements SessionFactory {
  create(title?: string, resourceRef?: SessionResourceRef): SessionData {
    if (!resourceRef || resourceRef.kind !== 'writer') {
      throw new Error(t('notifications.session.writerResourceRefRequired'))
    }

    const sessionId = this.generateSessionId()
    const now = new Date().toISOString()
    // 默认标题为创建期定型文案：创建会话时按当前语言求值，随会话落盘后不随语言切换追溯
    const sessionTitle = title || t('notifications.writer.chatTitle')

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
