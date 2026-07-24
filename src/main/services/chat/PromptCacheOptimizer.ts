import { createHash } from 'crypto'
import type OpenAI from 'openai'
import type { ChatRequest, TokenUsage } from '../../types/chat'
import type { LLMConfig } from '../../types/config'
import type { Logger } from '../logger'

// Prompt Cache 键名前缀
const PROMPT_CACHE_KEY_PREFIX = 'lumina'
// 低命中率阈值（低于此值记录告警）
const PROMPT_CACHE_LOW_HIT_RATE = 0.05
// 触发命中率检测的最小 Token 数
const PROMPT_CACHE_MIN_TOKENS = 1024
// 用于关联 prompt_cache 参数与其提供商的内部 Symbol 键
const PROMPT_CACHE_PROVIDER_KEY = Symbol('promptCacheProviderKey')

/** 携带了 prompt_cache 参数的流式/非流式请求 */
type PromptCacheParams =
  | OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
  | OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming

/** 内部标记了提供商键的 prompt cache 参数 */
interface PromptCacheTaggedParams {
  [PROMPT_CACHE_PROVIDER_KEY]?: string
}

/** 构建 Prompt Cache 键的选项 */
interface PromptCacheOptions {
  llmConfig: LLMConfig
  request: ChatRequest
  toolSignature?: unknown
}

/** Prompt Cache 指纹，用于比较两次请求的上下文变化 */
interface PromptCacheFingerprint {
  model: string
  system: string
  tools: string
  toolChoice: string
  messageHashes: string[]
}

/** Prompt Cache 诊断记录 */
interface PromptCacheDiagnosticEntry {
  fingerprint: PromptCacheFingerprint
  commonPrefixWarmupCount: number
}

/** 兼容多种供应商的 Token 用量接口（OpenAI / DeepSeek 等） */
interface ChatCompletionUsageLike {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  reasoning_tokens?: number
  prompt_cache_hit_tokens?: number
  prompt_cache_miss_tokens?: number
  prompt_tokens_details?: {
    cached_tokens?: number
  }
  completion_tokens_details?: {
    reasoning_tokens?: number
  }
}

/** Prompt Cache 诊断选项 */
export interface PromptCacheDiagnosticOptions {
  llmConfig: LLMConfig
  request: ChatRequest
  mode: 'direct' | 'react' | 'react_finalization' | 'plan_generation'
  scene?: string
}

/**
 * 两次请求之间 Prompt Cache 上下文关系类型
 * - model_changed: 模型变更 → 缓存失效
 * - system_changed: 系统提示变更 → 缓存失效
 * - tools_changed: 工具列表变更 → 缓存失效
 * - tool_choice_changed: 工具选择策略变更 → 缓存失效
 * - append_only: 仅追加消息 → 可复用缓存
 * - common_prefix_warmup: 部分重写但保留前缀 → 部分缓存可能命中
 * - history_rewritten: 历史消息被重写 → 缓存失效
 * - unchanged: 无变化
 */
export type PromptCacheRelationship =
  | 'model_changed'
  | 'system_changed'
  | 'tools_changed'
  | 'tool_choice_changed'
  | 'append_only'
  | 'common_prefix_warmup'
  | 'history_rewritten'
  | 'unchanged'

// 缓存不支持 prompt_cache 参数的模型提供商
const unsupportedPromptCacheProviders = new Set<string>()
// 跨请求的诊断记录（按 scope 维度缓存上一次的指纹）
const promptCacheDiagnostics = new Map<string, PromptCacheDiagnosticEntry>()

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize)
  }

  if (!isPlainRecord(value)) {
    return value
  }

  const normalized: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    const item = value[key]
    if (typeof item !== 'undefined') {
      normalized[key] = stableNormalize(item)
    }
  }
  return normalized
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value)) ?? 'undefined'
}

function hashStableValue(value: unknown, length = 32): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, length)
}

function getBaseUrlHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host.toLowerCase()
  } catch {
    return baseUrl.trim().toLowerCase()
  }
}

function getProviderKey(llmConfig: LLMConfig): string {
  return `${getBaseUrlHost(llmConfig.base_url)}:${llmConfig.model_name}`
}

function isOfficialOpenAIProvider(llmConfig: LLMConfig): boolean {
  return getBaseUrlHost(llmConfig.base_url) === 'api.openai.com'
}

