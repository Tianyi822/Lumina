import { join } from 'path'
import { getConfigDirPath } from '../config/configPaths'

// 数据目录名称
const DATA_DIR_NAME = 'sessions'

// 获取数据目录路径
export function getDataDirPath(): string {
  return join(getConfigDirPath(), DATA_DIR_NAME)
}

// 生成 JSONL 会话文件名
// 文件名只含 sessionId，标题变更不再引起文件改名
export function getSessionJsonlFileName(sessionId: string): string {
  return `${sessionId}.jsonl`
}

// 清理文件名中的非法字符
// 移除特殊字符，替换空格，限制长度；纯空白回退为 untitled
export function sanitizeFileName(name: string): string {
  return (
    name
      .trim() // 先去首尾空白，避免纯空白被转成下划线
      .replace(/[/\\?%*:|"<>]/g, '') // 移除非法字符
      .replace(/\s+/g, '_') // 空格转下划线
      .substring(0, 50) || 'untitled'
  ) // 限制长度
}

// 验证 sessionId 是否合法（防止路径遍历攻击）
// sessionId 格式: session-{timestamp}-{random}
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

// 从文件名中提取 sessionId
// 文件名格式: session-{timestamp}-{random}-{title}.json
export function extractSessionIdFromFileName(fileName: string): string | null {
  // 文件名格式: session-{timestamp}-{random}-{title}.json
  const match = fileName.match(/^(session-\d+-[a-z0-9]+)-.*\.json$/)
  return match ? match[1] : null
}
