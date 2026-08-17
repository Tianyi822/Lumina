import {
  SessionData,
  SessionListItem,
  SessionMetaPatch,
  SessionMessage,
  SessionResourceRef,
  SessionResult,
  SessionType
} from '@main/types/session'
import { logger } from '@main/services/logger'
import { t } from '@main/services/i18n'
import { isValidSessionId, sanitizeFileName } from './sessionPaths'
import { SessionFactoryRegistry } from './factories'
import { SessionStorageService } from './SessionStorageService'

/**
 * 会话服务（编排门面）
 * 负责校验、工厂创建；持久化委托 SessionStorageService
 */
export class SessionService {
  private initialized = false
  private registry: SessionFactoryRegistry = SessionFactoryRegistry.getInstance()
  private storage: SessionStorageService

  constructor(storage: SessionStorageService = new SessionStorageService()) {
    this.storage = storage
  }

  /** 主进程内部：暴露存储层，供同步引擎复用同一写队列。 */
  getStorage(): SessionStorageService {
    return this.storage
  }

  /** 初始化：委托存储层建目录、恢复 tmp、迁移旧 JSON、确保 index */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    try {
      await this.storage.initialize()
      this.initialized = true
      logger.info('会话服务初始化成功')
    } catch (error) {
      const errorMessage = `会话服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /** 创建新会话并落盘 */
  async createSession(
    title?: string,
    sessionType?: SessionType,
    resourceRef?: SessionResourceRef
  ): Promise<SessionData> {
    const factory = this.registry.getFactoryOrDefault(sessionType)
    const session = factory.create(title, resourceRef)
    await this.storage.rewriteSession(session)
    logger.info('会话创建成功', 'main', {
      sessionId: session.sessionId,
      type: session.sessionType,
      resourceRef: session.resourceRef
    })
    return session
  }

  /** 全量保存（编辑/删除消息、缓存回写等低频场景） */
  async saveSession(data: SessionData): Promise<SessionResult> {
    if (!isValidSessionId(data.sessionId)) {
      logger.warn('无效的会话 ID', 'main', { sessionId: data.sessionId })
      return { success: false, error: t('notifications.session.invalidSessionId') }
    }
    try {
      const normalized: SessionData = { ...data, updatedAt: new Date().toISOString() }
      await this.storage.rewriteSession(normalized)
      return { success: true }
    } catch (error) {
      const errorMessage = `会话保存失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /** 追加一批新消息（增量高频路径） */
  async appendMessages(sessionId: string, messages: SessionMessage[]): Promise<SessionResult> {
    if (!isValidSessionId(sessionId)) {
      return { success: false, error: t('notifications.session.invalidSessionId') }
    }
    try {
      const ok = await this.storage.appendMessages(sessionId, messages)
      return ok
        ? { success: true }
        : { success: false, error: t('notifications.session.sessionNotFound') }
    } catch (error) {
      const errorMessage = `追加消息失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /** 更新会话元数据（标题/选择状态/能力） */
  async updateMeta(sessionId: string, patch: SessionMetaPatch): Promise<SessionResult> {
    if (!isValidSessionId(sessionId)) {
      return { success: false, error: t('notifications.session.invalidSessionId') }
    }
    try {
      const nextPatch: SessionMetaPatch =
        patch.title !== undefined ? { ...patch, title: sanitizeFileName(patch.title) } : patch
      const ok = await this.storage.appendMeta(sessionId, nextPatch)
      return ok
        ? { success: true }
        : { success: false, error: t('notifications.session.sessionNotFound') }
    } catch (error) {
      const errorMessage = `更新会话元数据失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /** 加载会话 */
  async loadSession(sessionId: string): Promise<SessionData | null> {
    if (!isValidSessionId(sessionId)) {
      logger.warn('无效的会话 ID', 'main', { sessionId })
      return null
    }
    return this.storage.loadSession(sessionId)
  }

  /** 会话列表（读 index） */
  async listSessions(): Promise<SessionListItem[]> {
    return this.storage.listSessions()
  }

  /** 删除会话 */
  async deleteSession(sessionId: string): Promise<SessionResult> {
    if (!isValidSessionId(sessionId)) {
      return { success: false, error: t('notifications.session.invalidSessionId') }
    }
    try {
      const ok = await this.storage.deleteSession(sessionId)
      return ok
        ? { success: true }
        : { success: false, error: t('notifications.session.sessionNotFound') }
    } catch (error) {
      const errorMessage = `会话删除失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /** 重命名（内部走 updateMeta，不再改文件名） */
  async renameSession(sessionId: string, newTitle: string): Promise<SessionResult> {
    return this.updateMeta(sessionId, { title: newTitle })
  }

  /** 异步加载全部会话（批处理用，签名兼容旧接口） */
  async loadAllSessionsAsync(): Promise<SessionData[]> {
    const sessions: SessionData[] = []
    for await (const session of this.storage.iterateSessions()) {
      sessions.push(session)
    }
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return sessions
  }

  /** 顺序异步遍历会话（流式批处理，签名兼容旧接口） */
  iterateSessionsAsync(): AsyncGenerator<SessionData, void, void> {
    return this.storage.iterateSessions()
  }
}