function buildToolSelectionSignature(request: ChatRequest, toolSignature?: unknown): unknown {
  return {
    enablePaperWebSearch: request.enablePaperWebSearch === true,
    enablePlanMode: request.enablePlanMode === true,
    hasPaperContext: request.sessionType === 'paper' && Boolean(request.paperId),
    knowledgeBaseIds: (request.selectedKnowledgeBases ?? []).map((kb) => kb.id).sort(),
    selectedTools: (request.selectedTools ?? [])
      .map((tool) => `${tool.serverName}/${tool.toolName}`)
      .sort(),
    toolSignature: stableNormalize(toolSignature ?? null)
  }
}

function attachPromptCacheProviderKey<T extends PromptCacheParams>(
  params: T,
  providerKey: string
): T {
  Object.defineProperty(params, PROMPT_CACHE_PROVIDER_KEY, {
    value: providerKey,
    enumerable: false,
    configurable: true
  })
  return params
}

function hasPromptCacheOptions(params: PromptCacheParams): boolean {
  const cacheParams = params as PromptCacheParams & {
    prompt_cache_key?: unknown
    prompt_cache_retention?: unknown
  }
  return Boolean(cacheParams.prompt_cache_key || cacheParams.prompt_cache_retention)
}

/**
 * 规范化 Token 用量：计算缓存命中率
 * 兼容提供 cached_prompt_tokens / uncached_prompt_tokens 两种字段
 */
function normalizeUsage(usage: TokenUsage): TokenUsage {
  const cachedPromptTokens = usage.cached_prompt_tokens ?? 0
  const explicitUncachedPromptTokens = usage.uncached_prompt_tokens
  const inferredPromptTokens = cachedPromptTokens + (explicitUncachedPromptTokens ?? 0)
  const promptTokens = usage.prompt_tokens > 0 ? usage.prompt_tokens : inferredPromptTokens

  if (promptTokens <= 0) {
    return {
      ...usage,
      prompt_tokens: 0,
      cached_prompt_tokens: cachedPromptTokens,
      uncached_prompt_tokens: 0,
      prompt_cache_hit_rate: 0
    }
  }

  const uncachedPromptTokens =
    explicitUncachedPromptTokens ?? Math.max(promptTokens - cachedPromptTokens, 0)
  const cacheMeasuredPromptTokens = cachedPromptTokens + uncachedPromptTokens
  return {
    ...usage,
    prompt_tokens: promptTokens,
    cached_prompt_tokens: cachedPromptTokens,
    uncached_prompt_tokens: uncachedPromptTokens,
    prompt_cache_hit_rate:
      cachedPromptTokens /
      (cacheMeasuredPromptTokens > 0 ? cacheMeasuredPromptTokens : promptTokens)
  }
}

/** 从消息列表中提取所有 system 角色的消息内容 */
function extractSystemMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages
    .filter((message) => isPlainRecord(message) && message.role === 'system')
    .map((message) => (isPlainRecord(message) ? message.content : undefined))
}

/**
 * 创建 Prompt Cache 指纹
 * 排除 system 消息（单独对比）、对 tools/tool_choice 做稳定序列化
 */
function createPromptCacheFingerprint(params: PromptCacheParams): PromptCacheFingerprint {
  const normalizedMessages = Array.isArray(params.messages)
    ? params.messages.filter((message) => !isPlainRecord(message) || message.role !== 'system')
    : []
  const normalizedTools = stableNormalize('tools' in params ? params.tools : undefined)
  const normalizedToolChoice = stableNormalize(
    'tool_choice' in params ? params.tool_choice : undefined
  )

  return {
    model: hashStableValue(params.model),
    system: hashStableValue(extractSystemMessages(params.messages)),
    tools: hashStableValue(normalizedTools),
    toolChoice: hashStableValue(normalizedToolChoice),
    messageHashes: normalizedMessages.map((message) => hashStableValue(message))
  }
}

/** 计算两个哈希数组的最长公共前缀长度 */
function commonPrefixLength(previous: string[], current: string[]): number {
  const maxLength = Math.min(previous.length, current.length)
  let length = 0
  while (length < maxLength && previous[length] === current[length]) {
    length++
  }
  return length
}

/**
 * 判断两次请求的缓存关系
 * 优先级：模型 → 系统提示 → 工具 → 工具选择 → 消息变更
 */
function findPromptCacheRelationship(
  previous: PromptCacheFingerprint,
  current: PromptCacheFingerprint
): PromptCacheRelationship {
  if (previous.model !== current.model) return 'model_changed'
  if (previous.system !== current.system) return 'system_changed'
  if (previous.tools !== current.tools) return 'tools_changed'
  if (previous.toolChoice !== current.toolChoice) return 'tool_choice_changed'

  const prefixLength = commonPrefixLength(previous.messageHashes, current.messageHashes)
  if (
    prefixLength === previous.messageHashes.length &&
    current.messageHashes.length > previous.messageHashes.length
  ) {
    return 'append_only'
  }
  if (
    prefixLength === previous.messageHashes.length &&
    prefixLength === current.messageHashes.length
  ) {
    return 'unchanged'
  }
  if (prefixLength > 0) {
    return 'common_prefix_warmup'
  }
  return 'history_rewritten'
}

