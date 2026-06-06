import test from 'node:test'
import assert from 'node:assert/strict'
import type { ChatRequest } from '@shared/types/chat'
import type { LLMConfig } from '@shared/types/config'
import type { Logger } from '@main/services/logger'
import {
  applyPromptCacheOptions,
  buildPromptCacheKey,
  classifyPromptCacheRelationship,
  extractTokenUsage,
  recordPromptCacheDiagnostics
} from './PromptCacheOptimizer.ts'

function createRequest(messages: ChatRequest['messages']): ChatRequest {
  return {
    messages,
    modelKey: 'gpt-5',
    sessionId: 'session-cache-test',
    sessionType: 'paper',
    paperId: 'paper-001',
    enableLabTools: true,
    selectedTools: [
      {
        serverName: 'mock',
        toolName: 'lookup',
        description: '查询资料',
        inputSchema: { type: 'object', properties: {}, required: [] }
      }
    ]
  }
}

const llmConfig: LLMConfig = {
  base_url: 'https://api.openai.com/v1',
  api_key: 'key',
  model_name: 'gpt-5'
}

test('追加消息不会改变同一会话的 Prompt Cache key', () => {
  const firstKey = buildPromptCacheKey({
    llmConfig,
    request: createRequest([{ role: 'user', content: '第一轮问题' }])
  })
  const secondKey = buildPromptCacheKey({
    llmConfig,
    request: createRequest([
      { role: 'user', content: '第一轮问题' },
      { role: 'assistant', content: '第一轮回答' },
      { role: 'user', content: '第二轮问题' }
    ])
  })

  assert.equal(firstKey, secondKey)
})

test('论文会话同一论文不同会话复用 Prompt Cache key', () => {
  const firstKey = buildPromptCacheKey({
    llmConfig,
    request: {
      ...createRequest([{ role: 'user', content: '第一轮问题' }]),
      sessionId: 'session-a'
    }
  })
  const secondKey = buildPromptCacheKey({
    llmConfig,
    request: {
      ...createRequest([{ role: 'user', content: '第一轮问题' }]),
      sessionId: 'session-b'
    }
  })

  assert.equal(firstKey, secondKey)
})

test('非论文会话不同会话保持 Prompt Cache key 隔离', () => {
  const baseRequest = createRequest([{ role: 'user', content: '同一个问题' }])
  const firstKey = buildPromptCacheKey({
    llmConfig,
    request: {
      ...baseRequest,
      sessionId: 'session-a',
      sessionType: 'default',
      paperId: undefined
    }
  })
  const secondKey = buildPromptCacheKey({
    llmConfig,
    request: {
      ...baseRequest,
      sessionId: 'session-b',
      sessionType: 'default',
      paperId: undefined
    }
  })

  assert.notEqual(firstKey, secondKey)
})

test('论文、模型或工具签名变化时 Prompt Cache key 会变化', () => {
  const request = createRequest([{ role: 'user', content: '同一个问题' }])
  const baseKey = buildPromptCacheKey({ llmConfig, request })
  const paperChangedKey = buildPromptCacheKey({
    llmConfig,
    request: { ...request, paperId: 'paper-002' }
  })
  const modelChangedKey = buildPromptCacheKey({
    llmConfig: { ...llmConfig, model_name: 'gpt-5.1' },
    request
  })
  const toolChangedKey = buildPromptCacheKey({
    llmConfig,
    request: {
      ...request,
      selectedTools: [
        {
          serverName: 'mock',
          toolName: 'search',
          description: '搜索资料',
          inputSchema: { type: 'object', properties: {}, required: [] }
        }
      ]
    }
  })

  assert.notEqual(baseKey, paperChangedKey)
  assert.notEqual(baseKey, modelChangedKey)
  assert.notEqual(baseKey, toolChangedKey)
})

test('Prompt Cache key 不包含用户原文', () => {
  const secretText = '用户原文中的敏感内容'
  const key = buildPromptCacheKey({
    llmConfig,
    request: createRequest([{ role: 'user', content: secretText }])
  })

  assert.equal(key.includes(secretText), false)
})

