import test from 'node:test'
import assert from 'node:assert/strict'
import OpenAI from 'openai'
import type { EmbeddingConfig } from '../../../shared/types/config.ts'
import { EmbeddingService, isEmbeddingFailure } from './EmbeddingService.ts'

interface VirtualClock {
  now: () => number
  sleep: (ms: number) => Promise<void>
}

interface EmbeddingCallRecord {
  time: number
  inputs: string[]
  promptTokens: number
}

const TEST_CONFIG: EmbeddingConfig = {
  baseUrl: 'https://example.com/v1',
  apiKey: 'test-key',
  model: 'test-embedding-model',
  dimensions: 1024
}

function createVirtualClock(): VirtualClock {
  let currentTime = 0

  return {
    now: () => currentTime,
    sleep: async (ms: number) => {
      currentTime += ms
    }
  }
}

function createFakeClient(
  records: EmbeddingCallRecord[],
  now: () => number,
  tokenEstimator: (text: string) => number
): {
  embeddings: {
    create: (
      params: OpenAI.EmbeddingCreateParams
    ) => Promise<Awaited<ReturnType<OpenAI['embeddings']['create']>>>
  }
} {
  let requestCount = 0

  return {
    embeddings: {
      create: async (params) => {
        requestCount += 1
        const inputs = Array.isArray(params.input) ? params.input : [params.input]
        const textInputs = inputs.map((input) => {
          if (typeof input !== 'string') {
            throw new Error('测试桩仅支持字符串输入')
          }
          return input
        })
        const promptTokens = textInputs.reduce((sum, text) => sum + tokenEstimator(text), 0)

        records.push({
          time: now(),
          inputs: textInputs,
          promptTokens
        })

        return {
          object: 'list',
          data: textInputs.map((_text, index) => ({
            object: 'embedding',
            embedding: [requestCount, index],
            index
          })),
          model: params.model,
          usage: {
            prompt_tokens: promptTokens,
            total_tokens: promptTokens
          }
        }
      }
    }
  }
}

test('批量嵌入会按可持续 Token 预算动态拆批并保持输出顺序', async () => {
  const clock = createVirtualClock()
  const records: EmbeddingCallRecord[] = []
  const tokenEstimator = (text: string): number => Number(text.split(':')[1])
  const service = new EmbeddingService({
    now: clock.now,
    sleep: clock.sleep,
    tokenEstimator,
    limiterRegistry: new Map(),
    clientFactory: () => createFakeClient(records, clock.now, tokenEstimator)
  })

  service.setConfig(TEST_CONFIG)

  const batchResult = await service.embedBatch([
    'chunk-a:20000',
    'chunk-b:20000',
    'chunk-c:20000',
    'chunk-d:20000'
  ])
  if (isEmbeddingFailure(batchResult)) {
    assert.fail(`Unexpected failure: ${batchResult.error}`)
  }
  const result = batchResult

  assert.deepEqual(
    records.map((record) => record.inputs.length),
    [3, 1]
  )
  assert.deepEqual(result.embeddings, [
    [1, 0],
    [1, 1],
    [1, 2],
    [2, 0]
  ])
  assert.deepEqual(result.usage, {
    prompt_tokens: 80000,
    total_tokens: 80000
  })
})

test('同一模型的多个嵌入服务实例会共享 20 RPS 限流窗口', async () => {
  const clock = createVirtualClock()
  const limiterRegistry = new Map()
  const records: EmbeddingCallRecord[] = []
  const tokenEstimator = (): number => 10

  const createService = (): EmbeddingService => {
    const service = new EmbeddingService({
      now: clock.now,
      sleep: clock.sleep,
      tokenEstimator,
      limiterRegistry,
      clientFactory: () => createFakeClient(records, clock.now, tokenEstimator)
    })
    service.setConfig(TEST_CONFIG)
    return service
  }

  const serviceA = createService()
  const serviceB = createService()

  await Promise.all(
    Array.from({ length: 21 }, (_unused, index) =>
      (index % 2 === 0 ? serviceA : serviceB).embed(`query-${index}`)
    )
  )

  const requestTimes = records.map((record) => record.time).sort((left, right) => left - right)

  assert.equal(records.length, 21)
  assert.equal(clock.now(), 1000)
  assert.equal(requestTimes[20], 1000)
})

