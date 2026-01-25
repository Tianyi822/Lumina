import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * 日志级别枚举（与主进程保持一致）
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
} as const

/**
 * 日志结果类型
 */
interface LogResult {
  success: boolean
  error?: string
}

/**
 * 日志相关的 API
 */
const loggerApi = {
  /**
   * 记录 DEBUG 级别日志
   */
  debug: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:debug', message, context)
  },

  /**
   * 记录 INFO 级别日志
   */
  info: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:info', message, context)
  },

  /**
   * 记录 WARN 级别日志
   */
  warn: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:warn', message, context)
  },

  /**
   * 记录 ERROR 级别日志
   */
  error: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:error', message, context)
  },

  /**
   * 记录 FATAL 级别日志
   */
  fatal: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:fatal', message, context)
  },

  /**
   * 通用日志记录方法
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
   * 获取当前日志配置
   */
  getConfig: (): Promise<{
    minLevel: number
    enableConsole: boolean
    enableFile: boolean
  }> => {
    return ipcRenderer.invoke('logger:getConfig')
  },

  /**
   * 获取当前日志文件路径
   */
  getLogPath: (): Promise<string> => {
    return ipcRenderer.invoke('logger:getLogPath')
  },

  /**
   * 日志级别常量
   */
  LogLevel
}

/**
 * 配置相关的 API
 */
const configApi = {
  /**
   * 获取配置加载状态
   */
  getStatus: (): Promise<{
    loaded: boolean
    success: boolean
    error: string | null
    exists: boolean
  }> => {
    return ipcRenderer.invoke('config:getStatus')
  },

  /**
   * 获取配置
   */
  getConfig: (): Promise<unknown> => {
    return ipcRenderer.invoke('config:get')
  },

  /**
   * 获取配置加载结果
   */
  getLoadResult: (): Promise<{
    success: boolean
    config: unknown
    error?: string
  }> => {
    return ipcRenderer.invoke('config:getLoadResult')
  },

  /**
   * 保存配置
   */
  saveConfig: (config: unknown): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('config:save', config)
  },

  /**
   * 更新配置（部分更新）
   */
  updateConfig: (partialConfig: unknown): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('config:update', partialConfig)
  },

  /**
   * 检查配置是否存在
   */
  exists: (): Promise<boolean> => {
    return ipcRenderer.invoke('config:exists')
  }
}

// 自定义渲染器 API
const api = {
  config: configApi,
  logger: loggerApi
}

// 使用 `contextBridge` API 向渲染器暴露 Electron API
// 仅在启用了上下文隔离时使用，否则直接添加到 DOM 全局对象
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (在 dts 中定义)
  window.electron = electronAPI
  // @ts-ignore (在 dts 中定义)
  window.api = api
}
