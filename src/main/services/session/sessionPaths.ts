import { join, normalize, basename } from 'path'
import { getConfigDirPath } from '../config/configPaths'

/**
 * 数据目录名称
 */
export const DATA_DIR_NAME = 'sessions'

/**
 * 获取数据目录路径
 */
export function getDataDirPath(): string {
  return join(getConfigDirPath(), DATA_DIR_NAME)
}

/**
 * 清理文件名中的非法字符
 * @param name 原始名称
 * @returns 安全的文件名
 */
export function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[/\\?%*:|"<>]/g, '') // 移除非法字符
      .replace(/\s+/g, '_') // 空格转下划线
      .substring(0, 50) || 'untitled'
  ) // 限制长度
}

/**
 * 验证 sessionId 是否合法（防止路径遍历攻击）
 * @param sessionId 会话 ID
 * @returns 是否合法
 */
export function isValidSessionId(sessionId: string): boolean {
  // sessionId 格式: session-{timestamp}-{random}
  const pattern = /^session-\d+-[a-z0-9]+$/
  if (!pattern.test(sessionId)) {
    return false
  }

  // 额外检查：确保没有路径分隔符
  if (sessionId.includes('/') || sessionId.includes('\\') || sessionId.includes('..')) {
    return false
  }

  return true
}

/**
 * 生成会话文件路径
 * @param sessionId 会话 ID
 * @param title 会话标题
 * @returns 完整文件路径
 */
export function getSessionFilePath(sessionId: string, title: string): string {
  const safeTitle = sanitizeFileName(title)
  const fileName = `${sessionId}-${safeTitle}.json`
  return join(getDataDirPath(), fileName)
}

/**
 * 验证文件路径是否在数据目录内（防止路径遍历）
 * @param filePath 要验证的文件路径
 * @returns 是否安全
 */
export function isPathInDataDir(filePath: string): boolean {
  const dataDir = getDataDirPath()
  const normalizedPath = normalize(filePath)
  const normalizedDataDir = normalize(dataDir)

  // 确保路径在数据目录内
  if (!normalizedPath.startsWith(normalizedDataDir)) {
    return false
  }

  // 确保文件名不包含路径分隔符（防止子目录遍历）
  const fileName = basename(normalizedPath)
  if (fileName !== basename(filePath.split('/').pop() || '')) {
    return false
  }

  return true
}

/**
 * 从文件名中提取 sessionId
 * @param fileName 文件名
 * @returns sessionId 或 null
 */
export function extractSessionIdFromFileName(fileName: string): string | null {
  // 文件名格式: session-{timestamp}-{random}-{title}.json
  const match = fileName.match(/^(session-\d+-[a-z0-9]+)-.*\.json$/)
  return match ? match[1] : null
}
