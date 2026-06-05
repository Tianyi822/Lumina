import { createHash } from 'crypto'
import type OpenAI from 'openai'
import type { ChatRequest, TokenUsage } from '../../types/chat'
import type { LLMConfig } from '../../types/config'
import type { Logger } from '../logger'

const PROMPT_CACHE_KEY_PREFIX = 'lumina'
const PROMPT_CACHE_LOW_HIT_RATE = 0.05
const PROMPT_CACHE_MIN_TOKENS = 1024
const PROMPT_CACHE_PROVIDER_KEY = Symbol('promptCacheProviderKey')

type PromptCacheParams =
  | OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
  | OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming

interface PromptCacheTaggedParams {
  [PROMPT_CACHE_PROVIDER_KEY]?: string
}

interface PromptCacheOptions {
  llmConfig: LLMConfig
  request: ChatRequest
  toolSignature?: unknown
}

interface PromptCacheFingerprint {
  model: string
  system: string
  tools: string
  messages: string
  toolChoice: string
}

interface PromptCacheDiagnosticEntry {
  fingerprint: PromptCacheFingerprint
}

interface ChatCompletionUsageLike {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  reasoning_tokens?: number
  prompt_tokens_details?: {
    cached_tokens?: number
  }
  completion_tokens_details?: {
    reasoning_tokens?: number
  }
}

const unsupportedPromptCacheProviders = new Set<string>()
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
    enableLabTools: request.enableLabTools === true,
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

function normalizeUsage(usage: TokenUsage): TokenUsage {
  const cachedPromptTokens = usage.cached_prompt_tokens ?? 0
  if (usage.prompt_tokens <= 0) {
    return {
      ...usage,
      cached_prompt_tokens: cachedPromptTokens,
      uncached_prompt_tokens: 0,
      prompt_cache_hit_rate: 0
    }
  }

  const uncachedPromptTokens = Math.max(usage.prompt_tokens - cachedPromptTokens, 0)
  return {
    ...usage,
    cached_prompt_tokens: cachedPromptTokens,
    uncached_prompt_tokens: uncachedPromptTokens,
    prompt_cache_hit_rate: cachedPromptTokens / usage.prompt_tokens
  }
}

function extractSystemMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) {
    return []
  }

  return messages
    .filter((message) => isPlainRecord(message) && message.role === 'system')
    .map((message) => (isPlainRecord(message) ? message.content : undefined))
}

function createPromptCacheFingerprint(params: PromptCacheParams): PromptCacheFingerprint {
  const normalizedMessages = stableNormalize(params.messages)
  const normalizedTools = stableNormalize('tools' in params ? params.tools : undefined)
  const normalizedToolChoice = stableNormalize(
    'tool_choice' in params ? params.tool_choice : undefined
  )

  return {
    model: hashStableValue(params.model),
    system: hashStableValue(extractSystemMessages(params.messages)),
    tools: hashStableValue(normalizedTools),
    messages: hashStableValue(normalizedMessages),
    toolChoice: hashStableValue(normalizedToolChoice)
  }
}

function findPromptCacheDrift(
  previous: PromptCacheFingerprint,
  current: PromptCacheFingerprint
): string | null {
  if (previous.model !== current.model) return 'model_changed'
  if (previous.system !== current.system) return 'system_changed'
  if (previous.tools !== current.tools) return 'tools_changed'
  if (previous.toolChoice !== current.toolChoice) return 'tool_choice_changed'
  if (previous.messages !== current.messages) return 'messages_changed'
  return null
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

export function applyPromptCacheOptions<T extends PromptCacheParams>(
  params: T,
  options: PromptCacheOptions
): T {
  const providerKey = getProviderKey(options.llmConfig)
  if (unsupportedPromptCacheProviders.has(providerKey)) {
    return params
  }

  const promptCacheKey = buildPromptCacheKey(options)
  const nextParams = {
    ...params,
    prompt_cache_key: promptCacheKey,
    ...(isOfficialOpenAIProvider(options.llmConfig) ? { prompt_cache_retention: '24h' } : {})
  } as T

  return attachPromptCacheProviderKey(nextParams, providerKey)
}

export function stripPromptCacheOptions<T extends PromptCacheParams>(params: T): T {
  const nextParams = { ...params } as T & {
    prompt_cache_key?: string
    prompt_cache_retention?: string
  }
  delete nextParams.prompt_cache_key
  delete nextParams.prompt_cache_retention
  return nextParams as T
}

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

export function extractTokenUsage(usage?: ChatCompletionUsageLike | null): TokenUsage {
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const cachedPromptTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0
  const reasoningTokens =
    usage?.reasoning_tokens ?? usage?.completion_tokens_details?.reasoning_tokens

  return normalizeUsage({
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: usage?.total_tokens ?? promptTokens + completionTokens,
    reasoning_tokens: reasoningTokens,
    cached_prompt_tokens: cachedPromptTokens
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

export function addTokenUsage(target: TokenUsage, delta: TokenUsage): void {
  target.prompt_tokens += delta.prompt_tokens
  target.completion_tokens += delta.completion_tokens
  target.total_tokens += delta.total_tokens
  target.cached_prompt_tokens =
    (target.cached_prompt_tokens ?? 0) + (delta.cached_prompt_tokens ?? 0)

  if (delta.reasoning_tokens) {
    target.reasoning_tokens = (target.reasoning_tokens ?? 0) + delta.reasoning_tokens
  }

  const normalized = normalizeUsage(target)
  target.cached_prompt_tokens = normalized.cached_prompt_tokens
  target.uncached_prompt_tokens = normalized.uncached_prompt_tokens
  target.prompt_cache_hit_rate = normalized.prompt_cache_hit_rate
}

export function recordPromptCacheDiagnostics(
  scope: string,
  params: PromptCacheParams,
  usage: TokenUsage,
  logger: Logger
): void {
  const currentFingerprint = createPromptCacheFingerprint(params)
  const previousEntry = promptCacheDiagnostics.get(scope)
  promptCacheDiagnostics.set(scope, { fingerprint: currentFingerprint })

  if (!previousEntry || usage.prompt_tokens < PROMPT_CACHE_MIN_TOKENS) {
    return
  }

  const hitRate = usage.prompt_cache_hit_rate ?? 0
  if (hitRate >= PROMPT_CACHE_LOW_HIT_RATE) {
    return
  }

  const driftType = findPromptCacheDrift(previousEntry.fingerprint, currentFingerprint)
  logger.warn('Prompt Cache 命中率较低', 'main', {
    scope,
    driftType: driftType ?? 'cache_entry_missing_or_expired',
    promptTokens: usage.prompt_tokens,
    cachedPromptTokens: usage.cached_prompt_tokens ?? 0,
    hitRate
  })
}
