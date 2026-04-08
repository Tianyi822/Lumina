import test from 'node:test'
import assert from 'node:assert/strict'
import type { LLMConfig } from '../../../shared/types/config.ts'
import type { PaperTranslationCache, PaperTranslationSegment } from '../../../shared/types/paper.ts'
import {
  PaperTranslationCore,
  computePaperTranslationSourceHash,
  isAuthorLikeSegment
} from './PaperTranslationCore.ts'
import { parsePaperTranslationSegments } from '../../../shared/utils/paperTranslation.ts'

const TEST_LLM_CONFIG: LLMConfig = {
  base_url: 'https://example.com',
  api_key: 'test-key',
  model_name: 'test-model',
  temperature: 0.2,
  max_tokens: 2048
}

function createLogger(): {
  info: () => void
  warn: () => void
  error: () => void
} {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now()

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('等待超时')
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('作者信息段会被直接跳过且保留原文', async () => {
  const markdown = [
    '# Sample Paper',
    '',
    'Haochen Li 1,4 Rui Zhang 2* Hantao Yao 3 Xin Zhang 2',
    '',
    'This is the first paragraph.'
  ].join('\n')
  const cacheStore = new Map<string, PaperTranslationCache>()
  let translateCallCount = 0

  const core = new PaperTranslationCore({
    logger: createLogger(),
    getDefaultLlmConfig: () => TEST_LLM_CONFIG,
    readCache: (paperId) => ({ success: true, data: cacheStore.get(paperId) }),
    saveCache: (paperId, cache) => {
      cacheStore.set(paperId, structuredClone(cache))
      return { success: true }
    },
    clearCache: (paperId) => {
      cacheStore.delete(paperId)
      return { success: true }
    },
    translateSegment: async (_config, _prompt, segment) => {
      translateCallCount += 1
      return `译文：${segment.originalMarkdown}`
    }
  })

  const authorSegment = parsePaperTranslationSegments(markdown)[1]
  assert.equal(isAuthorLikeSegment(authorSegment), true)

  const result = await core.startTranslation('paper-author', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-author'))

  const cache = cacheStore.get('paper-author')
  assert.ok(cache)
  assert.equal(cache.entries[1].status, 'skipped')
  assert.equal(cache.entries[1].translatedMarkdown, cache.entries[1].originalMarkdown)
  assert.equal(translateCallCount, 2)
})

test('翻译任务会限制最大并发数并按段持久化缓存', async () => {
  const markdown = [
    'Paragraph A.',
    '',
    'Paragraph B.',
    '',
    'Paragraph C.',
    '',
    'Paragraph D.'
  ].join('\n')
  const cacheStore = new Map<string, PaperTranslationCache>()
  let activeCount = 0
  let maxActiveCount = 0
  const progressEvents: string[] = []

  const core = new PaperTranslationCore({
    logger: createLogger(),
    concurrency: 3,
    getDefaultLlmConfig: () => TEST_LLM_CONFIG,
    readCache: (paperId) => ({ success: true, data: cacheStore.get(paperId) }),
    saveCache: (paperId, cache) => {
      cacheStore.set(paperId, structuredClone(cache))
      return { success: true }
    },
    clearCache: (paperId) => {
      cacheStore.delete(paperId)
      return { success: true }
    },
    translateSegment: async (_config, _prompt, segment: PaperTranslationSegment) => {
      activeCount += 1
      maxActiveCount = Math.max(maxActiveCount, activeCount)
      await new Promise((resolve) => setTimeout(resolve, 25))
      activeCount -= 1
      return `译文：${segment.originalMarkdown}`
    }
  })

  core.onProgress('paper-concurrency', (progress) => {
    progressEvents.push(`${progress.segmentId}:${progress.status}`)
  })

  const result = await core.startTranslation('paper-concurrency', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-concurrency'))

  const cache = cacheStore.get('paper-concurrency')
  assert.ok(cache)
  assert.equal(cache.completedSegments, 4)
  assert.equal(maxActiveCount, 3)
  assert.match(progressEvents.join(','), /seg-0:translating/)
  assert.match(progressEvents.join(','), /seg-3:completed/)
})

test('会复用已完成缓存并在正文哈希变化时使旧缓存失效', async () => {
  const markdown = ['Paragraph A.', '', 'Paragraph B.'].join('\n')
  const sourceHash = computePaperTranslationSourceHash(markdown)
  const cacheStore = new Map<string, PaperTranslationCache>()
  let translateCallCount = 0

  cacheStore.set('paper-cache', {
    paperId: 'paper-cache',
    sourceHash,
    totalSegments: 2,
    completedSegments: 1,
    updatedAt: new Date().toISOString(),
    entries: [
      {
        ...parsePaperTranslationSegments(markdown)[0],
        status: 'completed',
        translatedMarkdown: '译文：Paragraph A.',
        translatedText: '译文：Paragraph A.'
      },
      {
        ...parsePaperTranslationSegments(markdown)[1],
        status: 'failed'
      }
    ]
  })

  const core = new PaperTranslationCore({
    logger: createLogger(),
    getDefaultLlmConfig: () => TEST_LLM_CONFIG,
    readCache: (paperId) => ({ success: true, data: cacheStore.get(paperId) }),
    saveCache: (paperId, cache) => {
      cacheStore.set(paperId, structuredClone(cache))
      return { success: true }
    },
    clearCache: (paperId) => {
      cacheStore.delete(paperId)
      return { success: true }
    },
    translateSegment: async (_config, _prompt, segment) => {
      translateCallCount += 1
      return `译文：${segment.originalMarkdown}`
    }
  })

  const startResult = await core.startTranslation('paper-cache', markdown)
  assert.equal(startResult.success, true)
  await waitFor(() => !core.isRunning('paper-cache'))

  const reusedCache = cacheStore.get('paper-cache')
  assert.ok(reusedCache)
  assert.equal(reusedCache.completedSegments, 2)
  assert.equal(translateCallCount, 1)
  assert.equal(reusedCache.entries[0].translatedMarkdown, '译文：Paragraph A.')

  const changedState = core.getTranslationState('paper-cache', `${markdown}\n\nParagraph C.`)
  assert.equal(changedState.success, true)
  assert.equal(changedState.data?.cache, null)
})
