import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { readFile as readFileAsync, readdir as readdirAsync } from 'fs/promises'
import { join } from 'path'
import {
  SessionData,
  SessionListItem,
  SessionMessage,
  SessionResourceRef,
  SessionResult,
  SessionType
} from '@main/types/session'
import { logger } from '@main/services/logger'
import {
  getDataDirPath,
  getSessionFilePath,
  isValidSessionId,
  isPathInDataDir,
  extractSessionIdFromFileName,
  sanitizeFileName
} from './sessionPaths'
import { SessionFactoryRegistry } from './factories'

/**
 * 从消息内容生成会话标题
 * 如果消息长度超过20个字符，截取前20个字符并添加省略号
 * @param firstMessage 首条消息内容
 * @returns 生成的标题
 */
function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim()
  if (trimmed.length <= 20) {
    return trimmed || '新对话'
  }
  return trimmed.substring(0, 20) + '...'
}

const SESSION_ASYNC_YIELD_INTERVAL = 10

/**
 * 主线程让出执行权，避免长时间同步任务阻塞 Electron 响应
 */
async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

/**
 * 会话服务
 * 负责会话的创建、保存、加载和管理
 * 支持多种会话类型，通过工厂模式创建不同类型的会话
 */
export class SessionService {
  private initialized: boolean = false
  private registry: SessionFactoryRegistry = SessionFactoryRegistry.getInstance()

