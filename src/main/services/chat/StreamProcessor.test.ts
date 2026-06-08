import test from 'node:test'
import assert from 'node:assert/strict'
import type OpenAI from 'openai'
import type { WebContents } from 'electron'
import { StreamProcessor } from './StreamProcessor.ts'
import type { StreamHandler } from './StreamHandler.ts'

type StreamChunk = OpenAI.Chat.Completions.ChatCompletionChunk

async function* createUsageStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk
  }
}

function createUsageChunk(
  promptTokens: number,
  completionTokens: number,
  cachedTokens: number
): StreamChunk {
  return {
    id: `usage-${promptTokens}-${cachedTokens}`,
    object: 'chat.completion.chunk',
    created: 1,
    model: 'model',
    choices: [],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      prompt_tokens_details: {
        cached_tokens: cachedTokens
      }
    }
  } as StreamChunk
}

function createSilentStreamHandler(): StreamHandler {
  return {
    sendReasoning: () => {},
    sendContent: () => {}
  } as unknown as StreamHandler
}

test('StreamProcessor 仅将原生 reasoning_content 保留用于 API 回放', async () => {
  const processor = new StreamProcessor(createSilentStreamHandler())
  const stream = createUsageStream([
    {
      id: 'reasoning-native',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'model',
      choices: [{ index: 0, delta: { reasoning_content: '原生思考' } }]
    } as unknown as StreamChunk,
    {
      id: 'reasoning-tagged',
      object: 'chat.completion.chunk',
      created: 2,
      model: 'model',
      choices: [{ index: 0, delta: { content: '<think>标签思考</think>可见回答' } }]
    } as StreamChunk
  ])

  const result = await processor.processStream(stream, {} as WebContents, 'session-reasoning')

  assert.equal(result.state.assistantReasoningContent, '原生思考标签思考')
  assert.equal(result.state.assistantApiReasoningContent, '原生思考')
  assert.equal(result.state.assistantContent, '可见回答')
})

test('StreamProcessor 聚合 Prompt Cache usage 字段', async () => {
  const processor = new StreamProcessor({} as StreamHandler)

  const result = await processor.processStream(
    createUsageStream([createUsageChunk(1000, 100, 800), createUsageChunk(500, 50, 200)]),
    {} as WebContents,
    'session-cache-usage'
  )

  assert.equal(result.totalUsage.prompt_tokens, 1500)
  assert.equal(result.totalUsage.completion_tokens, 150)
  assert.equal(result.totalUsage.total_tokens, 1650)
  assert.equal(result.totalUsage.cached_prompt_tokens, 1000)
  assert.equal(result.totalUsage.uncached_prompt_tokens, 500)
  assert.equal(result.totalUsage.prompt_cache_hit_rate, 1000 / 1500)
})

test('StreamProcessor 聚合 DeepSeek 顶层 Prompt Cache usage 字段', async () => {
  const processor = new StreamProcessor({} as StreamHandler)
  const deepSeekChunk = {
    id: 'deepseek-usage',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'deepseek-chat',
    choices: [],
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 100,
      total_tokens: 1100,
      prompt_cache_hit_tokens: 750,
      prompt_cache_miss_tokens: 250
    }
  } as unknown as StreamChunk

  const result = await processor.processStream(
    createUsageStream([deepSeekChunk]),
    {} as WebContents,
    'session-deepseek-cache-usage'
  )

  assert.equal(result.totalUsage.cached_prompt_tokens, 750)
  assert.equal(result.totalUsage.uncached_prompt_tokens, 250)
  assert.equal(result.totalUsage.prompt_cache_hit_rate, 0.75)
})
