/**
 * 日志级别的枚举
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
 * 日志级别名称的映射表
 */
export const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL'
}

/**
 * 日志来源的类型
 */
export type LogSource = 'main' | 'renderer'

/**
 * 一条日志记录的完整信息
 */
export interface LogEntry {
  /** 日志产生的时间戳，ISO 格式 */
  timestamp: string
  /** 日志级别 */
  level: LogLevel
  /** 日志级别的名称 */
  levelName: string
  /** 日志消息内容 */
  message: string
  /** 日志来源 */
  source: LogSource
  /** 额外的上下文信息 */
  context?: Record<string, unknown>
}

/**
 * 日志系统的配置选项
 */
export interface LoggerConfig {
  /** 最低记录的日志级别，低于此级别的日志会被忽略 */
  minLevel: LogLevel
  /** 是否在控制台输出日志 */
  enableConsole: boolean
  /** 是否将日志写入文件 */
  enableFile: boolean
}

/**
 * 前端发送日志请求的参数
 */
export interface LogRequest {
  /** 日志级别 */
  level: LogLevel
  /** 日志消息内容 */
  message: string
  /** 额外的上下文信息 */
  context?: Record<string, unknown>
}

/**
 * 日志写入操作的结果
 */
export interface LogResult {
  /** 日志是否写入成功 */
  success: boolean
  /** 写入失败时的错误信息 */
  error?: string
}
