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
