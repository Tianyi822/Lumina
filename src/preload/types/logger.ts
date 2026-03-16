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
export interface LoggerApi {
  debug: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  info: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  warn: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  error: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  fatal: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  log: (level: number, message: string, context?: Record<string, unknown>) => Promise<LogResult>
  setLevel: (level: number) => Promise<void>
  getConfig: () => Promise<LoggerConfig>
  getLogPath: () => Promise<string>
  LogLevel: LogLevelEnum
}
