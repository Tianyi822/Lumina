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
    } catch {
      // structuredClone 无法克隆某些对象（如包含循环引用的对象），
      // 这里静默降级，避免 shared 层引入日志依赖。
      return JSON.parse(JSON.stringify(obj))
    }
  }
  return JSON.parse(JSON.stringify(obj))
}