export function deepSortPromptCacheValue(value: unknown): unknown {
  return stableNormalize(value)
}

export function buildPromptCacheKey(options: PromptCacheOptions): string {
  const providerHost = getBaseUrlHost(options.llmConfig.base_url)
  const cacheScope =
    options.request.sessionType === 'paper' && options.request.paperId
      ? { scope: 'paper', paperId: options.request.paperId }
      : {
          scope: 'session',
          sessionId: options.request.sessionId,
          sessionType: options.request.sessionType ?? 'default'
        }
  const signature = {
    model: options.llmConfig.model_name,
    providerHost,
    cacheScope,
    tools: buildToolSelectionSignature(options.request, options.toolSignature)
  }

  return `${PROMPT_CACHE_KEY_PREFIX}_${hashStableValue(signature)}`
}

/**
 * 对请求参数应用 Prompt Cache 选项
 * 仅在 OpenAI 官方 API 上启用（其他提供商可能不支持）
 */
export function applyPromptCacheOptions<T extends PromptCacheParams>(
  params: T,
  options: PromptCacheOptions
): T {
  if (!isOfficialOpenAIProvider(options.llmConfig)) {
    return params
  }

  const providerKey = getProviderKey(options.llmConfig)
  if (unsupportedPromptCacheProviders.has(providerKey)) {
    return params
  }

  const promptCacheKey = buildPromptCacheKey(options)
  const nextParams = {
    ...params,
    prompt_cache_key: promptCacheKey,
    prompt_cache_retention: '24h'
  } as T

  return attachPromptCacheProviderKey(nextParams, providerKey)
}

/** 从缓存参数对象中移除 prompt_cache_key 和 prompt_cache_retention */
export function stripPromptCacheOptions<T extends PromptCacheParams>(params: T): T {
  const nextParams = { ...params } as T & {
    prompt_cache_key?: string
    prompt_cache_retention?: string
  }
  delete nextParams.prompt_cache_key
  delete nextParams.prompt_cache_retention
  return nextParams as T
}

/** 标记当前供应商不支持 Prompt Cache，后续请求跳过缓存参数注入 */
export function markPromptCacheOptionsUnsupported(params: PromptCacheParams): void {
  const providerKey = (params as PromptCacheParams & PromptCacheTaggedParams)[
    PROMPT_CACHE_PROVIDER_KEY
  ]
  if (providerKey) {
    unsupportedPromptCacheProviders.add(providerKey)
  }
}

export function hasPromptCacheParameters(params: PromptCacheParams): boolean {
  return hasPromptCacheOptions(params)
}

/** 判断错误信息是否由模型不支持 Prompt Cache 参数引起 */
export function isPromptCacheParameterUnsupportedError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : isPlainRecord(error) && typeof error.error === 'object' && error.error
        ? stableStringify(error.error).toLowerCase()
        : String(error).toLowerCase()

  const mentionsPromptCache =
    message.includes('prompt_cache_key') || message.includes('prompt_cache_retention')
  const looksUnsupported =
    message.includes('unsupported') ||
    message.includes('unknown') ||
    message.includes('unrecognized') ||
    message.includes('extra') ||
    message.includes('invalid')

  return mentionsPromptCache && looksUnsupported
}

/**
 * 从 API 响应中提取并标准化 Token 用量
 * 兼容 OpenAI（prompt_tokens_details.cached_tokens）和 DeepSeek（prompt_cache_hit_tokens）格式
 */
export function extractTokenUsage(usage?: ChatCompletionUsageLike | null): TokenUsage {
  const deepSeekCachedPromptTokens = usage?.prompt_cache_hit_tokens
  const deepSeekUncachedPromptTokens = usage?.prompt_cache_miss_tokens
  const promptTokens =
    usage?.prompt_tokens ?? (deepSeekCachedPromptTokens ?? 0) + (deepSeekUncachedPromptTokens ?? 0)
  const completionTokens = usage?.completion_tokens ?? 0
  const cachedPromptTokens =
    deepSeekCachedPromptTokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0
  const reasoningTokens =
    usage?.reasoning_tokens ?? usage?.completion_tokens_details?.reasoning_tokens

  return normalizeUsage({
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: usage?.total_tokens ?? promptTokens + completionTokens,
    reasoning_tokens: reasoningTokens,
    cached_prompt_tokens: cachedPromptTokens,
    uncached_prompt_tokens: deepSeekUncachedPromptTokens
  })
}

