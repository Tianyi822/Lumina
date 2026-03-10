/**
 * 深拷贝消息数组
 * 创建一个新的数组，递归复制其中的嵌套结构
 */
export function deepCopyMessages<T>(messages: T[]): T[] {
  return deepClone(messages)
}

/**
 * 深度克隆对象
 * 优先使用 structuredClone，不支持时降级到 JSON 序列化
 */
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== 'undefined') {
    try {
      return structuredClone(obj)
    } catch (error) {
      // structuredClone 无法克隆某些对象（如包含循环引用的对象）
      // 降级到 JSON 序列化
      console.warn('structuredClone failed, falling back to JSON serialization', error)
      return JSON.parse(JSON.stringify(obj))
    }
  }
  return JSON.parse(JSON.stringify(obj))
}

/**
 * 截断文本到指定长度
 * 超过长度时添加省略号
 */
export function truncateText(text: string, maxLength: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) {
    return trimmed || '新对话'
  }
  return trimmed.substring(0, maxLength) + '...'
}

/**
 * 清理文件名，移除不安全的字符
 * 替换空格并限制长度
 */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 200)
}