  /**
   * 确保数据目录存在，不存在则创建
   */
  private ensureDataDir(): void {
    const dataDir = getDataDirPath()
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
      logger.info('数据目录创建成功', 'main', { path: dataDir })
    }
  }

  /**
   * 初始化会话服务
   * 确保数据目录存在
   */
  initialize(): void {
    if (this.initialized) {
      return
    }

    try {
      this.ensureDataDir()
      this.initialized = true
      logger.info('会话服务初始化成功')
    } catch (error) {
      const errorMessage = `会话服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /**
   * 创建新会话
   * 通过工厂模式创建不同类型的会话对象并持久化
   * @param title 可选会话标题
   * @param sessionType 会话类型
   * @param resourceRef 可选资源引用（写作会话绑定文档）
   */
  createSession(
    title?: string,
    sessionType?: SessionType,
    resourceRef?: SessionResourceRef
  ): SessionData {
    this.ensureDataDir()

    const factory = this.registry.getFactoryOrDefault(sessionType)
    const session = factory.create(title, resourceRef)

    this.saveSession(session)

    logger.info('会话创建成功', 'main', {
      sessionId: session.sessionId,
      title: session.title,
      type: session.sessionType,
      resourceRef: session.resourceRef
    })
    return session
  }

  /**
   * 保存会话
   * 将会话数据持久化到文件系统
   * 每次保存都会更新文件名（包含标题），并删除旧文件
   * @param data 会话数据
   */
  saveSession(data: SessionData): SessionResult {
    try {
      // 验证 sessionId
      if (!isValidSessionId(data.sessionId)) {
        const error = '无效的会话 ID'
        logger.warn(error, 'main', { sessionId: data.sessionId })
        return { success: false, error }
      }

      this.ensureDataDir()

      // 生成文件路径
      const filePath = getSessionFilePath(data.sessionId, data.title)

      // 验证路径安全性
      if (!isPathInDataDir(filePath)) {
        const error = '不安全的文件路径'
        logger.warn(error, 'main', { filePath })
        return { success: false, error }
      }

      // 更新时间戳
      data.updatedAt = new Date().toISOString()

      // 删除旧文件（如果标题变了，文件名也会变）
      this.deleteOldSessionFiles(data.sessionId)

      // 写入文件
      const content = JSON.stringify(data, null, 2)
      writeFileSync(filePath, content, 'utf-8')

      logger.debug('会话保存成功', 'main', { sessionId: data.sessionId })
      return { success: true }
    } catch (error) {
      const errorMessage = `会话保存失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 删除同一 sessionId 的旧文件
   * 当会话标题改变时，文件名也会改变，需要删除旧的文件
   * @param sessionId 会话 ID
   */
  private deleteOldSessionFiles(sessionId: string): void {
    try {
      const dataDir = getDataDirPath()
      if (!existsSync(dataDir)) {
        return
      }

      const files = readdirSync(dataDir)
      for (const file of files) {
        if (file.startsWith(sessionId + '-') && file.endsWith('.json')) {
          const filePath = join(dataDir, file)
          if (isPathInDataDir(filePath)) {
            unlinkSync(filePath)
          }
        }
      }
    } catch (error) {
      // 删除旧文件失败不影响保存操作
      logger.warn('删除旧会话文件失败', 'main', { sessionId, error: String(error) })
    }
  }

  /**
   * 加载会话
   * 从文件系统中读取会话数据
   * @param sessionId 会话 ID
   */
  loadSession(sessionId: string): SessionData | null {
    try {
      // 验证 sessionId
      if (!isValidSessionId(sessionId)) {
        logger.warn('无效的会话 ID', 'main', { sessionId })
        return null
      }

      const dataDir = getDataDirPath()
      if (!existsSync(dataDir)) {
        return null
      }

      // 查找匹配的文件
      const files = readdirSync(dataDir)
      const matchingFile = files.find(
        (file) => file.startsWith(sessionId + '-') && file.endsWith('.json')
      )

      if (!matchingFile) {
        logger.debug('会话文件不存在', 'main', { sessionId })
        return null
      }

      const filePath = join(dataDir, matchingFile)

      // 验证路径安全性
      if (!isPathInDataDir(filePath)) {
        logger.warn('不安全的文件路径', 'main', { filePath })
        return null
      }

      const content = readFileSync(filePath, 'utf-8')
      const session = JSON.parse(content) as SessionData

      logger.debug('会话加载成功', 'main', { sessionId })
      return session
    } catch (error) {
      const errorMessage = `会话加载失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return null
    }
  }

  /**
   * 列出所有会话
   * @returns 会话列表，按创建时间倒序排列
   */
  listSessions(): SessionListItem[] {
    try {
      const dataDir = getDataDirPath()
      if (!existsSync(dataDir)) {
        return []
      }

      const files = readdirSync(dataDir)
      const sessions: SessionListItem[] = []

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue
        }

        const sessionId = extractSessionIdFromFileName(file)
        if (!sessionId) {
          continue
        }

        try {
          const filePath = join(dataDir, file)
          if (!isPathInDataDir(filePath)) {
            continue
          }

          const content = readFileSync(filePath, 'utf-8')
          const session = JSON.parse(content) as SessionData

          sessions.push({
            sessionId: session.sessionId,
            title: session.title,
            sessionType: session.sessionType || 'default',
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            resourceRef: session.resourceRef
          })
        } catch {
          // 跳过无法解析的文件
          logger.warn('无法解析会话文件', 'main', { file })
        }
      }

      // 按创建时间倒序排列
      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      return sessions
    } catch (error) {
      const errorMessage = `获取会话列表失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return []
    }
  }

  /**
   * 异步加载全部会话
   * 用于长耗时批处理场景，避免在主进程内持续阻塞事件循环
   */
  async loadAllSessionsAsync(): Promise<SessionData[]> {
    try {
      const sessions: SessionData[] = []

      for await (const session of this.iterateSessionsAsync()) {
        sessions.push(session)
      }

      sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      return sessions
    } catch (error) {
      const errorMessage = `异步加载会话失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return []
    }
  }

  /**
   * 按顺序异步遍历会话
   * 用于流式批处理，避免先将全部会话加载到内存
   * 每处理 SESSION_ASYNC_YIELD_INTERVAL 个文件让出一次事件循环
   */
  async *iterateSessionsAsync(): AsyncGenerator<SessionData, void, void> {
    try {
      const dataDir = getDataDirPath()
      if (!existsSync(dataDir)) {
        return
      }

      const files = await readdirAsync(dataDir)
      let processedCount = 0

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue
        }

        const sessionId = extractSessionIdFromFileName(file)
        if (!sessionId) {
          continue
        }

        const filePath = join(dataDir, file)
        if (!isPathInDataDir(filePath)) {
          continue
        }

        try {
          const content = await readFileAsync(filePath, 'utf-8')
          const session = JSON.parse(content) as SessionData

          yield session

          processedCount++
          if (processedCount % SESSION_ASYNC_YIELD_INTERVAL === 0) {
            await yieldToEventLoop()
          }
        } catch {
          logger.warn('无法解析会话文件', 'main', { file })
        }
      }
    } catch (error) {
      const errorMessage = `异步遍历会话失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
    }
  }

  /**
   * 删除会话
   * 从文件系统中删除会话文件
   * @param sessionId 会话 ID
   */
  deleteSession(sessionId: string): SessionResult {
    try {
      // 验证 sessionId
      if (!isValidSessionId(sessionId)) {
        return { success: false, error: '无效的会话 ID' }
      }

      const dataDir = getDataDirPath()
      if (!existsSync(dataDir)) {
        return { success: false, error: '会话不存在' }
      }

      // 查找并删除匹配的文件
      const files = readdirSync(dataDir)
      let deleted = false

      for (const file of files) {
        if (file.startsWith(sessionId + '-') && file.endsWith('.json')) {
          const filePath = join(dataDir, file)
          if (isPathInDataDir(filePath)) {
            unlinkSync(filePath)
            deleted = true
          }
        }
      }

      if (deleted) {
        logger.info('会话删除成功', 'main', { sessionId })
        return { success: true }
      } else {
        return { success: false, error: '会话不存在' }
      }
    } catch (error) {
      const errorMessage = `会话删除失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 重命名会话
   * 修改会话标题，会话文件也会相应重命名（自动删除旧文件）
   * @param sessionId 会话 ID
   * @param newTitle 新标题
   */
  renameSession(sessionId: string, newTitle: string): SessionResult {
    try {
      // 加载现有会话
      const session = this.loadSession(sessionId)
      if (!session) {
        return { success: false, error: '会话不存在' }
      }

      // 更新标题
      session.title = sanitizeFileName(newTitle) || session.title

      // 保存（会自动删除旧文件并创建新文件）
      return this.saveSession(session)
    } catch (error) {
      const errorMessage = `会话重命名失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 更新会话标题（根据第一条消息自动生成）
   * 当会话首次有消息时，根据消息内容生成标题
   * @param sessionId 会话 ID
   * @param firstMessage 首条消息内容
   */
  updateSessionTitleFromMessage(sessionId: string, firstMessage: string): SessionResult {
    const newTitle = generateTitle(firstMessage)
    return this.renameSession(sessionId, newTitle)
  }

  /**
   * 向会话添加消息并保存
   * @param sessionId 会话 ID
   * @param message 会话消息
   */
  addMessage(sessionId: string, message: SessionMessage): SessionResult {
    try {
      const session = this.loadSession(sessionId)
      if (!session) {
        return { success: false, error: '会话不存在' }
      }

      session.messages.push(message)
      return this.saveSession(session)
    } catch (error) {
      const errorMessage = `添加消息失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }
}
