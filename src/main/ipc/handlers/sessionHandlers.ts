import { ipcMain } from 'electron'
import { sessionService } from '../../services/session'
import { logger } from '../../services/logger'
import { validateSessionTitle } from './sessionValidation'
import type { SessionData, SessionListItem, SessionResult, SessionType } from '../../types/session'

/**
 * 注册会话相关的 IPC 处理程序
 */
export function registerSessionHandlers(): void {
  /**
   * 创建新会话
   */
  ipcMain.handle(
    'session:create',
    async (_, title?: string, type?: SessionType): Promise<SessionResult> => {
      try {
        const validationError = validateSessionTitle(title)
        if (validationError) {
          return { success: false, error: validationError }
        }
        const data = sessionService.createSession(title, type)
        return { success: true, data }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('创建会话失败', 'main', { error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )

  /**
   * 保存会话
   */
  ipcMain.handle('session:save', async (_, data: SessionData): Promise<SessionResult> => {
    try {
      return sessionService.saveSession(data)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存会话失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  /**
   * 加载会话
   */
  ipcMain.handle('session:load', async (_, sessionId: string): Promise<SessionResult> => {
    try {
      const data = sessionService.loadSession(sessionId)
      if (!data) {
        return { success: false, error: '会话不存在' }
      }
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('加载会话失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  /**
   * 获取会话列表
   */
  ipcMain.handle('session:list', async (): Promise<SessionListItem[]> => {
    try {
      return sessionService.listSessions()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取会话列表失败', 'main', { error: errorMessage })
      return []
    }
  })

  /**
   * 删除会话
   */
  ipcMain.handle('session:delete', async (_, sessionId: string): Promise<SessionResult> => {
    try {
      return sessionService.deleteSession(sessionId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除会话失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  /**
   * 重命名会话
   */
  ipcMain.handle(
    'session:rename',
    async (_, sessionId: string, newTitle: string): Promise<SessionResult> => {
      try {
        return sessionService.renameSession(sessionId, newTitle)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('重命名会话失败', 'main', { error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )
}
