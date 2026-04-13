import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import { LogLevel } from '@main/types/logger'
import type { LogRequest, LogResult } from '@main/types/logger'

/**
 * 初始化日志系统
 */
export function initializeLogger(): void {
  logger.initialize()
}

/**
 * 注册日志相关的 IPC 处理程序
 */
export function registerLoggerHandlers(): void {
  /**
   * 通用日志记录接口
   * 用于前端发送任意级别的日志
   */
  ipcMain.handle('logger:log', async (_event, request: LogRequest): Promise<LogResult> => {
    return await logger.log(request.level, request.message, 'renderer', request.context)
  })

  /**
   * DEBUG 级别日志
   */
  ipcMain.handle(
    'logger:debug',
    async (_event, message: string, context?: Record<string, unknown>): Promise<LogResult> => {
      return await logger.log(LogLevel.DEBUG, message, 'renderer', context)
    }
  )

  /**
   * INFO 级别日志
   */
  ipcMain.handle(
    'logger:info',
    async (_event, message: string, context?: Record<string, unknown>): Promise<LogResult> => {
      return await logger.log(LogLevel.INFO, message, 'renderer', context)
    }
  )

  /**
   * WARN 级别日志
   */
  ipcMain.handle(
    'logger:warn',
    async (_event, message: string, context?: Record<string, unknown>): Promise<LogResult> => {
      return await logger.log(LogLevel.WARN, message, 'renderer', context)
    }
  )

  /**
   * ERROR 级别日志
   */
  ipcMain.handle(
    'logger:error',
    async (_event, message: string, context?: Record<string, unknown>): Promise<LogResult> => {
      return await logger.log(LogLevel.ERROR, message, 'renderer', context)
    }
  )

  /**
   * FATAL 级别日志
   */
  ipcMain.handle(
    'logger:fatal',
    async (_event, message: string, context?: Record<string, unknown>): Promise<LogResult> => {
      return await logger.log(LogLevel.FATAL, message, 'renderer', context)
    }
  )

  /**
   * 设置最低日志级别
   */
  ipcMain.handle('logger:setLevel', (_event, level: LogLevel): void => {
    logger.setMinLevel(level)
  })

  /**
   * 获取当前日志配置
   */
  ipcMain.handle('logger:getConfig', () => {
    return logger.getConfig()
  })

  /**
   * 获取当前日志文件路径
   */
  ipcMain.handle('logger:getLogPath', () => {
    return logger.getCurrentLogPath()
  })
}