export function createEmptyTokenUsage(): TokenUsage {
  return normalizeUsage({
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cached_prompt_tokens: 0
  })
}

/**
 * 将 delta Token 用量累加到 target 上并重新计算缓存命中率
 */
export function addTokenUsage(target: TokenUsage, delta: TokenUsage): void {
  target.prompt_tokens += delta.prompt_tokens
  target.completion_tokens += delta.completion_tokens
  target.total_tokens += delta.total_tokens
  target.cached_prompt_tokens =
    (target.cached_prompt_tokens ?? 0) + (delta.cached_prompt_tokens ?? 0)
  target.uncached_prompt_tokens =
    (target.uncached_prompt_tokens ?? 0) + (delta.uncached_prompt_tokens ?? 0)

  if (delta.reasoning_tokens) {
    target.reasoning_tokens = (target.reasoning_tokens ?? 0) + delta.reasoning_tokens
  }

  const normalized = normalizeUsage(target)
  target.cached_prompt_tokens = normalized.cached_prompt_tokens
  target.uncached_prompt_tokens = normalized.uncached_prompt_tokens
  target.prompt_cache_hit_rate = normalized.prompt_cache_hit_rate
}

/**
 * 记录 Prompt Cache 诊断信息
 * 当缓存命中率低于阈值时输出告警日志
 */
export function recordPromptCacheDiagnostics(
  options: PromptCacheDiagnosticOptions,
  params: PromptCacheParams,
  usage: TokenUsage,
  logger: Logger
): void {
  const scope = buildPromptCacheDiagnosticScope(options)
  const currentFingerprint = createPromptCacheFingerprint(params)
  const previousEntry = promptCacheDiagnostics.get(scope)

  if (!previousEntry) {
    promptCacheDiagnostics.set(scope, {
      fingerprint: currentFingerprint,
      commonPrefixWarmupCount: 0
    })
    return
  }

  const relationship = findPromptCacheRelationship(previousEntry.fingerprint, currentFingerprint)
  const commonPrefixWarmupCount =
    relationship === 'common_prefix_warmup' ? previousEntry.commonPrefixWarmupCount + 1 : 0
  promptCacheDiagnostics.set(scope, {
    fingerprint: currentFingerprint,
    commonPrefixWarmupCount
  })

  if (
    usage.prompt_tokens < PROMPT_CACHE_MIN_TOKENS ||
    (relationship === 'common_prefix_warmup' && commonPrefixWarmupCount < 2)
  ) {
    return
  }

  const hitRate = usage.prompt_cache_hit_rate ?? 0
  if (hitRate >= PROMPT_CACHE_LOW_HIT_RATE) {
    return
  }

  const prefixMessageCount = commonPrefixLength(
    previousEntry.fingerprint.messageHashes,
    currentFingerprint.messageHashes
  )
  logger.warn('Prompt Cache 命中率较低', 'main', {
    scope,
    scene: options.scene,
    relationship,
    previousMessageCount: previousEntry.fingerprint.messageHashes.length,
    currentMessageCount: currentFingerprint.messageHashes.length,
    prefixMessageCount,
    systemHash: currentFingerprint.system,
    toolsHash: currentFingerprint.tools,
    promptTokens: usage.prompt_tokens,
    cachedPromptTokens: usage.cached_prompt_tokens ?? 0,
    uncachedPromptTokens: usage.uncached_prompt_tokens ?? 0,
    hitRate
  })
}

/**
 * 构建 Prompt Cache 诊断的 scope 字符串
 * 格式：{host}:{model}:{scope}:{mode}
 */
export function buildPromptCacheDiagnosticScope(options: PromptCacheDiagnosticOptions): string {
  const cacheScope =
    options.request.sessionType === 'paper' && options.request.paperId
      ? `paper:${options.request.paperId}`
      : `session:${options.request.sessionId}`
  return `${getBaseUrlHost(options.llmConfig.base_url)}:${options.llmConfig.model_name}:${cacheScope}:${options.mode}`
}

/**
 * 比较两次请求参数，判断 Prompt Cache 关系类型
 */
export function classifyPromptCacheRelationship(
  previous: PromptCacheParams,
  current: PromptCacheParams
): PromptCacheRelationship {
  return findPromptCacheRelationship(
    createPromptCacheFingerprint(previous),
    createPromptCacheFingerprint(current)
  )
}
