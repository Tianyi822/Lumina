/**
 * 日志级别枚举
 * 按严重程度从低到高排序
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

/**
 * 日志级别名称映射
 */
export const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL'
}

/**
 * 日志来源
 */
export type LogSource = 'main' | 'renderer'

/**
 * 日志条目
 */
export interface LogEntry {
  /** 时间戳 ISO 格式 */
  timestamp: string
  /** 日志级别 */
  level: LogLevel
  /** 日志级别名称 */
  levelName: string
  /** 日志消息 */
  message: string
  /** 日志来源 */
  source: LogSource
  /** 附加上下文信息 */
  context?: Record<string, unknown>
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  /** 最低日志级别，低于此级别的日志将被忽略 */
  minLevel: LogLevel
  /** 是否启用控制台输出 */
  enableConsole: boolean
  /** 是否启用文件输出 */
  enableFile: boolean
}

/**
 * 前端日志请求参数
 */
export interface LogRequest {
  /** 日志级别 */
  level: LogLevel
  /** 日志消息 */
  message: string
  /** 附加上下文信息 */
  context?: Record<string, unknown>
}

/**
 * 日志写入结果
 */
export interface LogResult {
  success: boolean
  error?: string
}