test('仅官方 OpenAI 地址发送显式 Prompt Cache 参数', () => {
  const request = createRequest([{ role: 'user', content: '问题' }])
  const params = { model: 'model', messages: [{ role: 'user' as const, content: '问题' }] }

  const openAIParams = applyPromptCacheOptions(params, { llmConfig, request }) as typeof params & {
    prompt_cache_key?: string
    prompt_cache_retention?: string
  }
  const deepSeekParams = applyPromptCacheOptions(params, {
    llmConfig: { ...llmConfig, base_url: 'https://api.deepseek.com/v1' },
    request
  }) as typeof params & { prompt_cache_key?: string }
  const unknownParams = applyPromptCacheOptions(params, {
    llmConfig: { ...llmConfig, base_url: 'https://proxy.example.com/v1' },
    request
  }) as typeof params & { prompt_cache_key?: string }

  assert.equal(typeof openAIParams.prompt_cache_key, 'string')
  assert.equal(openAIParams.prompt_cache_retention, '24h')
  assert.equal(deepSeekParams.prompt_cache_key, undefined)
  assert.equal(unknownParams.prompt_cache_key, undefined)
})

test('DeepSeek usage 字段优先映射到统一缓存统计', () => {
  const usage = extractTokenUsage({
    prompt_tokens: 1200,
    completion_tokens: 100,
    total_tokens: 1300,
    prompt_cache_hit_tokens: 900,
    prompt_cache_miss_tokens: 300,
    prompt_tokens_details: { cached_tokens: 1 }
  })

  assert.equal(usage.cached_prompt_tokens, 900)
  assert.equal(usage.uncached_prompt_tokens, 300)
  assert.equal(usage.prompt_cache_hit_rate, 0.75)
})

test('缓存诊断按消息公共前缀区分追加、预热与历史改写', () => {
  const base = {
    model: 'model',
    messages: [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: 'A' },
      { role: 'assistant' as const, content: 'B' }
    ],
    tools: []
  }
  const appended = {
    ...base,
    messages: [...base.messages, { role: 'user' as const, content: 'C' }]
  }
  const commonPrefix = {
    ...base,
    messages: [base.messages[0], base.messages[1], { role: 'assistant' as const, content: 'D' }]
  }
  const rewritten = {
    ...base,
    messages: [base.messages[0], { role: 'user' as const, content: 'X' }]
  }

  assert.equal(classifyPromptCacheRelationship(base, appended), 'append_only')
  assert.equal(classifyPromptCacheRelationship(base, commonPrefix), 'common_prefix_warmup')
  assert.equal(classifyPromptCacheRelationship(base, rewritten), 'history_rewritten')
})

test('缓存诊断容忍公共前缀的前两次预热请求', () => {
  const warnings: unknown[] = []
  const logger = {
    warn: (...args: unknown[]) => warnings.push(args)
  } as unknown as Logger
  const deepSeekConfig: LLMConfig = {
    base_url: 'https://api.deepseek.com/v1',
    api_key: 'key',
    model_name: 'deepseek-chat'
  }
  const request: ChatRequest = {
    ...createRequest([]),
    sessionId: 'session-common-prefix-warmup',
    paperId: undefined,
    sessionType: 'default'
  }
  const usage = extractTokenUsage({
    prompt_tokens: 2000,
    completion_tokens: 10,
    total_tokens: 2010,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 2000
  })
  const buildParams = (suffix: string) => ({
    model: 'deepseek-chat',
    messages: [
      { role: 'system' as const, content: 'system' },
      { role: 'user' as const, content: '共享前缀' },
      { role: 'assistant' as const, content: suffix }
    ]
  })
  const options = {
    llmConfig: deepSeekConfig,
    request,
    mode: 'react' as const,
    scene: '测试公共前缀预热'
  }

  recordPromptCacheDiagnostics(options, buildParams('第一次后缀'), usage, logger)
  recordPromptCacheDiagnostics(options, buildParams('第二次后缀'), usage, logger)
  assert.equal(warnings.length, 0)

  recordPromptCacheDiagnostics(options, buildParams('第三次后缀'), usage, logger)
  assert.equal(warnings.length, 1)
})
