import { existsSync, mkdirSync } from 'fs'
import { appendFile } from 'fs/promises'
import { LogLevel, LogLevelNames } from '@main/types/logger'
import type { LogSource, LogEntry, LoggerConfig, LogResult } from '@main/types/logger'
import { getLogDirPath, getLogFilePath, formatDateForFilename, isLogPathSafe } from './loggerPaths'

// 最大日志消息长度（10KB）
const MAX_MESSAGE_LENGTH = 10 * 1024

function hasUnreadableText(value: string): boolean {
  return value.includes('\uFFFD') || value.includes('锟斤拷') || value.includes('���')
}

function sanitizeLogText(value: string): string {
  if (!hasUnreadableText(value)) {
    return value
  }

  if (value.toLowerCase().includes('docker')) {
    return 'Docker 命令输出无法正确解码，已隐藏原始乱码。'
  }

  return '文本包含无法正确解码的内容，已隐藏原始乱码。'
}

function sanitizeLogValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeLogText(value)
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeLogValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeLogValue(item)
      ])
    )
  }

  return value
}

// 日志管理器
// 负责日志的记录、格式化和输出
// 支持控制台输出和文件输出，支持日志级别过滤和日期轮转
export class Logger {
  private config: LoggerConfig
  private currentLogDate: string
  private currentLogPath: string
  private writeQueue: Promise<void> = Promise.resolve()
  private initialized: boolean = false

  constructor() {
    // 根据环境设置默认配置
    const isDev = process.env.NODE_ENV === 'development'

    this.config = {
      minLevel: isDev ? LogLevel.DEBUG : LogLevel.INFO,
      enableConsole: isDev, // 开发环境启用控制台输出
      enableFile: true // 始终启用文件输出
    }

    this.currentLogDate = formatDateForFilename()
    this.currentLogPath = getLogFilePath()
  }

  // 初始化日志系统
  // 确保日志目录存在
  initialize(): void {
    if (this.initialized) return

    try {
      this.ensureLogDir()
      this.initialized = true
      this.info('日志系统初始化完成', 'main')
    } catch (error) {
      console.error('日志系统初始化失败:', error)
    }
  }

  // 确保日志目录存在
  private ensureLogDir(): void {
    const logDir = getLogDirPath()
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
  }

  // 检查并更新日志文件（日期轮转）
  // 当日期变化时，自动切换到新的日志文件
  private checkAndRotateLogFile(): void {
    const today = formatDateForFilename()
    if (today !== this.currentLogDate) {
      this.currentLogDate = today
      this.currentLogPath = getLogFilePath()
    }
  }

  // 格式化时间戳
  private formatTimestamp(date: Date = new Date()): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    const ms = String(date.getMilliseconds()).padStart(3, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`
  }

  // 安全序列化 context 对象
  // 如果对象无法序列化，返回错误提示字符串
  private serializeContext(context?: Record<string, unknown>): string {
    if (!context) return ''

    try {
      return JSON.stringify(sanitizeLogValue(context))
    } catch {
      return '[无法序列化的对象]'
    }
  }

  // 格式化日志条目为字符串
  private formatLogEntry(entry: LogEntry): string {
    const contextStr = entry.context ? ` ${this.serializeContext(entry.context)}` : ''
    return `[${entry.timestamp}] [${entry.levelName}] [${entry.source}] ${entry.message}${contextStr}`
  }

  // 输出到控制台
  // 根据日志级别选择不同的控制台方法
  private logToConsole(entry: LogEntry): void {
    const formattedMessage = this.formatLogEntry(entry)

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage)
        break
      case LogLevel.INFO:
        console.info(formattedMessage)
        break
      case LogLevel.WARN:
        console.warn(formattedMessage)
        break
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formattedMessage)
        break
    }
  }

  // 异步写入日志文件
  // 使用队列确保写入顺序，支持日期轮转和路径安全验证
  private async writeToFile(entry: LogEntry): Promise<void> {
    // 检查日期轮转
    this.checkAndRotateLogFile()

    // 验证路径安全性
    if (!isLogPathSafe(this.currentLogPath)) {
      console.error('日志路径不安全，拒绝写入')
      return
    }

    const logLine = this.formatLogEntry(entry) + '\n'

    // 使用队列确保写入顺序
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await appendFile(this.currentLogPath, logLine, 'utf-8')
      } catch (error) {
        // 如果目录不存在，尝试创建
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          this.ensureLogDir()
          await appendFile(this.currentLogPath, logLine, 'utf-8')
        } else {
          console.error('写入日志文件失败:', error)
        }
      }
    })

    await this.writeQueue
  }

  // 截断过长的消息
  private truncateMessage(message: string): string {
    if (message.length > MAX_MESSAGE_LENGTH) {
      return message.substring(0, MAX_MESSAGE_LENGTH) + '...[消息被截断]'
    }
    return message
  }

  // 记录日志
  // 根据配置决定输出到控制台和文件
  // 支持日志级别过滤，低于最低级别的日志不会被记录
  async log(
    level: LogLevel,
    message: string,
    source: LogSource = 'main',
    context?: Record<string, unknown>
  ): Promise<LogResult> {
    // 级别过滤
    if (level < this.config.minLevel) {
      return { success: true }
    }

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      levelName: LogLevelNames[level],
      message: this.truncateMessage(sanitizeLogText(message)),
      source,
      context
    }

    try {
      // 控制台输出
      if (this.config.enableConsole) {
        this.logToConsole(entry)
      }

      // 文件输出
      if (this.config.enableFile) {
        await this.writeToFile(entry)
      }

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('日志记录失败:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  // 记录 DEBUG 级别日志
  debug(message: string, source: LogSource = 'main', context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, source, context)
  }

  // 记录 INFO 级别日志
  info(message: string, source: LogSource = 'main', context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, source, context)
  }

  // 记录 WARN 级别日志
  warn(message: string, source: LogSource = 'main', context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, source, context)
  }

  // 记录 ERROR 级别日志
  error(message: string, source: LogSource = 'main', context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, source, context)
  }

  // 记录 FATAL 级别日志
  fatal(message: string, source: LogSource = 'main', context?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, source, context)
  }

  // 设置最低日志级别
  // 只有大于等于此级别的日志才会被记录
  setMinLevel(level: LogLevel): void {
    this.config.minLevel = level
  }

  // 获取当前配置
  getConfig(): LoggerConfig {
    return { ...this.config }
  }

  // 更新配置
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // 获取当前日志文件路径
  getCurrentLogPath(): string {
    return this.currentLogPath
  }
}
