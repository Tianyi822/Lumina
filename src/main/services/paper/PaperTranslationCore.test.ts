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

test('作者、机构与邮箱段会被直接跳过且保留原文', async () => {
  const markdown = [
    '# Sample Paper',
    '',
    'Haochen Li 1,4 Rui Zhang 2* Hantao Yao 3 Xin Zhang 2',
    '',
    '1 Intelligent Software Research Center, Institute of Software, CAS',
    '',
    'haozhang@example.com',
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

  const segments = parsePaperTranslationSegments(markdown)
  const authorSegment = segments[1]
  const affiliationSegment = segments[2]
  const emailSegment = segments[3]
  assert.equal(isAuthorLikeSegment(authorSegment), true)
  assert.equal(isAuthorLikeSegment(affiliationSegment), true)
  assert.equal(isAuthorLikeSegment(emailSegment), true)

  const result = await core.startTranslation('paper-author', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-author'))

  const cache = cacheStore.get('paper-author')
  assert.ok(cache)
  assert.equal(cache.entries[1].status, 'skipped')
  assert.equal(cache.entries[2].status, 'skipped')
  assert.equal(cache.entries[3].status, 'skipped')
  assert.equal(cache.entries[1].translatedMarkdown, cache.entries[1].originalMarkdown)
  assert.equal(cache.entries[2].translatedMarkdown, cache.entries[2].originalMarkdown)
  assert.equal(cache.entries[3].translatedMarkdown, cache.entries[3].originalMarkdown)
  assert.equal(translateCallCount, 2)
})

test('标题段会清理参考标签并截断误并入的正文', async () => {
  const markdown = ['# 1 Introduction', '', 'This is the first paragraph.'].join('\n')
  const cacheStore = new Map<string, PaperTranslationCache>()

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
      if (segment.kind === 'heading') {
        return [
          '[下一段原文参考]',
          '',
          '<translation>',
          '1 引言',
          '',
          '作为计算机视觉的一项基础任务，目标检测仍然面临诸多挑战。',
          '</translation>'
        ].join('\n')
      }

      return '这是第一段正文。'
    }
  })

  const result = await core.startTranslation('paper-heading', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-heading'))

  const cache = cacheStore.get('paper-heading')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'completed')
  assert.equal(cache.entries[0].translatedMarkdown, '# 1 引言')
  assert.equal(cache.entries[0].translatedText, '1 引言')
  assert.doesNotMatch(cache.entries[0].translatedMarkdown || '', /下一段原文参考|基础任务/)
})

test('独立公式段会被跳过且不会触发翻译调用', async () => {
  const markdown = [
    '# Method',
    '',
    '$$\\mathcal{L}_{total} = \\lambda_1 \\mathcal{L}_{cls} + \\lambda_2 \\mathcal{L}_{reg}$$',
    '',
    '\\begin{equation} E = mc^2 \\end{equation}',
    '',
    'The optimization objective is defined as follows.'
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

  const result = await core.startTranslation('paper-formula', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-formula'))

  const cache = cacheStore.get('paper-formula')
  assert.ok(cache)
  assert.equal(cache.entries[1].status, 'skipped')
  assert.equal(cache.entries[2].status, 'skipped')
  assert.equal(cache.entries[1].translatedMarkdown, cache.entries[1].originalMarkdown)
  assert.equal(cache.entries[2].translatedMarkdown, cache.entries[2].originalMarkdown)
  assert.equal(translateCallCount, 2)
})

test('图片段会被跳过且不会触发翻译调用', async () => {
  const markdown = [
    '# Results',
    '',
    '![Architecture](./assets/figure-1.png)',
    '',
    '<div><img src="./assets/figure-2.png" /></div>',
    '',
    'The qualitative comparison is shown below.'
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

  const result = await core.startTranslation('paper-image', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-image'))

  const cache = cacheStore.get('paper-image')
  assert.ok(cache)
  assert.equal(cache.entries[1].status, 'skipped')
  assert.equal(cache.entries[2].status, 'skipped')
  assert.equal(cache.entries[1].translatedMarkdown, cache.entries[1].originalMarkdown)
  assert.equal(cache.entries[2].translatedMarkdown, cache.entries[2].originalMarkdown)
  assert.equal(translateCallCount, 2)
})

test('分隔线段会被跳过且不会在开头触发无意义翻译', async () => {
  const markdown = ['---', '', '# DEYOLO', '', 'This is the first paragraph.'].join('\n')
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

  const result = await core.startTranslation('paper-divider', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-divider'))

  const cache = cacheStore.get('paper-divider')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'skipped')
  assert.equal(cache.entries[0].translatedMarkdown, cache.entries[0].originalMarkdown)
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

test('中断后遗留为 translating 的段落可以重新排队翻译', async () => {
  const markdown = ['Paragraph A.', '', 'Paragraph B.'].join('\n')
  const sourceHash = computePaperTranslationSourceHash(markdown)
  const cacheStore = new Map<string, PaperTranslationCache>()
  let translatedSegments: string[] = []

  cacheStore.set('paper-resume', {
    paperId: 'paper-resume',
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
        status: 'translating'
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
      translatedSegments = [...translatedSegments, segment.id]
      return `译文：${segment.originalMarkdown}`
    }
  })

  const startResult = await core.startTranslation('paper-resume', markdown)
  assert.equal(startResult.success, true)
  await waitFor(() => !core.isRunning('paper-resume'))

  const resumedCache = cacheStore.get('paper-resume')
  assert.ok(resumedCache)
  assert.deepEqual(translatedSegments, ['seg-1'])
  assert.equal(resumedCache.completedSegments, 2)
  assert.equal(resumedCache.entries[0].translatedMarkdown, '译文：Paragraph A.')
  assert.equal(resumedCache.entries[1].status, 'completed')
})
