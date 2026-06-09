import type { LogResult, LoggerConfig } from '@shared/types/logger'

export type { LogEntry, LogRequest, LogResult, LogSource, LoggerConfig } from '@shared/types/logger'

/**
 * 日志级别常量
 */
export interface LogLevelEnum {
  readonly DEBUG: 0
  readonly INFO: 1
  readonly WARN: 2
  readonly ERROR: 3
  readonly FATAL: 4
}

/**
 * 日志相关的 API
 */
export interface LoggerApi {
  /** 记录 DEBUG 级别日志 */
  debug: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  /** 记录 INFO 级别日志 */
  info: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  /** 记录 WARN 级别日志 */
  warn: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  /** 记录 ERROR 级别日志 */
  error: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  /** 记录 FATAL 级别日志 */
  fatal: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  /** 通用日志记录，可指定日志级别 */
  log: (level: number, message: string, context?: Record<string, unknown>) => Promise<LogResult>
  /** 设置最低日志级别，低于该级别的日志将被过滤 */
  setLevel: (level: number) => Promise<void>
  /** 获取当前的日志配置 */
  getConfig: () => Promise<LoggerConfig>
  /** 获取当前日志文件的路径 */
  getLogPath: () => Promise<string>
  /** 日志级别常量 */
  LogLevel: LogLevelEnum
}
