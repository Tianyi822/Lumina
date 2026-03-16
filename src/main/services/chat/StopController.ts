import { logger } from '../logger'

/**
 * 停止控制器
 * 管理会话的中止状态、停止检查和超时控制
 */
export class StopController {
  private abortControllers: Map<string, AbortController> = new Map()
  private stoppedSessions: Set<string> = new Set()
  private pendingUserInteraction: Set<string> = new Set()
  private sessionKnowledgeBases: Map<string, string[]> = new Map()

  /**
   * 检查会话是否已停止
   */
  isStopped(sessionId: string): boolean {
    return this.stoppedSessions.has(sessionId)
  }

  /**
   * 检查停止状态并在必要时抛出 AbortError
   */
  checkStopped(sessionId: string): void {
    if (this.isStopped(sessionId)) {
      const error = new Error('Request was stopped by user')
      error.name = 'AbortError'
      throw error
    }
  }

  /**
   * 检查会话是否需要用户交互
   */
  isPendingUserInteraction(sessionId: string): boolean {
    return this.pendingUserInteraction.has(sessionId)
  }

  /**
   * 添加用户交互标记
   */
  addPendingUserInteraction(sessionId: string): void {
    this.pendingUserInteraction.add(sessionId)
  }

  /**
   * 删除用户交互标记
   */
  deletePendingUserInteraction(sessionId: string): void {
    this.pendingUserInteraction.delete(sessionId)
  }

  /**
   * 获取会话选中的知识库 ID 列表
   */
  getSelectedKnowledgeBaseIds(sessionId: string): string[] | undefined {
    return this.sessionKnowledgeBases.get(sessionId)
  }

  /**
   * 设置会话选中的知识库 ID 列表
   */
  setSessionKnowledgeBases(sessionId: string, kbIds: string[]): void {
    this.sessionKnowledgeBases.set(sessionId, kbIds)
  }

  /**
   * 获取或创建 AbortController
   */
  getOrCreateAbortController(sessionId: string): AbortController {
    const existingController = this.abortControllers.get(sessionId)
    if (existingController) {
      existingController.abort()
    }

    const abortController = new AbortController()
    this.abortControllers.set(sessionId, abortController)
    return abortController
  }

  /**
   * 获取 AbortController 的 signal
   */
  getAbortSignal(sessionId: string): AbortSignal | undefined {
    return this.abortControllers.get(sessionId)?.signal
  }

  /**
   * 检查 AbortController 是否已中止
   */
  isAborted(sessionId: string): boolean {
    return this.abortControllers.get(sessionId)?.signal.aborted ?? false
  }

  /**
   * 删除 AbortController
   */
  deleteAbortController(sessionId: string): void {
    this.abortControllers.delete(sessionId)
  }

  /**
   * 带超时和停止检查的 Promise 包装器
   * 在执行过程中定期检查是否被中止，同时设置超时限制
   */
  async withTimeoutAndStopCheck<T>(
    promise: Promise<T>,
    sessionId: string,
    timeoutMs: number = 30000,
    operationName: string = 'operation'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} 超时`))
      }, timeoutMs)

      const stopCheckInterval = setInterval(() => {
        if (this.isStopped(sessionId)) {
          clearTimeout(timeoutId)
          clearInterval(stopCheckInterval)
          const error = new Error('Request was stopped by user')
          error.name = 'AbortError'
          reject(error)
        }
      }, 100)

      promise
        .then((result) => {
          clearTimeout(timeoutId)
          clearInterval(stopCheckInterval)
          resolve(result)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          clearInterval(stopCheckInterval)
          reject(error)
        })
    })
  }

  /**
   * 等待指定时间，支持中止和停止检查
   */
  async delayWithAbort(ms: number, sessionId: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup()
        resolve()
      }, ms)

      const onAbort = (): void => {
        cleanup()
        const error = new Error('Request was stopped by user')
        error.name = 'AbortError'
        reject(error)
      }

      const stopCheckInterval = setInterval(() => {
        if (this.isStopped(sessionId)) {
          cleanup()
          const error = new Error('Request was stopped by user')
          error.name = 'AbortError'
          reject(error)
        }
      }, 100)

      const cleanup = (): void => {
        clearTimeout(timeoutId)
        clearInterval(stopCheckInterval)
        signal.removeEventListener('abort', onAbort)
      }

      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  /**
   * 中止请求
   * 可以中止指定会话的请求，或者中止所有请求
   */
  stopRequest(sessionId?: string): void {
    if (sessionId) {
      logger.info('中止会话聊天请求', 'main', { sessionId })
      this.stoppedSessions.add(sessionId)

      const controller = this.abortControllers.get(sessionId)
      if (controller) {
        controller.abort()
        this.abortControllers.delete(sessionId)
      }
    } else {
      if (this.abortControllers.size > 0) {
        logger.info('中止所有聊天请求', 'main', { count: this.abortControllers.size })
        this.abortControllers.forEach((_, sid) => this.stoppedSessions.add(sid))
        this.abortControllers.forEach((controller) => controller.abort())
        this.abortControllers.clear()
      }
    }
  }

  /**
   * 清理会话的停止状态
   */
  clearStoppedSession(sessionId: string): void {
    this.stoppedSessions.delete(sessionId)
    this.sessionKnowledgeBases.delete(sessionId)
  }
}

export const stopController = new StopController()
