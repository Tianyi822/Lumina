import test from 'node:test'
import assert from 'node:assert/strict'
import type { ChatRequest } from '@shared/types/chat'
import type { LLMConfig } from '@shared/types/config'
import { buildPromptCacheKey } from './PromptCacheOptimizer.ts'

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

test('模型或工具签名变化时 Prompt Cache key 会变化', () => {
  const request = createRequest([{ role: 'user', content: '同一个问题' }])
  const baseKey = buildPromptCacheKey({ llmConfig, request })
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
