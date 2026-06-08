import OpenAI from 'openai'
import { Worker } from 'worker_threads'
import { encode } from 'gpt-tokenizer/encoding/cl100k_base'
import { logger } from '@main/services/logger'
import type { EmbeddingConfig } from '@main/types/config'
import { EMBEDDING_WORKER_TIMEOUT } from '@main/constants/timeouts'
import { normalizeEmbeddingBaseUrl } from '@shared/utils/embeddingBaseUrl'

const EMBEDDING_MAX_REQUESTS_PER_SECOND = 20
const EMBEDDING_MAX_TOKENS_PER_MINUTE = 1_200_000
const EMBEDDING_REQUEST_WINDOW_MS = 1_000
const EMBEDDING_TOKEN_WINDOW_MS = 60_000
const EMBEDDING_TOKEN_ESTIMATE_PADDING = 1.1
const EMBEDDING_SUSTAINABLE_TOKENS_PER_REQUEST = Math.max(
  1,
  Math.floor(EMBEDDING_MAX_TOKENS_PER_MINUTE / EMBEDDING_MAX_REQUESTS_PER_SECOND)
)

type EmbeddingResponse = Awaited<ReturnType<OpenAI['embeddings']['create']>>
type EmbeddingDataItem = EmbeddingResponse['data'][number]

const EMPTY_EMBEDDING_DATA_ERROR =
  '嵌入 API 返回数据为空，请检查 baseUrl、模型名称及接口是否兼容 OpenAI /v1/embeddings 格式'

/**
 * 从嵌入 API 响应中解析向量列表
 * 兼容 OpenAI 标准 data 数组，以及部分网关返回的顶层 embedding 字段
 */
