import test from 'node:test'
import assert from 'node:assert/strict'
import type { LLMConfig } from '../../../shared/types/config.ts'
import type {
  PaperFigureItem,
  PaperTranslationCache,
  PaperTranslationSegment
} from '../../../shared/types/paper.ts'
import { PaperTranslationCore, computePaperTranslationSourceHash } from './PaperTranslationCore.ts'
import { parsePaperTranslationSegments } from '../../../shared/utils/paperTranslation.ts'

const TEST_LLM_CONFIG: LLMConfig = {
  base_url: 'https://example.com',
  api_key: 'test-key',
  model_name: 'test-model'
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

function createDeferred(): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolvePromise: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve: resolvePromise
  }
}

function createFigure(overrides: Partial<PaperFigureItem> = {}): PaperFigureItem {
  return {
    id: overrides.id ?? 'fig-1',
    paperId: overrides.paperId ?? 'paper-figure',
    pageIndex: overrides.pageIndex ?? 0,
    blockIndex: overrides.blockIndex ?? 0,
    groupId: overrides.groupId ?? 'group-1',
    imagePath: overrides.imagePath ?? '/tmp/figure-1.png',
    caption: overrides.caption ?? '',
    subCaption: overrides.subCaption,
    bbox: overrides.bbox ?? { x: 0, y: 0, width: 100, height: 80 }
  }
}

test('作者与联系信息会跳过翻译，但机构段仍会参与翻译', async () => {
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

  const result = await core.startTranslation('paper-author', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-author'))

  const cache = cacheStore.get('paper-author')
  assert.ok(cache)
  assert.equal(cache.entries[1].status, 'skipped')
  assert.equal(cache.entries[2].status, 'completed')
  assert.equal(cache.entries[3].status, 'skipped')
  assert.equal(cache.entries[1].translatedMarkdown, cache.entries[1].originalMarkdown)
  assert.equal(cache.entries[3].translatedMarkdown, cache.entries[3].originalMarkdown)
  assert.equal(translateCallCount, 3)
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

test('模型返回多个带 ID 的翻译标签时会按当前段落 ID 提取', async () => {
  const markdown = ['Current paragraph.', '', 'Next paragraph.'].join('\n')
  const cacheStore = new Map<string, PaperTranslationCache>()
  const prompts: string[] = []

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
    translateSegment: async (_config, prompt, segment) => {
      prompts.push(prompt)
      if (segment.id === 'seg-0') {
        return [
          '<translation id="seg-0">当前段落。</translation>',
          '<translation id="seg-1">下一段落。</translation>'
        ].join('\n\n')
      }

      return '下一段落。'
    }
  })

  const result = await core.startTranslation('paper-tagged-alignment', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-tagged-alignment'))

  const cache = cacheStore.get('paper-tagged-alignment')
  assert.ok(cache)
  assert.match(prompts[0], /<current_segment id="seg-0" index="0" kind="paragraph">/)
  assert.equal(cache.entries[0].status, 'completed')
  assert.equal(cache.entries[0].translatedMarkdown, '当前段落。')
  assert.match(cache.entries[0].alignmentWarning || '', /段落 ID/)
  assert.equal(cache.entries[1].translatedMarkdown, '下一段落。')
})

test('模型返回多个无标签翻译块时只安全回填当前段落块', async () => {
  const markdown = ['Current paragraph.', '', 'Next paragraph.'].join('\n')
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
      if (segment.id === 'seg-0') {
        return ['当前段落。', '不应写入相邻段落。'].join('\n\n')
      }

      return '下一段落。'
    }
  })

  const result = await core.startTranslation('paper-block-alignment', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-block-alignment'))

  const cache = cacheStore.get('paper-block-alignment')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'completed')
  assert.equal(cache.entries[0].translatedMarkdown, '当前段落。')
  assert.doesNotMatch(cache.entries[0].translatedMarkdown || '', /相邻段落/)
  assert.match(cache.entries[0].alignmentWarning || '', /翻译块/)
  assert.equal(cache.entries[1].translatedMarkdown, '下一段落。')
})

