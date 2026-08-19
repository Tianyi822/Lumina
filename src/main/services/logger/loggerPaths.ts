import { app } from 'electron'
import { join } from 'path'
import { CONFIG_DIR_NAME } from '@main/services/config/configPaths'

// 日志目录名称
const LOGS_DIR_NAME = 'logs'

/**
 * 获取日志目录路径
 * 返回 ~/.lumina/logs/
 */
export function getLogDirPath(): string {
  const homeDir = app.getPath('home')
  return join(homeDir, CONFIG_DIR_NAME, LOGS_DIR_NAME)
}

/**
 * 格式化日期为文件名格式
 * 返回 YYYY-MM-DD 格式的字符串
 * @param date 日期对象，默认当前时间
 */
export function formatDateForFilename(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 获取日志文件路径
 * 返回 ~/.lumina/logs/YYYY-MM-DD.log
 * @param date 日期对象，默认当前时间
 */
export function getLogFilePath(date: Date = new Date()): string {
  const filename = `${formatDateForFilename(date)}.log`
  return join(getLogDirPath(), filename)
}

// 验证日志路径是否安全（防止路径遍历攻击）
// 确保目标路径在日志目录下
export function isLogPathSafe(targetPath: string): boolean {
  const logDir = getLogDirPath()
  // 确保目标路径在日志目录下
  return targetPath.startsWith(logDir)
}