function formatEmbeddingApiError(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

function getEmbeddingDataItems(response: EmbeddingResponse): EmbeddingDataItem[] {
  const errorField = (response as EmbeddingResponse & { error?: unknown }).error
  if (errorField !== undefined && errorField !== null && errorField !== '') {
    const message = formatEmbeddingApiError(errorField)
    if (message.includes('/embeddings/embeddings')) {
      throw new Error(
        `${message}。API 基础 URL 应填写到 /v1 为止（例如 http://127.0.0.1:1234/v1），不要包含 /embeddings`
      )
    }
    if (message.includes('POST /embeddings') && !message.includes('/v1/')) {
      throw new Error(`${message}。API 基础 URL 需包含 /v1（例如 http://127.0.0.1:1234/v1）`)
    }
    throw new Error(message)
  }

  if (Array.isArray(response.data) && response.data.length > 0) {
    return response.data
  }

  const legacyResponse = response as EmbeddingResponse & { embedding?: number[] }
  if (Array.isArray(legacyResponse.embedding) && legacyResponse.embedding.length > 0) {
    return [
      {
        object: 'embedding',
        embedding: legacyResponse.embedding,
        index: 0
      } as EmbeddingDataItem
    ]
  }

  throw new Error(EMPTY_EMBEDDING_DATA_ERROR)
}

interface EmbeddingClient {
  embeddings: {
    create: (params: OpenAI.EmbeddingCreateParams) => Promise<EmbeddingResponse>
  }
}

interface EmbeddingReservation {
  batchSize: number
  reservationId: number
  reservedTokens: number
}

export interface BatchEmbeddingProgress {
  processedTexts: number
  totalTexts: number
  currentBatchSize: number
  currentBatchEstimatedTokens: number
  requestCount: number
}

export interface BatchEmbeddingOptions {
  onProgress?: (progress: BatchEmbeddingProgress) => void
  shouldAbort?: () => boolean
}

interface EmbeddingServiceDependencies {
  clientFactory?: (config: EmbeddingConfig) => EmbeddingClient
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  tokenEstimator?: (text: string) => number
  limiterRegistry?: Map<string, EmbeddingRateLimiter>
}

interface RateLimitRequestEntry {
  id: number
  timestamp: number
}

interface RateLimitTokenEntry {
  id: number
  timestamp: number
  tokens: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function estimateEmbeddingTokens(text: string): number {
  if (!text) {
    return 1
  }

  return Math.max(1, Math.ceil(encode(text).length * EMBEDDING_TOKEN_ESTIMATE_PADDING))
}

class EmbeddingRateLimiter {
  private requestHistory: RateLimitRequestEntry[] = []
  private tokenHistory: RateLimitTokenEntry[] = []
  private nextReservationId = 1
  private lock: Promise<void> = Promise.resolve()
  private readonly now: () => number
  private readonly sleepFn: (ms: number) => Promise<void>

  constructor(now: () => number, sleepFn: (ms: number) => Promise<void>) {
    this.now = now
    this.sleepFn = sleepFn
  }

  async reserveBatch(tokenEstimates: number[], startIndex: number): Promise<EmbeddingReservation> {
    return this.withLock(async () => {
      const firstTextTokens = tokenEstimates[startIndex]
      if (!firstTextTokens) {
        throw new Error('批量嵌入输入不能为空')
      }

      if (firstTextTokens > EMBEDDING_MAX_TOKENS_PER_MINUTE) {
        throw new Error(
          `单条文本估算 Token 数 ${firstTextTokens} 超过每分钟限制 ${EMBEDDING_MAX_TOKENS_PER_MINUTE}，请减小知识库分块大小后重试`
        )
      }

      while (true) {
        const now = this.now()
        this.prune(now)

        const rpsWaitMs = this.getRequestWaitMs(now)
        if (rpsWaitMs > 0) {
          await this.sleepFn(rpsWaitMs)
          continue
        }

        const availableTokens = this.getAvailableTokens(now)
        if (availableTokens < firstTextTokens) {
          const tokenWaitMs = this.getTokenWaitMs(now, firstTextTokens)
          await this.sleepFn(tokenWaitMs)
          continue
        }

        const tokenBudget =
          firstTextTokens > EMBEDDING_SUSTAINABLE_TOKENS_PER_REQUEST
            ? firstTextTokens
            : Math.min(availableTokens, EMBEDDING_SUSTAINABLE_TOKENS_PER_REQUEST)
        const { batchSize, totalTokens } = this.planBatch(tokenEstimates, startIndex, tokenBudget)
        const reservationId = this.nextReservationId++

        this.requestHistory.push({ id: reservationId, timestamp: now })
        this.tokenHistory.push({
          id: reservationId,
          timestamp: now,
          tokens: totalTokens
        })

        return {
          batchSize,
          reservationId,
          reservedTokens: totalTokens
        }
      }
    })
  }

  async reconcileReservation(reservationId: number, actualTokens: number): Promise<void> {
    await this.withLock(async () => {
      this.prune(this.now())
      const reservation = this.tokenHistory.find((item) => item.id === reservationId)
      if (reservation) {
        reservation.tokens = Math.max(0, actualTokens)
      }
    })
  }

  async cancelReservation(reservationId: number): Promise<void> {
    await this.withLock(async () => {
      this.requestHistory = this.requestHistory.filter((item) => item.id !== reservationId)
      this.tokenHistory = this.tokenHistory.filter((item) => item.id !== reservationId)
    })
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const previousLock = this.lock
    let releaseCurrentLock: (() => void) | undefined

    this.lock = new Promise<void>((resolve) => {
      releaseCurrentLock = resolve
    })

    await previousLock

    try {
      return await fn()
    } finally {
      releaseCurrentLock?.()
    }
  }

  private planBatch(
    tokenEstimates: number[],
    startIndex: number,
    tokenBudget: number,
    maxBatchSize = 10
  ): { batchSize: number; totalTokens: number } {
    let batchSize = 0
    let totalTokens = 0

    for (let index = startIndex; index < tokenEstimates.length; index++) {
      const textTokens = tokenEstimates[index]
      if (batchSize > 0 && totalTokens + textTokens > tokenBudget) {
        break
      }

      totalTokens += textTokens
      batchSize++

      if (batchSize >= maxBatchSize || totalTokens >= tokenBudget) {
        break
      }
    }

    if (batchSize === 0) {
      return {
        batchSize: 1,
        totalTokens: tokenEstimates[startIndex]
      }
    }

    return {
      batchSize,
      totalTokens
    }
  }

  private getRequestWaitMs(now: number): number {
    if (this.requestHistory.length < EMBEDDING_MAX_REQUESTS_PER_SECOND) {
      return 0
    }

    return Math.max(0, this.requestHistory[0].timestamp + EMBEDDING_REQUEST_WINDOW_MS - now)
  }

  private getTokenWaitMs(now: number, requiredTokens: number): number {
    let usedTokens = this.getUsedTokens()
    if (usedTokens + requiredTokens <= EMBEDDING_MAX_TOKENS_PER_MINUTE) {
      return 0
    }

    for (const entry of this.tokenHistory) {
      usedTokens -= entry.tokens
      if (usedTokens + requiredTokens <= EMBEDDING_MAX_TOKENS_PER_MINUTE) {
        return Math.max(0, entry.timestamp + EMBEDDING_TOKEN_WINDOW_MS - now)
      }
    }

    return EMBEDDING_TOKEN_WINDOW_MS
  }

  private getAvailableTokens(now: number): number {
    this.prune(now)
    return Math.max(0, EMBEDDING_MAX_TOKENS_PER_MINUTE - this.getUsedTokens())
  }

  private getUsedTokens(): number {
    return this.tokenHistory.reduce((sum, entry) => sum + entry.tokens, 0)
  }

  private prune(now: number): void {
    while (
      this.requestHistory.length > 0 &&
      now - this.requestHistory[0].timestamp >= EMBEDDING_REQUEST_WINDOW_MS
    ) {
      this.requestHistory.shift()
    }

    while (
      this.tokenHistory.length > 0 &&
      now - this.tokenHistory[0].timestamp >= EMBEDDING_TOKEN_WINDOW_MS
    ) {
      this.tokenHistory.shift()
    }
  }
}

/**
 * 嵌入向量结果
 */
export interface EmbeddingResult {
  embedding: number[]
  model: string
  usage?: {
    prompt_tokens: number
    total_tokens: number
  }
}

/**
 * 批量嵌入向量结果
 */
export interface BatchEmbeddingResult {
  embeddings: number[][]
  model: string
  usage?: {
    prompt_tokens: number
    total_tokens: number
  }
}

/**
 * 连接测试结果
 */
export interface ConnectionTestResult {
  success: boolean
  error?: string
  model?: string
  dimensions?: number
}

/**
 * 嵌入操作失败结果
 */
export interface EmbeddingFailure {
  success: false
  error: string
}

/**
 * 判断嵌入操作是否返回失败
 */
export function isEmbeddingFailure(result: unknown): result is EmbeddingFailure {
  return (
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    (result as EmbeddingFailure).success === false
  )
}

/**
 * 预定义的嵌入模型配置
 */
export const PRESET_EMBEDDING_MODELS: Record<
  string,
  { name: string; dimension: number; config: Partial<EmbeddingConfig> }
> = {
  'openai/small': {
    name: 'OpenAI text-embedding-3-small',
    dimension: 1536,
    config: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
      dimensions: 1536
    }
  },
  'openai/large': {
    name: 'OpenAI text-embedding-3-large',
    dimension: 3072,
    config: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-large',
      dimensions: 3072
    }
  },
  'ollama/nomic': {
    name: 'Ollama nomic-embed-text',
    dimension: 768,
    config: {
      baseUrl: 'http://localhost:11434/v1',
      model: 'nomic-embed-text',
      dimensions: 768
    }
  },
  'aliyun/v4': {
    name: '阿里云百炼 text-embedding-v4',
    dimension: 1024,
    config: {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'text-embedding-v4',
      dimensions: 1024
    }
  }
}

