import test from 'node:test'
import assert from 'node:assert/strict'
import { PaperContextSearchToolService } from './PaperContextSearchToolService'
import type {
  PaperDocument,
  PaperReaderDocument,
  PaperReaderSegment,
  PaperTranslationCache,
  PaperTranslationEntry
} from '@shared/types/paper'

const paperId = 'paper-context-test'

function createSegment(index: number, originalText: string): PaperReaderSegment {
  return {
    id: `segment-${index}`,
    index,
    kind: 'paragraph',
    originalMarkdown: originalText,
    originalText,
    renderId: `render-${index}`,
    stableId: `stable-${index}`,
    textHash: `hash-${index}`,
    duplicateOrdinal: 1,
    sourceRevisionId: 'reader-revision',
    sourceRefs: {
      pageIndexes: [index],
      blockIndexes: [index]
    }
  }
}

function createReaderDocument(segments: PaperReaderSegment[]): PaperReaderDocument {
  return {
    paperId,
    markdown: segments.map((segment) => segment.originalMarkdown).join('\n\n'),
    sourceRevisionId: 'reader-revision',
    updatedAt: '2026-01-01T00:00:00.000Z',
    segments
  }
}

function createTranslationEntry(
  segment: PaperReaderSegment,
  translatedText: string
): PaperTranslationEntry {
  return {
    id: segment.id,
    index: segment.index,
    kind: segment.kind,
    originalMarkdown: segment.originalMarkdown,
    originalText: segment.originalText,
    status: 'completed',
    translatedMarkdown: translatedText,
    translatedText,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function createTranslationCache(entries: PaperTranslationEntry[]): PaperTranslationCache {
  return {
    paperId,
    sourceHash: 'source-hash',
    translationRevisionId: 'translation-revision',
    modelName: 'test-model',
    sourceHashVersion: 2,
    totalSegments: entries.length,
    completedSegments: entries.length,
    entries,
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
}

function createPaperMeta(scrollPercentOriginal = 50, scrollPercentTranslated = 50): PaperDocument {
  return {
    id: paperId,
    fileName: 'test.pdf',
    filePath: '/tmp/test.pdf',
    fileHash: 'hash',
    fileSize: 100,
    pageCount: 1,
    status: 'completed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastOpenedAt: '2026-01-01T00:00:00.000Z',
    ocrProvider: 'glm-ocr',
    ocrModel: 'glm',
    completedPageCount: 1,
    readingProgress: {
      scrollPercentOriginal,
      scrollPercentTranslated,
      zoomLevel: 1.0,
      readAt: '2026-01-01T00:00:00.000Z',
      translationVisible: false
    }
  }
}

function createService(options: {
  readerDocument: PaperReaderDocument
  translationCache?: PaperTranslationCache
  meta?: PaperDocument
}): PaperContextSearchToolService {
  return new PaperContextSearchToolService({
    getReaderDocument: async () => ({ success: true, data: options.readerDocument }),
    readTranslationCache: () =>
      options.translationCache
        ? { success: true, data: options.translationCache }
        : { success: false, error: '翻译缓存不存在' },
    readMeta: () => ({ success: true, data: options.meta ?? createPaperMeta() })
  })
}

function getContent(result: Awaited<ReturnType<PaperContextSearchToolService['search']>>): {
  iterations: number
  keywords: string[]
  usedReadingProgressFallback: boolean
  matches: Array<{ source: string; sentence: string; segmentIndex: number }>
  warnings: string[]
} {
  assert.equal(result.success, true)
  assert.ok(result.content && typeof result.content === 'object')
  return result.content as {
    iterations: number
    keywords: string[]
    usedReadingProgressFallback: boolean
    matches: Array<{ source: string; sentence: string; segmentIndex: number }>
    warnings: string[]
  }
}

test('基于原文选区做句子级检索', async () => {
  const readerDocument = createReaderDocument([
    createSegment(0, 'Contrastive learning improves visual representations. It aligns views.'),
    createSegment(1, 'Unrelated background sentence.')
  ])
  const service = createService({ readerDocument })

  const output = getContent(
    await service.search(paperId, {
      selectedText: 'Contrastive learning',
      source: 'original'
    })
  )

  assert.equal(output.matches[0].source, 'original')
  assert.equal(output.matches[0].sentence, 'Contrastive learning improves visual representations.')
  assert.doesNotMatch(output.matches[0].sentence, /It aligns views/)
})

test('基于译文选区检索译文句子', async () => {
  const segments = [
    createSegment(0, 'The model uses attention. The baseline is weaker.'),
    createSegment(1, 'Other content.')
  ]
  const readerDocument = createReaderDocument(segments)
  const translationCache = createTranslationCache([
    createTranslationEntry(segments[0], '该模型使用注意力机制。基线方法更弱。')
  ])
  const service = createService({ readerDocument, translationCache })

  const output = getContent(
    await service.search(paperId, {
      selectedText: '注意力机制',
      source: 'translation'
    })
  )

  assert.equal(output.matches[0].source, 'translation')
  assert.equal(output.matches[0].sentence, '该模型使用注意力机制。')
})

test('未选择文本时从明确关键词检索原文和译文', async () => {
  const segments = [
    createSegment(0, 'The ablation study removes the decoder. Accuracy drops.'),
    createSegment(1, 'The introduction motivates the task.')
  ]
  const readerDocument = createReaderDocument(segments)
  const translationCache = createTranslationCache([
    createTranslationEntry(segments[0], '消融实验移除了 decoder。准确率下降。')
  ])
  const service = createService({ readerDocument, translationCache })

  const output = getContent(
    await service.search(paperId, {
      query: 'ablation decoder 消融实验',
      source: 'both'
    })
  )

  assert.ok(output.matches.some((match) => match.sentence.includes('ablation study')))
  assert.ok(output.matches.some((match) => match.sentence.includes('消融实验')))
})

test('无明确关键词时使用阅读进度到后 5 段的候选上下文', async () => {
  const segments = Array.from({ length: 8 }, (_, index) =>
    createSegment(
      index,
      index <= 6
        ? `Candidate segment ${index} discusses gated fusion module.`
        : 'Distant appendix sentence about calibration.'
    )
  )
  const readerDocument = createReaderDocument(segments)
  const service = createService({
    readerDocument,
    meta: createPaperMeta(50)
  })

  const output = getContent(
    await service.search(paperId, {
      query: '这段是什么意思',
      source: 'original',
      limit: 20
    })
  )

  assert.equal(output.usedReadingProgressFallback, true)
  assert.ok(output.matches.length > 0)
  assert.ok(output.matches.every((match) => match.segmentIndex <= 6))
  assert.ok(output.matches.every((match) => !match.sentence.includes('Distant appendix')))
})

test('递归轮数遵守 maxIterations', async () => {
  const readerDocument = createReaderDocument([
    createSegment(0, 'Alpha connects to beta.'),
    createSegment(1, 'Beta connects to gamma.'),
    createSegment(2, 'Gamma connects to delta.')
  ])
  const service = createService({ readerDocument })

  const output = getContent(
    await service.search(paperId, {
      query: 'alpha',
      source: 'original',
      maxIterations: 2,
      limit: 10
    })
  )

  assert.equal(output.iterations, 2)
  assert.ok(output.matches.some((match) => match.sentence.includes('Alpha connects')))
  assert.ok(output.matches.some((match) => match.sentence.includes('Beta connects')))
  assert.ok(!output.matches.some((match) => match.sentence.includes('Gamma connects')))
})

test('命中足够上下文时提前停止递归', async () => {
  const readerDocument = createReaderDocument(
    Array.from({ length: 20 }, (_, index) =>
      createSegment(index, `Shared signal sentence ${index}. Extra unrelated sentence ${index}.`)
    )
  )
  const service = createService({ readerDocument })

  const output = getContent(
    await service.search(paperId, {
      query: 'signal',
      source: 'original',
      maxIterations: 10
    })
  )

  assert.equal(output.iterations, 1)
  assert.equal(output.matches.length, 12)
})
