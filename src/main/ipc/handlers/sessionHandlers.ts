import { ipcMain } from 'electron'
import { sessionService } from '../../services/session'
import { logger } from '../../services/logger'
import { t } from '@main/services/i18n'
import {
  validateAppendMessages,
  validateSessionMetaPatch,
  validateSessionTitle
} from './sessionValidation'
import type {
  SessionData,
  SessionListItem,
  SessionMessage,
  SessionMetaPatch,
  SessionResourceRef,
  SessionResult,
  SessionType
} from '../../types/session'

/**
 * 注册会话相关的 IPC 处理程序
 */
export function registerSessionHandlers(): void {
  /** 创建新会话 */
  ipcMain.handle(
    'session:create',
    async (
      _,
      title?: string,
      type?: SessionType,
      resourceRef?: SessionResourceRef
    ): Promise<SessionResult> => {
      try {
        const validationError = validateSessionTitle(title)
        if (validationError) {
          return { success: false, error: validationError }
        }
        const data = await sessionService.createSession(title, type, resourceRef)
        return { success: true, data }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('创建会话失败', 'main', { error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )

  /** 全量保存会话（低频：编辑/删除消息、缓存回写） */
  ipcMain.handle('session:save', async (_, data: SessionData): Promise<SessionResult> => {
    try {
      return await sessionService.saveSession(data)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存会话失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  /** 追加一批新消息（高频增量路径） */
  ipcMain.handle(
    'session:appendMessages',
    async (_, sessionId: string, messages: SessionMessage[]): Promise<SessionResult> => {
      try {
        const validationError = validateAppendMessages(messages)
        if (validationError) {
          return { success: false, error: validationError }
        }
        return await sessionService.appendMessages(sessionId, messages)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('追加会话消息失败', 'main', { error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )

  /** 更新会话元数据（标题/选择状态/能力） */
  ipcMain.handle(
    'session:updateMeta',
    async (_, sessionId: string, patch: SessionMetaPatch): Promise<SessionResult> => {
      try {
        const validationError = validateSessionMetaPatch(patch)
        if (validationError) {
          return { success: false, error: validationError }
        }
        return await sessionService.updateMeta(sessionId, patch)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('更新会话元数据失败', 'main', { error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )

  /** 加载会话 */
  ipcMain.handle('session:load', async (_, sessionId: string): Promise<SessionResult> => {
    try {
      const data = await sessionService.loadSession(sessionId)
      if (!data) {
        return { success: false, error: t('notifications.session.sessionNotFound') }
      }
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('加载会话失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  /** 获取会话列表 */
  ipcMain.handle('session:list', async (): Promise<SessionListItem[]> => {
    try {
      return await sessionService.listSessions()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取会话列表失败', 'main', { error: errorMessage })
      return []
    }
  })

  /** 删除会话 */
  ipcMain.handle('session:delete', async (_, sessionId: string): Promise<SessionResult> => {
    try {
      return await sessionService.deleteSession(sessionId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除会话失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  /** 重命名会话 */
  ipcMain.handle(
    'session:rename',
    async (_, sessionId: string, newTitle: string): Promise<SessionResult> => {
      try {
        return await sessionService.renameSession(sessionId, newTitle)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('重命名会话失败', 'main', { error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }
  )
}
