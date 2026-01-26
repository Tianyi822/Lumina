/**
 * 深拷贝消息数组
 */
export function deepCopyMessages<T>(messages: T[]): T[] {
  return messages.map((msg) => ({ ...msg }))
}

/**
 * 截断文本到指定长度
 */
export function truncateText(text: string, maxLength: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) {
    return trimmed || '新对话'
  }
  return trimmed.substring(0, maxLength) + '...'
}

/**
 * 清理文件名，移除不安全字符
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '') // 移除不安全字符
    .replace(/\s+/g, '_') // 空格替换为下划线
    .substring(0, 200) // 限制长度
}