/**
 * 嵌入服务
 * 提供文本嵌入向量的生成功能，支持多种嵌入模型提供商
 */
export class EmbeddingService {
  private config: EmbeddingConfig | null = null
  private client: EmbeddingClient | null = null
  private readonly deps: EmbeddingServiceDependencies
  private readonly now: () => number
  private readonly sleepFn: (ms: number) => Promise<void>
  private readonly tokenEstimator: (text: string) => number
  private readonly limiterRegistry: Map<string, EmbeddingRateLimiter>
  private static readonly defaultLimiterRegistry = new Map<string, EmbeddingRateLimiter>()

  constructor(deps: EmbeddingServiceDependencies = {}) {
    this.deps = deps
    this.now = deps.now ?? Date.now
    this.sleepFn = deps.sleep ?? sleep
    this.tokenEstimator = deps.tokenEstimator ?? estimateEmbeddingTokens
    this.limiterRegistry = deps.limiterRegistry ?? EmbeddingService.defaultLimiterRegistry
  }

  /**
   * 设置嵌入模型配置
   */
  setConfig(config: EmbeddingConfig): void {
    const baseUrl = normalizeEmbeddingBaseUrl(config.baseUrl)
    if (baseUrl !== config.baseUrl.trim()) {
      logger.info('已自动修正嵌入 API 基础 URL', 'main', {
        from: config.baseUrl,
        to: baseUrl
      })
    }
    this.config = { ...config, baseUrl }
    this.initializeClient()
  }