test('模型返回不匹配的翻译标签时会标记失败而不是写入错位译文', async () => {
  const markdown = ['Current paragraph.', '', 'Next paragraph.'].join('\n')
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
      if (segment.id === 'seg-0') {
        return '<translation id="seg-1">错位译文。</translation>'
      }

      return '下一段落。'
    }
  })

  const result = await core.startTranslation('paper-id-mismatch', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-id-mismatch'))

  const cache = cacheStore.get('paper-id-mismatch')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'failed')
  assert.equal(cache.entries[0].translatedMarkdown, undefined)
  assert.match(cache.entries[0].errorMessage || '', /段落 ID 不匹配/)
  assert.equal(cache.entries[1].translatedMarkdown, '下一段落。')
})

test('看起来像作者姓名的标题段仍会参与翻译', async () => {
  const markdown = '# Alice Bob Charlie David'
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
    translateSegment: async () => {
      translateCallCount += 1
      return '作者式标题'
    }
  })

  const result = await core.startTranslation('paper-author-like-heading', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-author-like-heading'))

  const cache = cacheStore.get('paper-author-like-heading')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'completed')
  assert.equal(cache.entries[0].translatedMarkdown, '# 作者式标题')
  assert.equal(translateCallCount, 1)
})

test('旧缓存中被跳过的标题段会在重新翻译时补译', async () => {
  const markdown = ['# Alice Bob Charlie David', '', 'Paragraph A.'].join('\n')
  const segments = parsePaperTranslationSegments(markdown)
  const sourceHash = computePaperTranslationSourceHash(markdown)
  const cacheStore = new Map<string, PaperTranslationCache>()
  let translateCallCount = 0

  cacheStore.set('paper-stale-heading', {
    paperId: 'paper-stale-heading',
    sourceHash,
    sourceHashVersion: 2,
    totalSegments: 2,
    completedSegments: 2,
    updatedAt: new Date().toISOString(),
    entries: [
      {
        ...segments[0],
        status: 'skipped',
        translatedMarkdown: segments[0].originalMarkdown,
        translatedText: segments[0].originalText
      },
      {
        ...segments[1],
        status: 'completed',
        translatedMarkdown: '段落 A。',
        translatedText: '段落 A。'
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
      return segment.kind === 'heading' ? '补译标题' : `译文：${segment.originalMarkdown}`
    }
  })

  const result = await core.startTranslation('paper-stale-heading', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-stale-heading'))

  const cache = cacheStore.get('paper-stale-heading')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'completed')
  assert.equal(cache.entries[0].translatedMarkdown, '# 补译标题')
  assert.equal(cache.entries[1].translatedText, '段落 A。')
  assert.equal(translateCallCount, 1)
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

test('图片 caption 会作为附加段落参与翻译并在未变化时复用缓存', async () => {
  const markdown = 'The qualitative comparison is shown below.'
  const figures: PaperFigureItem[] = [
    createFigure({
      id: 'fig-1',
      caption: 'Figure 1. Overall framework.'
    }),
    createFigure({
      id: 'fig-2',
      blockIndex: 1,
      imagePath: '/tmp/figure-2.png',
      caption: '',
      subCaption: '(a) Encoder branch'
    })
  ]
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

  const firstResult = await core.startTranslation('paper-caption', markdown, figures)
  assert.equal(firstResult.success, true)
  await waitFor(() => !core.isRunning('paper-caption'))

  const firstCache = cacheStore.get('paper-caption')
  assert.ok(firstCache)
  assert.equal(firstCache.entries.length, 3)
  assert.equal(firstCache.entries[1].id, 'fig-caption-fig-1')
  assert.equal(firstCache.entries[1].translatedText, '译文：Figure 1. Overall framework.')
  assert.equal(firstCache.entries[2].id, 'fig-caption-fig-2')
  assert.equal(firstCache.entries[2].translatedText, '译文：(a) Encoder branch')
  assert.equal(translateCallCount, 3)

  const secondResult = await core.startTranslation('paper-caption', markdown, figures)
  assert.equal(secondResult.success, true)
  await waitFor(() => !core.isRunning('paper-caption'))
  assert.equal(translateCallCount, 3)
})

test('旧缓存缺少图片 caption 条目时会复用正文并补齐 caption', async () => {
  const markdown = 'The qualitative comparison is shown below.'
  const figures = [createFigure({ id: 'fig-1', caption: 'Figure 1. Overall framework.' })]
  const segments = parsePaperTranslationSegments(markdown)
  const cacheStore = new Map<string, PaperTranslationCache>()
  let clearCount = 0
  let translateCallCount = 0

  cacheStore.set('paper-missing-caption', {
    paperId: 'paper-missing-caption',
    sourceHash: computePaperTranslationSourceHash(markdown),
    sourceHashVersion: 2,
    totalSegments: 1,
    completedSegments: 1,
    updatedAt: new Date().toISOString(),
    entries: [
      {
        ...segments[0],
        status: 'completed',
        translatedMarkdown: '定性比较如下所示。',
        translatedText: '定性比较如下所示。'
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
      clearCount += 1
      cacheStore.delete(paperId)
      return { success: true }
    },
    translateSegment: async (_config, _prompt, segment) => {
      translateCallCount += 1
      return `译文：${segment.originalMarkdown}`
    }
  })

  const result = await core.startTranslation('paper-missing-caption', markdown, figures)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-missing-caption'))

  const cache = cacheStore.get('paper-missing-caption')
  assert.ok(cache)
  assert.equal(cache.entries.length, 2)
  assert.equal(cache.entries[0].translatedText, '定性比较如下所示。')
  assert.equal(cache.entries[1].id, 'fig-caption-fig-1')
  assert.equal(cache.entries[1].translatedText, '译文：Figure 1. Overall framework.')
  assert.equal(clearCount, 0)
  assert.equal(translateCallCount, 1)
})

test('分隔线段会被跳过且不会触发翻译调用', async () => {
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

test('旧哈希缓存会在描述符一致时自动迁移并恢复', () => {
  const markdown = ['Paragraph A.', '', 'Paragraph B.'].join('\n')
  const cacheStore = new Map<string, PaperTranslationCache>()
  const savedCaches: PaperTranslationCache[] = []
  const segments = parsePaperTranslationSegments(markdown)

  cacheStore.set('paper-legacy-cache', {
    paperId: 'paper-legacy-cache',
    sourceHash: 'legacy-hash',
    totalSegments: 2,
    completedSegments: 2,
    updatedAt: new Date().toISOString(),
    entries: [
      {
        ...segments[0],
        status: 'completed',
        translatedMarkdown: '译文：Paragraph A.',
        translatedText: '译文：Paragraph A.'
      },
      {
        ...segments[1],
        status: 'completed',
        translatedMarkdown: '译文：Paragraph B.',
        translatedText: '译文：Paragraph B.'
      }
    ]
  })

  const core = new PaperTranslationCore({
    logger: createLogger(),
    getDefaultLlmConfig: () => TEST_LLM_CONFIG,
    readCache: (paperId) => ({ success: true, data: cacheStore.get(paperId) }),
    saveCache: (paperId, cache) => {
      savedCaches.push(structuredClone(cache))
      cacheStore.set(paperId, structuredClone(cache))
      return { success: true }
    },
    clearCache: (paperId) => {
      cacheStore.delete(paperId)
      return { success: true }
    },
    translateSegment: async (_config, _prompt, segment) => `译文：${segment.originalMarkdown}`
  })

  const state = core.getTranslationState('paper-legacy-cache', markdown)
  assert.equal(state.success, true)
  assert.ok(state.data?.cache)
  assert.equal(state.data?.cache?.entries[0].translatedMarkdown, '译文：Paragraph A.')
  assert.equal(state.data?.cache?.sourceHash, computePaperTranslationSourceHash(markdown))
  assert.equal(state.data?.cache?.sourceHashVersion, 2)
  assert.equal(savedCaches.length, 1)
  assert.equal(savedCaches[0].sourceHashVersion, 2)
  assert.equal(savedCaches[0].sourceHash, computePaperTranslationSourceHash(markdown))
})

test('旧哈希缓存在描述符变化时仍会失效并清理', () => {
  const markdown = ['Paragraph A.', '', 'Paragraph B.'].join('\n')
  const changedMarkdown = ['Paragraph A.', '', 'Paragraph C.'].join('\n')
  const cacheStore = new Map<string, PaperTranslationCache>()
  let clearCount = 0

  cacheStore.set('paper-legacy-invalid', {
    paperId: 'paper-legacy-invalid',
    sourceHash: 'legacy-hash',
    totalSegments: 2,
    completedSegments: 2,
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
        status: 'completed',
        translatedMarkdown: '译文：Paragraph B.',
        translatedText: '译文：Paragraph B.'
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
      clearCount += 1
      cacheStore.delete(paperId)
      return { success: true }
    },
    translateSegment: async (_config, _prompt, segment) => `译文：${segment.originalMarkdown}`
  })

  const state = core.getTranslationState('paper-legacy-invalid', changedMarkdown)
  assert.equal(state.success, true)
  assert.equal(state.data?.cache, null)
  assert.equal(clearCount, 1)
  assert.equal(cacheStore.has('paper-legacy-invalid'), false)
})

test('图片 caption 变化时会使旧缓存失效', () => {
  const markdown = 'The qualitative comparison is shown below.'
  const figures = [createFigure({ id: 'fig-1', caption: 'Figure 1. Overall framework.' })]
  const sourceHash = computePaperTranslationSourceHash(markdown, figures)
  const cacheStore = new Map<string, PaperTranslationCache>()

  cacheStore.set('paper-caption-cache', {
    paperId: 'paper-caption-cache',
    sourceHash,
    totalSegments: 2,
    completedSegments: 2,
    updatedAt: new Date().toISOString(),
    entries: [
      {
        ...parsePaperTranslationSegments(markdown)[0],
        status: 'completed',
        translatedMarkdown: '译文：The qualitative comparison is shown below.',
        translatedText: '译文：The qualitative comparison is shown below.'
      },
      {
        id: 'fig-caption-fig-1',
        index: 1,
        kind: 'paragraph',
        originalMarkdown: 'Figure 1. Overall framework.',
        originalText: 'Figure 1. Overall framework.',
        status: 'completed',
        translatedMarkdown: '译文：Figure 1. Overall framework.',
        translatedText: '译文：Figure 1. Overall framework.'
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
    translateSegment: async (_config, _prompt, segment) => `译文：${segment.originalMarkdown}`
  })

  const changedFigures = [createFigure({ id: 'fig-1', caption: 'Figure 1. Updated framework.' })]
  const changedState = core.getTranslationState('paper-caption-cache', markdown, changedFigures)
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

test('全文翻译运行中失败的段落可以手动重新排队翻译', async () => {
  const markdown = ['Paragraph A.', '', 'Paragraph B.', '', 'Paragraph C.'].join('\n')
  const cacheStore = new Map<string, PaperTranslationCache>()
  const releaseSecondSegment = createDeferred()
  let secondSegmentStarted: (() => void) | undefined
  const secondSegmentStartedPromise = new Promise<void>((resolve) => {
    secondSegmentStarted = resolve
  })
  const translatedSegments: string[] = []
  let firstSegmentAttempts = 0

  const core = new PaperTranslationCore({
    concurrency: 1,
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
      translatedSegments.push(segment.id)

      if (segment.id === 'seg-0') {
        firstSegmentAttempts += 1
        if (firstSegmentAttempts === 1) {
          throw new Error('首次翻译失败')
        }
      }

      if (segment.id === 'seg-1') {
        secondSegmentStarted?.()
        await releaseSecondSegment.promise
      }

      return `译文：${segment.originalMarkdown}`
    }
  })

  const startResult = await core.startTranslation('paper-live-retry', markdown)
  assert.equal(startResult.success, true)

  await secondSegmentStartedPromise
  await waitFor(() => {
    const cache = cacheStore.get('paper-live-retry')
    return cache?.entries[0].status === 'failed' && core.isRunning('paper-live-retry')
  })

  const retryResult = await core.retranslateSegment(
    'paper-live-retry',
    markdown,
    undefined,
    'seg-0'
  )
  assert.equal(retryResult.success, true)
  assert.equal(cacheStore.get('paper-live-retry')?.entries[0].status, 'queued')

  releaseSecondSegment.resolve()
  await waitFor(() => !core.isRunning('paper-live-retry'))

  const cache = cacheStore.get('paper-live-retry')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'completed')
  assert.equal(cache.entries[0].translatedMarkdown, '译文：Paragraph A.')
  assert.deepEqual(translatedSegments, ['seg-0', 'seg-1', 'seg-2', 'seg-0'])
})

test('旧缓存中被误标记为 skipped 的参考文献会重新进入翻译队列', async () => {
  const markdown =
    'Carion, N.; Massa, F.; Synnaeve, G.; Usunier, N.; Kirillov, A.; and Zagoruyko, S. 2020. End-to-End Object Detection with Transformers. arXiv:2005.12872.'
  const sourceHash = computePaperTranslationSourceHash(markdown)
  const cacheStore = new Map<string, PaperTranslationCache>()
  let translateCallCount = 0

  cacheStore.set('paper-ref-retry', {
    paperId: 'paper-ref-retry',
    sourceHash,
    totalSegments: 1,
    completedSegments: 1,
    updatedAt: new Date().toISOString(),
    entries: [
      {
        ...parsePaperTranslationSegments(markdown)[0],
        status: 'skipped',
        translatedMarkdown: markdown,
        translatedText: markdown
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
    translateSegment: async () => {
      translateCallCount += 1
      return 'Carion, N.; Massa, F.; Synnaeve, G.; Usunier, N.; Kirillov, A.; and Zagoruyko, S. 2020. 使用 Transformers 的端到端目标检测。arXiv:2005.12872.'
    }
  })

  const result = await core.startTranslation('paper-ref-retry', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-ref-retry'))

  const cache = cacheStore.get('paper-ref-retry')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'completed')
  assert.match(cache.entries[0].translatedMarkdown || '', /端到端目标检测/)
  assert.equal(translateCallCount, 1)
})

test('旧缓存中原文未翻译的参考文献会重新进入翻译队列', async () => {
  const markdown =
    'Carion, N.; Massa, F.; Synnaeve, G.; Usunier, N.; Kirillov, A.; and Zagoruyko, S. 2020. End-to-End Object Detection with Transformers. arXiv:2005.12872.'
  const sourceHash = computePaperTranslationSourceHash(markdown)
  const cacheStore = new Map<string, PaperTranslationCache>()
  let translateCallCount = 0

  cacheStore.set('paper-ref-refresh', {
    paperId: 'paper-ref-refresh',
    sourceHash,
    totalSegments: 1,
    completedSegments: 1,
    updatedAt: new Date().toISOString(),
    entries: [
      {
        ...parsePaperTranslationSegments(markdown)[0],
        status: 'completed',
        translatedMarkdown: markdown,
        translatedText: markdown
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
    translateSegment: async () => {
      translateCallCount += 1
      return 'Carion, N.; Massa, F.; Synnaeve, G.; Usunier, N.; Kirillov, A.; and Zagoruyko, S. 2020. 使用 Transformers 的端到端目标检测。arXiv:2005.12872.'
    }
  })

  const result = await core.startTranslation('paper-ref-refresh', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-ref-refresh'))

  const cache = cacheStore.get('paper-ref-refresh')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'completed')
  assert.match(cache.entries[0].translatedMarkdown || '', /端到端目标检测/)
  assert.equal(translateCallCount, 1)
})

test('参考文献段会参与翻译并保留原始编号', async () => {
  const markdown = [
    '31. Xu, H., Ma, J., Jiang, J., Guo, X., Ling, H.: U2fusion: A unified unsupervised image fusion network. IEEE Transactions on Pattern Analysis and Machine Intelligence 44(1), 502-518 (2020)',
    '',
    'Carion, N.; Massa, F.; Synnaeve, G.; Usunier, N.; Kirillov, A.; and Zagoruyko, S. 2020. End-to-End Object Detection with Transformers. arXiv:2005.12872.'
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
      if (segment.originalMarkdown.startsWith('31.')) {
        return '徐, H., 马, J., 江, J., 郭, X., 凌, H.: U2fusion：一种统一的无监督图像融合网络。IEEE Transactions on Pattern Analysis and Machine Intelligence 44(1), 502-518 (2020)'
      }

      return 'Carion, N.; Massa, F.; Synnaeve, G.; Usunier, N.; Kirillov, A.; and Zagoruyko, S. 2020. 使用 Transformers 的端到端目标检测。arXiv:2005.12872.'
    }
  })

  const result = await core.startTranslation('paper-ref', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-ref'))

  const cache = cacheStore.get('paper-ref')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'completed')
  assert.equal(cache.entries[1].status, 'completed')
  assert.match(cache.entries[0].translatedMarkdown || '', /^31\.\s/)
  assert.match(cache.entries[0].translatedMarkdown || '', /统一的无监督图像融合网络/)
  assert.match(cache.entries[1].translatedMarkdown || '', /端到端目标检测/)
  assert.equal(translateCallCount, 2)
})

test('标题前的作者段会跳过，但机构与摘要会参与翻译', async () => {
  const markdown = [
    'Yishuo Chen ¹, Boran Wang ¹,¹, Xinyu Guo ¹',
    '',
    '¹ College of Artificial Intelligence, Nankai University',
    '',
    'Abstract. Object detection in poor-illumination environments is a challenging task...',
    '',
    '# Introduction',
    '',
    'The rest of the paper...'
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

  const result = await core.startTranslation('paper-preheading', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-preheading'))

  const cache = cacheStore.get('paper-preheading')
  assert.ok(cache)
  assert.equal(cache.entries[0].status, 'skipped')
  assert.equal(cache.entries[1].status, 'completed')
  assert.equal(cache.entries[2].status, 'completed')
  assert.equal(cache.entries[3].status, 'completed')
  assert.equal(cache.entries[4].status, 'completed')
  assert.equal(translateCallCount, 4)
})

test('各种格式的表格段会被跳过且不会触发翻译调用', async () => {
  const markdown = [
    '# Results',
    '',
    '| Method | AP |',
    '|---|---|',
    '| Ours | 52.3 |',
    '',
    '| Ours | 52.3 |',
    '| Baseline | 45.6 |',
    '',
    '<table><tr><td>A</td></tr></table>',
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

  const result = await core.startTranslation('paper-table', markdown)
  assert.equal(result.success, true)
  await waitFor(() => !core.isRunning('paper-table'))

  const cache = cacheStore.get('paper-table')
  assert.ok(cache)
  // seg-0: heading (translated)
  // seg-1: standard pipe table (skipped)
  // seg-2: pipe rows without separator (skipped)
  // seg-3: HTML table (skipped)
  // seg-4: normal paragraph (translated)
  assert.equal(cache.entries[0].status, 'completed')
  assert.equal(cache.entries[1].status, 'skipped')
  assert.equal(cache.entries[2].status, 'skipped')
  assert.equal(cache.entries[3].status, 'skipped')
  assert.equal(cache.entries[4].status, 'completed')
  assert.equal(translateCallCount, 2)
})