test('分钟 Token 余量不足时会先发送可容纳的子批次而不是整批等待', async () => {
  const clock = createVirtualClock()
  const records: EmbeddingCallRecord[] = []
  const tokenEstimator = (text: string): number => Number(text.split(':')[1])
  const service = new EmbeddingService({
    now: clock.now,
    sleep: clock.sleep,
    tokenEstimator,
    limiterRegistry: new Map(),
    clientFactory: () => createFakeClient(records, clock.now, tokenEstimator)
  })

  service.setConfig(TEST_CONFIG)

  await service.embedBatch(['prefill:1190000'])
  await service.embedBatch(['follow-up-a:8000', 'follow-up-b:8000'])

  assert.deepEqual(
    records.map((record) => ({
      time: record.time,
      inputs: record.inputs.length,
      promptTokens: record.promptTokens
    })),
    [
      { time: 0, inputs: 1, promptTokens: 1190000 },
      { time: 0, inputs: 1, promptTokens: 8000 },
      { time: 60000, inputs: 1, promptTokens: 8000 }
    ]
  )
})

// --- 构造与配置测试 ---

test('无配置时 getConfig 返回 null', () => {
  const service = new EmbeddingService()
  assert.equal(service.getConfig(), null)
})

test('setConfig 后 getConfig 返回配置', () => {
  const service = new EmbeddingService()
  service.setConfig(TEST_CONFIG)
  const config = service.getConfig()
  assert.notEqual(config, null)
  assert.equal(config!.baseUrl, TEST_CONFIG.baseUrl)
  assert.equal(config!.model, TEST_CONFIG.model)
  assert.equal(config!.apiKey, TEST_CONFIG.apiKey)
  assert.equal(config!.dimensions, TEST_CONFIG.dimensions)
})

test('无配置时 embed 返回 success: false（错误包含"未配置"）', async () => {
  const service = new EmbeddingService()
  const result = await service.embed('hello')
  assert.ok(isEmbeddingFailure(result) && result.error.includes('未配置'))
})

test('无配置时 embedBatch 返回 success: false（错误包含"未配置"）', async () => {
  const service = new EmbeddingService()
  const result = await service.embedBatch(['hello'])
  assert.ok(isEmbeddingFailure(result) && result.error.includes('未配置'))
})

test('空文本列表 embedBatch 返回 success: false（错误包含"不能为空"）', async () => {
  const service = new EmbeddingService()
  service.setConfig(TEST_CONFIG)
  const result = await service.embedBatch([])
  assert.ok(isEmbeddingFailure(result) && result.error.includes('不能为空'))
})

test('无配置时 testConnection 返回 success: false（错误包含"未配置"）', async () => {
  const service = new EmbeddingService()
  const result = await service.testConnection()
  assert.equal(result.success, false)
  assert.ok(result.error!.includes('未配置'))
})

test('testConnection 在 API 返回空 data 时给出明确错误而非读取 undefined[0]', async () => {
  const service = new EmbeddingService({
    clientFactory: () => ({
      embeddings: {
        create: async () => ({
          object: 'list',
          data: [],
          model: 'test-model',
          usage: { prompt_tokens: 0, total_tokens: 0 }
        })
      }
    })
  })

  service.setConfig(TEST_CONFIG)
  const result = await service.testConnection()

  assert.equal(result.success, false)
  assert.ok(result.error?.includes('返回数据为空'))
})

test('testConnection 在网关返回 error 字段时提示修正 baseUrl', async () => {
  const service = new EmbeddingService({
    clientFactory: () => ({
      embeddings: {
        create: async () =>
          ({
            error: 'Unexpected endpoint or method. (POST /v1/embeddings/embeddings)'
          }) as unknown as Awaited<ReturnType<OpenAI['embeddings']['create']>>
      }
    })
  })

  service.setConfig(TEST_CONFIG)
  const result = await service.testConnection()

  assert.equal(result.success, false)
  assert.ok(result.error?.includes('不要包含 /embeddings'))
})

test('testConnection 支持顶层 embedding 字段的兼容响应', async () => {
  const service = new EmbeddingService({
    clientFactory: () => ({
      embeddings: {
        create: async () =>
          ({
            object: 'list',
            model: 'legacy-model',
            embedding: [0.1, 0.2, 0.3]
          }) as unknown as Awaited<ReturnType<OpenAI['embeddings']['create']>>
      }
    })
  })

  service.setConfig(TEST_CONFIG)
  const result = await service.testConnection()

  assert.equal(result.success, true)
  assert.equal(result.model, 'legacy-model')
  assert.equal(result.dimensions, 3)
})
