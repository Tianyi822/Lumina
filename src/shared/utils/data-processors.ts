/**
 * 深拷贝消息数组
 */
export function deepCopyMessages<T>(messages: T[]): T[] {
  return messages.map((msg) => ({ ...msg }))
}

/**
 * 深度克隆对象
 * 优先使用 structuredClone（性能更好且支持更多类型），不支持则降级到 JSON 序列化
 */
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== 'undefined') {
    try {
      return structuredClone(obj)
    } catch (error) {
      // structuredClone 可能无法克隆某些对象（如包含循环引用的对象）
      // 在这种情况下，回退到 JSON 序列化
      console.warn('structuredClone failed, falling back to JSON serialization', error)
      return JSON.parse(JSON.stringify(obj))
    }
  }
  return JSON.parse(JSON.stringify(obj))
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
