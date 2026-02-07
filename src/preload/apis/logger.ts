import { ipcRenderer } from 'electron'

/**
 * 日志级别常量，与主进程保持一致
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
} as const

/**
 * 日志记录的结果
 */
export interface LogResult {
  success: boolean
  error?: string
}

/**
 * 日志系统的配置
 */
export interface LoggerConfig {
  minLevel: number
  enableConsole: boolean
  enableFile: boolean
}

/**
 * 日志相关的 API
 */
export const loggerApi = {
  /**
   * 记录 DEBUG 级别的日志
   */
  debug: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:debug', message, context)
  },

  /**
   * 记录 INFO 级别的日志
   */
  info: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:info', message, context)
  },

  /**
   * 记录 WARN 级别的日志
   */
  warn: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:warn', message, context)
  },

  /**
   * 记录 ERROR 级别的日志
   */
  error: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:error', message, context)
  },

  /**
   * 记录 FATAL 级别的日志
   */
  fatal: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:fatal', message, context)
  },

  /**
   * 通用的日志记录方法
   */
  log: (
    level: (typeof LogLevel)[keyof typeof LogLevel],
    message: string,
    context?: Record<string, unknown>
  ): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:log', { level, message, context })
  },

  /**
   * 设置最低日志级别
   */
  setLevel: (level: (typeof LogLevel)[keyof typeof LogLevel]): Promise<void> => {
    return ipcRenderer.invoke('logger:setLevel', level)
  },

  /**
   * 获取当前的日志配置
   */
  getConfig: (): Promise<LoggerConfig> => {
    return ipcRenderer.invoke('logger:getConfig')
  },

  /**
   * 获取当前日志文件的路径
   */
  getLogPath: (): Promise<string> => {
    return ipcRenderer.invoke('logger:getLogPath')
  },

  /**
   * 日志级别常量
   */
  LogLevel
}
