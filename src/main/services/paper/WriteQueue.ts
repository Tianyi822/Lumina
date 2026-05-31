/**
 * 按 key 隔离的异步写操作队列
 * 确保同一 key（如 paperId）的写操作串行执行，避免 read-then-write 竞态
 */
export class WriteQueue {
  private queues = new Map<string, Promise<unknown>>()

  /**
   * 将写操作入队
   * 同一 key 的操作会串行执行，不同 key 的操作互不影响
   */
  async enqueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve()
    const next = prev.then(fn, fn) // 前一个失败不阻塞后续操作
    this.queues.set(key, next)
    try {
      return await next
    } finally {
      // 清理已完成的队列引用，防止内存泄漏
      if (this.queues.get(key) === next) {
        this.queues.delete(key)
      }
    }
  }
}
