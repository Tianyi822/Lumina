import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { SessionData, SessionListItem, SessionMessage, SessionResult } from '@main/types/session'
import { logger } from '@main/services/logger'
import {
  getDataDirPath,
  getSessionFilePath,
  isValidSessionId,
  isPathInDataDir,
  extractSessionIdFromFileName,
  sanitizeFileName
} from './sessionPaths'

/**
 * 生成唯一的会话 ID
 */
function generateSessionId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `session-${timestamp}-${random}`
}

/**
 * 从消息内容生成会话标题
 */
function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim()
  if (trimmed.length <= 20) {
    return trimmed || '新对话'
  }
  return trimmed.substring(0, 20) + '...'
}

/**
 * 会话服务
 * 负责会话的创建、保存、加载和管理
 */
export class SessionService {
  private initialized: boolean = false

  /**
   * 确保数据目录存在
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
   * @param title 可选的会话标题，如果不提供则使用默认标题
   */
  createSession(title?: string): SessionData {
    this.ensureDataDir()

    const sessionId = generateSessionId()
    const now = new Date().toISOString()
    const sessionTitle = title || '新对话'

    const session: SessionData = {
      sessionId,
      title: sessionTitle,
      createdAt: now,
      updatedAt: now,
      messages: []
    }

    // 保存会话文件
    this.saveSession(session)

    logger.info('会话创建成功', 'main', { sessionId, title: sessionTitle })
    return session
  }

  /**
   * 保存会话
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
   * 删除同一 sessionId 的旧文件（用于标题更新时）
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

          // 获取最后一条消息预览
          let lastMessage: string | undefined
          if (session.messages && session.messages.length > 0) {
            const lastMsg = session.messages[session.messages.length - 1]
            lastMessage = lastMsg.content.substring(0, 50)
            if (lastMsg.content.length > 50) {
              lastMessage += '...'
            }
          }

          sessions.push({
            sessionId: session.sessionId,
            title: session.title,
            description: session.description,
            lastMessage,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
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
   * 删除会话
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
   * @param sessionId 会话 ID
   * @param firstMessage 第一条用户消息
   */
  updateSessionTitleFromMessage(sessionId: string, firstMessage: string): SessionResult {
    const newTitle = generateTitle(firstMessage)
    return this.renameSession(sessionId, newTitle)
  }

  /**
   * 向会话添加消息并保存
   * @param sessionId 会话 ID
   * @param message 新消息
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
