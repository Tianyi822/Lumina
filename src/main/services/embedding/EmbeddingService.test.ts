import test from 'node:test'
import assert from 'node:assert/strict'
import OpenAI from 'openai'
import type { EmbeddingConfig } from '../../../shared/types/config.ts'
import { EmbeddingService } from './EmbeddingService.ts'

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
  const tokenEstimator = (text: string) => Number(text.split(':')[1])
  const service = new EmbeddingService({
    now: clock.now,
    sleep: clock.sleep,
    tokenEstimator,
    limiterRegistry: new Map(),
    clientFactory: () => createFakeClient(records, clock.now, tokenEstimator)
  })

  service.setConfig(TEST_CONFIG)

  const result = await service.embedBatch(['chunk-a:20000', 'chunk-b:20000', 'chunk-c:20000', 'chunk-d:20000'])

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
  const tokenEstimator = () => 10

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
  const tokenEstimator = (text: string) => Number(text.split(':')[1])
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
