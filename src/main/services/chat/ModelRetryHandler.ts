import OpenAI from 'openai'
import type { Logger } from '../logger'
import {
  hasPromptCacheParameters,
  isPromptCacheParameterUnsupportedError,
  markPromptCacheOptionsUnsupported,
  stripPromptCacheOptions
} from './PromptCacheOptimizer'

const RETRYABLE_MODEL_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])
const MODEL_REQUEST_MAX_ATTEMPTS = 3
const MODEL_REQUEST_RETRY_DELAY_MS = 1500

export interface ModelApiError extends Error {
  status?: number
  code?: string
  headers?: Headers | Record<string, string>
  error?: {
    message?: string
    code?: string
    type?: string
  }
}

type DelayWithAbortFn = (ms: number, sessionId: string, signal: AbortSignal) => Promise<void>

interface ModelRetryHandlerOptions {
  logger: Logger
  checkStopped: (sessionId: string) => void
  delayWithAbort: DelayWithAbortFn
}

/**
 * 模型请求重试处理器
 * 负责错误归一化、可重试判断和指数退避
 */
export class ModelRetryHandler {
  private readonly logger: Logger
  private readonly checkStopped: (sessionId: string) => void
  private readonly delayWithAbort: DelayWithAbortFn

  constructor(options: ModelRetryHandlerOptions) {
    this.logger = options.logger
    this.checkStopped = options.checkStopped
    this.delayWithAbort = options.delayWithAbort
  }

  /**
   * 提取模型请求错误状态码
   */
  getModelErrorStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object' || !('status' in error)) {
      return undefined
    }

    const status = (error as ModelApiError).status
    return typeof status === 'number' ? status : undefined
  }

  /**
   * 提取模型请求错误消息
   */
  getModelErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message
    }

    if (error && typeof error === 'object' && 'error' in error) {
      const nestedMessage = (error as ModelApiError).error?.message
      if (nestedMessage) {
        return nestedMessage
      }
    }

    return String(error)
  }

  /**
   * 判断是否为可重试的模型请求错误
   */
  isRetryableModelError(error: unknown): boolean {
    const status = this.getModelErrorStatus(error)
    if (status && RETRYABLE_MODEL_STATUS_CODES.has(status)) {
      return true
    }

    const message = this.getModelErrorMessage(error).toLowerCase()
    return (
      message.includes('overloaded') ||
      message.includes('try again later') ||
      message.includes('rate limit') ||
      message.includes('too many requests')
    )
  }

  /**
   * 获取模型请求的重试等待时间
   */
  getModelRetryDelay(error: unknown, attempt: number): number {
    if (error && typeof error === 'object' && 'headers' in error) {
      const headers = (error as ModelApiError).headers
      const retryAfter =
        headers instanceof Headers
          ? headers.get('retry-after')
          : headers?.['retry-after'] || headers?.['Retry-After']

      if (retryAfter) {
        const retryAfterSeconds = Number(retryAfter)
        if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
          return retryAfterSeconds * 1000
        }
      }
    }

    return MODEL_REQUEST_RETRY_DELAY_MS * 2 ** attempt
  }

  /**
   * 归一化模型请求错误信息
   */
  normalizeModelError(error: unknown): string {
    const rawMessage = this.getModelErrorMessage(error)
    const status = this.getModelErrorStatus(error)
    const lowerMessage = rawMessage.toLowerCase()

    if (
      status === 429 &&
      (lowerMessage.includes('overloaded') || lowerMessage.includes('try again later'))
    ) {
      return `模型服务当前繁忙（429），请稍后重试或切换其他模型。原始错误: ${rawMessage}`
    }

    if (status === 429) {
      return `模型请求过于频繁（429），请稍后重试。原始错误: ${rawMessage}`
    }

    return rawMessage
  }

  /**
   * 创建支持自动重试的流式聊天请求
   */
  async createChatCompletionWithRetry(
    client: OpenAI,
    params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    abortController: AbortController,
    sessionId: string,
    scene: string
  ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    let lastError: unknown
    let activeParams = params

    for (let attempt = 0; attempt < MODEL_REQUEST_MAX_ATTEMPTS; attempt++) {
      this.checkStopped(sessionId)

      try {
        return await client.chat.completions.create(activeParams, {
          signal: abortController.signal
        })
      } catch (error) {
        lastError = error

        if (error instanceof Error && error.name === 'AbortError') {
          throw error
        }

        if (abortController.signal.aborted) {
          const abortError = new Error('Request was stopped by user')
          abortError.name = 'AbortError'
          throw abortError
        }

        if (
          hasPromptCacheParameters(activeParams) &&
          isPromptCacheParameterUnsupportedError(error)
        ) {
          markPromptCacheOptionsUnsupported(activeParams)
          activeParams = stripPromptCacheOptions(activeParams)
          this.logger.warn('模型服务不支持 Prompt Cache 参数，已自动降级重试', 'main', {
            sessionId,
            scene,
            status: this.getModelErrorStatus(error),
            error: this.getModelErrorMessage(error)
          })
          continue
        }

        // 判断是否为可重试错误（状态码 408/429/5xx 或包含 overloaded 等错误消息）
        const shouldRetry =
          attempt < MODEL_REQUEST_MAX_ATTEMPTS - 1 && this.isRetryableModelError(error)

        if (!shouldRetry) {
          throw error
        }

        const delayMs = this.getModelRetryDelay(error, attempt)
        this.logger.warn('模型请求失败，准备重试', 'main', {
          sessionId,
          scene,
          attempt: attempt + 1,
          nextAttempt: attempt + 2,
          status: this.getModelErrorStatus(error),
          delayMs,
          error: this.getModelErrorMessage(error)
        })

        await this.delayWithAbort(delayMs, sessionId, abortController.signal)
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }
}