  /**
   * 获取当前配置
   */
  getConfig(): EmbeddingConfig | null {
    return this.config
  }

  /**
   * 初始化 OpenAI 客户端
   */
  private initializeClient(): void {
    if (!this.config) {
      this.client = null
      return
    }

    this.client =
      this.deps.clientFactory?.(this.config) ??
      new OpenAI({
        baseURL: this.config.baseUrl,
        apiKey: this.config.apiKey || 'dummy-key'
      })
  }

  /**
   * 测试连接
   * 发送一个简单的测试请求验证配置是否正确
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.config || !this.client) {
      return {
        success: false,
        error: '嵌入模型未配置'
      }
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.config.model,
        input: 'test'
      })

      const embedding = getEmbeddingDataItems(response)[0]
      return {
        success: true,
        model: response.model,
        dimensions: embedding.embedding.length
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async embed(text: string): Promise<EmbeddingResult | EmbeddingFailure> {
    const config = this.config
    if (!config || !this.client) {
      return { success: false, error: '嵌入模型未配置' }
    }

    try {
      const result = await this.embedBatchInternal([text], config)
      const embedding = result.embeddings[0]
      if (!embedding) {
        return { success: false, error: EMPTY_EMBEDDING_DATA_ERROR }
      }

      return {
        embedding,
        model: result.model,
        usage: result.usage
      }
    } catch (error) {
      return {
        success: false,
        error: `嵌入向量生成失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  /**
   * 批量生成嵌入向量
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult | EmbeddingFailure> {
    const config = this.config
    if (!config || !this.client) {
      return { success: false, error: '嵌入模型未配置' }
    }

    if (texts.length === 0) {
      return { success: false, error: '输入文本列表不能为空' }
    }

    try {
      return await this.embedBatchInternal(texts, config)
    } catch (error) {
      return {
        success: false,
        error: `批量嵌入向量生成失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  async embedBatchWithOptions(
    texts: string[],
    options: BatchEmbeddingOptions = {}
  ): Promise<BatchEmbeddingResult | EmbeddingFailure> {
    const config = this.config
    if (!config || !this.client) {
      return { success: false, error: '嵌入模型未配置' }
    }

    if (texts.length === 0) {
      return { success: false, error: '输入文本列表不能为空' }
    }

    try {
      return await this.embedBatchInternal(texts, config, options)
    } catch (error) {
      return {
        success: false,
        error: `批量嵌入向量生成失败: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  private async estimateTokensBatch(texts: string[]): Promise<number[]> {
    // 小批量直接同步计算，避免 Worker 开销
    if (texts.length <= 50) {
      return texts.map((text) => this.tokenEstimator(text))
    }

    return new Promise((resolve) => {
      const worker = new Worker(new URL('./tokenEstimatorWorker.ts', import.meta.url))
      const id = crypto.randomUUID()
      let settled = false

      const cleanup = (): void => {
        clearTimeout(timeout)
        worker.terminate()
      }

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          cleanup()
          resolve(texts.map((text) => this.tokenEstimator(text)))
        }
      }, EMBEDDING_WORKER_TIMEOUT)

      worker.on('message', (msg: { id: string; estimates: number[] }) => {
        if (msg.id === id && !settled) {
          settled = true
          cleanup()
          resolve(msg.estimates)
        }
      })

      worker.on('error', (err) => {
        if (!settled) {
          settled = true
          cleanup()
          logger.warn('Worker token 估算失败，回退到同步计算', 'main', {
            error: err instanceof Error ? err.message : String(err)
          })
          resolve(texts.map((text) => this.tokenEstimator(text)))
        }
      })

      worker.postMessage({ id, texts })
    })
  }

  private async embedBatchInternal(
    texts: string[],
    config: EmbeddingConfig,
    options: BatchEmbeddingOptions = {}
  ): Promise<BatchEmbeddingResult> {
    const client = this.client
    if (!client) {
      throw new Error('嵌入模型未配置')
    }

    const limiter = this.getRateLimiter(config)
    const tokenEstimates = await this.estimateTokensBatch(texts)
    const embeddings: number[][] = new Array(texts.length)
    const usage = {
      prompt_tokens: 0,
      total_tokens: 0
    }
    let shouldExposeUsage = false
    let requestCount = 0
    let processedTexts = 0
    let responseModel = config.model

    while (processedTexts < texts.length) {
      if (options.shouldAbort?.()) {
        throw new Error('索引操作已被用户取消')
      }

      const reservation = await limiter.reserveBatch(tokenEstimates, processedTexts)

      if (options.shouldAbort?.()) {
        await limiter.cancelReservation(reservation.reservationId)
        throw new Error('索引操作已被用户取消')
      }

      const batchTexts = texts.slice(processedTexts, processedTexts + reservation.batchSize)

      try {
        const response = await client.embeddings.create(
          this.buildEmbeddingParams(config, batchTexts)
        )
        responseModel = response.model

        const sortedData = [...getEmbeddingDataItems(response)].sort((a, b) => a.index - b.index)
        const batchEmbeddings = sortedData.map((item) => item.embedding)

        if (batchEmbeddings.length !== batchTexts.length) {
          throw new Error(
            `嵌入响应数量不匹配，期望 ${batchTexts.length} 条，实际收到 ${batchEmbeddings.length} 条`
          )
        }

        for (let index = 0; index < batchEmbeddings.length; index++) {
          embeddings[processedTexts + index] = batchEmbeddings[index]
        }

        const actualUsage = this.extractUsage(response)
        const actualPromptTokens = actualUsage?.prompt_tokens ?? reservation.reservedTokens
        await limiter.reconcileReservation(reservation.reservationId, actualPromptTokens)

        usage.prompt_tokens += actualPromptTokens
        usage.total_tokens += actualUsage?.total_tokens ?? actualPromptTokens
        shouldExposeUsage = shouldExposeUsage || Boolean(actualUsage)

        processedTexts += reservation.batchSize
        requestCount += 1

        options.onProgress?.({
          processedTexts,
          totalTexts: texts.length,
          currentBatchSize: reservation.batchSize,
          currentBatchEstimatedTokens: reservation.reservedTokens,
          requestCount
        })
      } catch (error) {
        await limiter.reconcileReservation(reservation.reservationId, 0)
        throw error
      }
    }

    return {
      embeddings,
      model: responseModel,
      usage: shouldExposeUsage ? usage : undefined
    }
  }

  private buildEmbeddingParams(
    config: EmbeddingConfig,
    input: string | string[]
  ): OpenAI.EmbeddingCreateParams {
    const params: OpenAI.EmbeddingCreateParams = {
      model: config.model,
      input
    }

    if (config.dimensions) {
      params.dimensions = config.dimensions
    }

    return params
  }

  private extractUsage(response: EmbeddingResponse):
    | {
        prompt_tokens: number
        total_tokens: number
      }
    | undefined {
    return response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          total_tokens: response.usage.total_tokens
        }
      : undefined
  }

  private getRateLimiter(config: EmbeddingConfig): EmbeddingRateLimiter {
    const limiterKey = `${config.baseUrl}::${config.model}::${config.apiKey ?? 'dummy-key'}`
    let limiter = this.limiterRegistry.get(limiterKey)

    if (!limiter) {
      limiter = new EmbeddingRateLimiter(this.now, this.sleepFn)
      this.limiterRegistry.set(limiterKey, limiter)
      logger.info('已为嵌入模型启用统一限流器', 'main', {
        model: config.model,
        baseUrl: config.baseUrl,
        maxRps: EMBEDDING_MAX_REQUESTS_PER_SECOND,
        maxTpm: EMBEDDING_MAX_TOKENS_PER_MINUTE
      })
    }

    return limiter
  }

  /**
   * 从预设ID获取嵌入配置
   * 根据预设模型ID和自定义配置创建完整的嵌入配置
   */
  static getPresetConfig(
    presetId: string,
    customConfig?: Partial<EmbeddingConfig>
  ): EmbeddingConfig {
    const preset = PRESET_EMBEDDING_MODELS[presetId]
    if (!preset) {
      throw new Error(`未找到预设模型: ${presetId}`)
    }

    return {
      ...preset.config,
      ...customConfig,
      enabled: true
    } as EmbeddingConfig
  }

  /**
   * 获取所有预设模型
   * 返回所有可用预设模型的名称和维度信息
   */
  static getPresets(): Record<string, { name: string; dimension: number }> {
    const result: Record<string, { name: string; dimension: number }> = {}
    for (const [id, preset] of Object.entries(PRESET_EMBEDDING_MODELS)) {
      result[id] = {
        name: preset.name,
        dimension: preset.dimension
      }
    }
    return result
  }
}

let embeddingServiceInstance: EmbeddingService | null = null

/**
 * 获取嵌入服务单例
 */
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService()
  }
  return embeddingServiceInstance
}
