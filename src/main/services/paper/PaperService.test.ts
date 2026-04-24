import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { PaperService } from './PaperService.ts'
import { paperStorageService } from './index.ts'
import { getPaperDirPath, getPaperFigureAssetPath } from './paperPaths.ts'
import {
  PAPER_ANNOTATION_NOTE_COLOR_KEY,
  type CreatePaperAnnotationPayload,
  type PaperAnnotation,
  type PaperAnnotationStore,
  type PaperPageOcrResult,
  type PaperReaderDocument,
  type PaperReaderSegment,
  type UpdatePaperAnnotationPayload
} from '../../../shared/types/paper.ts'
import { buildPaperTextAnchor } from '../../../shared/utils/paperAnnotationAnchors.ts'

type MutablePaperService = {
  getReaderDocument: (paperId: string) =>
    | {
        success: boolean
        data?: PaperReaderDocument
        error?: string
      }
    | Promise<{
        success: boolean
        data?: PaperReaderDocument
        error?: string
      }>
  resolveAnnotationStore: (
    paperId: string,
    readerDocument?: PaperReaderDocument
  ) =>
    | { success: boolean; data?: PaperAnnotationStore; error?: string }
    | Promise<{ success: boolean; data?: PaperAnnotationStore; error?: string }>
}

function asMutableService(service: PaperService): MutablePaperService {
  return service as unknown as MutablePaperService
}

function createSegment(overrides: Partial<PaperReaderSegment> = {}): PaperReaderSegment {
  return {
    id: overrides.id ?? 'segment-1',
    renderId: overrides.renderId ?? 'render-1',
    stableId: overrides.stableId ?? 'stable-1',
    index: overrides.index ?? 0,
    kind: overrides.kind ?? 'paragraph',
    originalMarkdown: overrides.originalMarkdown ?? 'A sample segment for annotations.',
    originalText: overrides.originalText ?? 'A sample segment for annotations.',
    textHash: overrides.textHash ?? 'hash-1',
    duplicateOrdinal: overrides.duplicateOrdinal ?? 1,
    sourceRevisionId: overrides.sourceRevisionId ?? 'source-rev-1',
    sourceRefs: overrides.sourceRefs ?? {
      pageIndexes: [0],
      blockIndexes: [0],
      start: { pageIndex: 0, blockIndex: 0 },
      end: { pageIndex: 0, blockIndex: 0 }
    }
  }
}

function createReaderDocument(segment: PaperReaderSegment): PaperReaderDocument {
  return {
    paperId: 'paper-1',
    markdown: segment.originalMarkdown,
    sourceRevisionId: segment.sourceRevisionId,
    updatedAt: '2025-01-01T00:00:00.000Z',
    segments: [segment]
  }
}

function createStore(annotation?: PaperAnnotation): PaperAnnotationStore {
  return {
    version: 3,
    paperId: 'paper-1',
    annotations: annotation ? [annotation] : [],
    updatedAt: '2025-01-01T00:00:00.000Z'
  }
}

function createAnnotation(
  segment: PaperReaderSegment,
  overrides: Partial<PaperAnnotation> = {}
): PaperAnnotation {
  const originalAnchor = buildPaperTextAnchor(segment.originalText, 2, 8)

  return {
    id: overrides.id ?? 'annotation-1',
    paperId: overrides.paperId ?? 'paper-1',
    kind: overrides.kind ?? 'note',
    noteType: overrides.noteType ?? 'original_span',
    createdInView: overrides.createdInView ?? 'original',
    semanticAnchor: overrides.semanticAnchor ?? {
      segmentStableId: segment.stableId,
      renderSegmentIdAtCreation: segment.renderId,
      sourceRevisionId: segment.sourceRevisionId,
      segmentTextHash: segment.textHash,
      sourceRefs: segment.sourceRefs
    },
    originalAnchor: overrides.originalAnchor ?? originalAnchor,
    translationAnchor: overrides.translationAnchor,
    selectedTextSnapshot: overrides.selectedTextSnapshot ?? originalAnchor.selectedText,
    contextBefore: overrides.contextBefore ?? originalAnchor.prefixText,
    contextAfter: overrides.contextAfter ?? originalAnchor.suffixText,
    comment: overrides.comment ?? '已有笔记',
    colorKey: overrides.colorKey ?? PAPER_ANNOTATION_NOTE_COLOR_KEY,
    status: overrides.status ?? 'active',
    recoveryMeta: overrides.recoveryMeta ?? {
      recoveryFailureCount: 0,
      lastResolvedAt: '2025-01-01T00:00:00.000Z'
    },
    createdAt: overrides.createdAt ?? '2025-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2025-01-01T00:00:00.000Z'
  }
}

function createBasePayload(segment: PaperReaderSegment): CreatePaperAnnotationPayload {
  const originalAnchor = buildPaperTextAnchor(segment.originalText, 0, 6)

  return {
    paperId: 'paper-1',
    kind: 'highlight',
    noteType: 'original_span',
    createdInView: 'original',
    semanticAnchor: {
      segmentStableId: segment.stableId,
      renderSegmentIdAtCreation: segment.renderId,
      sourceRevisionId: segment.sourceRevisionId,
      segmentTextHash: segment.textHash,
      sourceRefs: segment.sourceRefs
    },
    originalAnchor,
    selectedTextSnapshot: originalAnchor.selectedText,
    contextBefore: originalAnchor.prefixText,
    contextAfter: originalAnchor.suffixText,
    comment: '',
    colorKey: 'blue'
  }
}

test('getReaderDocument 会写回历史 normalized 中残留的远端图片 URL', async () => {
  const service = new PaperService()
  const paperId = 'paper-history-localize'
  const remoteUrl = 'https://example.com/ocr/crop/history.png?token=1'
  const localAssetPath = 'assets/page-0001/crop-0000.png'
  const localAbsolutePath = getPaperFigureAssetPath(paperId, 0, 0)
  const pageResult: PaperPageOcrResult = {
    paperId,
    pageIndex: 0,
    status: 'completed',
    markdown: [
      `<div style='text-align: center;'><img src='${remoteUrl}' alt='OCR图片'/></div>`,
      'Readable paragraph after the figure.'
    ].join('\n\n'),
    blocks: [
      {
        index: 0,
        pageIndex: 0,
        label: 'image',
        content: remoteUrl,
        bbox: { x: 100, y: 100, width: 200, height: 120 },
        width: 1000,
        height: 1200,
        remoteAssetUrl: remoteUrl,
        localAssetPath
      },
      {
        index: 1,
        pageIndex: 0,
        label: 'text',
        content: 'Readable paragraph after the figure.',
        bbox: { x: 100, y: 260, width: 500, height: 40 },
        width: 1000,
        height: 1200
      }
    ]
  }
  let savedResult: PaperPageOcrResult | null = null

  const originalListNormalizedResults = paperStorageService.listNormalizedResults
  const originalSaveNormalizedResult = paperStorageService.saveNormalizedResult

  rmSync(getPaperDirPath(paperId), { recursive: true, force: true })
  mkdirSync(dirname(localAbsolutePath), { recursive: true })
  writeFileSync(localAbsolutePath, 'png')

  paperStorageService.listNormalizedResults = () => ({ success: true, data: [pageResult] })
  paperStorageService.saveNormalizedResult = (_paperId, _pageIndex, result) => {
    savedResult = structuredClone(result)
    return { success: true }
  }

  try {
    const result = await service.getReaderDocument(paperId)

    assert.equal(result.success, true)
    if (!savedResult) {
      throw new Error('saveNormalizedResult 未被调用')
    }

    const ensuredResult = savedResult as PaperPageOcrResult
    assert.match(ensuredResult.markdown, /assets\/page-0001\/crop-0000\.png/)
    assert.doesNotMatch(ensuredResult.markdown, /https:\/\/example\.com/)
    assert.equal(ensuredResult.blocks[0].content, localAssetPath)
  } finally {
    paperStorageService.listNormalizedResults = originalListNormalizedResults
    paperStorageService.saveNormalizedResult = originalSaveNormalizedResult
    rmSync(getPaperDirPath(paperId), { recursive: true, force: true })
  }
})

test('createAnnotation 可以创建普通标记并强制清空 comment', async () => {
  const service = new PaperService()
  const mutableService = asMutableService(service)
  const segment = createSegment()
  const readerDocument = createReaderDocument(segment)
  let savedStore: PaperAnnotationStore | null = null

  const originalReadTranslationCache = paperStorageService.readTranslationCache
  const originalSaveAnnotationStore = paperStorageService.saveAnnotationStore

  mutableService.getReaderDocument = () => ({ success: true, data: readerDocument })
  mutableService.resolveAnnotationStore = () => ({ success: true, data: createStore() })
  paperStorageService.readTranslationCache = () => ({ success: true, data: undefined })
  paperStorageService.saveAnnotationStore = (_paperId, store) => {
    savedStore = structuredClone(store)
    return { success: true }
  }

  try {
    const result = await service.createAnnotation({
      ...createBasePayload(segment),
      comment: '这段内容需要关注'
    })

    assert.equal(result.success, true)
    assert.equal(result.data?.kind, 'highlight')
    assert.equal(result.data?.colorKey, 'blue')
    assert.equal(result.data?.comment, '')
    if (!savedStore) {
      throw new Error('saveAnnotationStore 未被调用')
    }
    const ensuredStore = savedStore as PaperAnnotationStore
    assert.equal(ensuredStore.annotations[0].comment, '')
  } finally {
    paperStorageService.readTranslationCache = originalReadTranslationCache
    paperStorageService.saveAnnotationStore = originalSaveAnnotationStore
  }
})

test('createAnnotation 会拒绝普通标记使用绿色', async () => {
  const service = new PaperService()
  const mutableService = asMutableService(service)
  const segment = createSegment()

  mutableService.getReaderDocument = () => ({ success: true, data: createReaderDocument(segment) })
  mutableService.resolveAnnotationStore = () => ({ success: true, data: createStore() })

  const result = await service.createAnnotation({
    ...createBasePayload(segment),
    colorKey: 'green'
  })

  assert.equal(result.success, false)
  assert.equal(result.error, '普通标记只能使用蓝色、黄色或橙色')
})

test('createAnnotation 会拒绝空笔记内容', async () => {
  const service = new PaperService()
  const mutableService = asMutableService(service)
  const segment = createSegment()

  mutableService.getReaderDocument = () => ({ success: true, data: createReaderDocument(segment) })
  mutableService.resolveAnnotationStore = () => ({ success: true, data: createStore() })

  const result = await service.createAnnotation({
    ...createBasePayload(segment),
    kind: 'note',
    comment: '   ',
    colorKey: PAPER_ANNOTATION_NOTE_COLOR_KEY
  })

  assert.equal(result.success, false)
  assert.equal(result.error, '请先填写笔记内容')
})

test('updateAnnotation 只允许普通标记修改颜色', async () => {
  const service = new PaperService()
  const mutableService = asMutableService(service)
  const segment = createSegment()
  const annotation = createAnnotation(segment, {
    kind: 'highlight',
    comment: '',
    colorKey: 'yellow'
  })
  const store = createStore(annotation)
  let savedStore: PaperAnnotationStore | null = null

  const originalSaveAnnotationStore = paperStorageService.saveAnnotationStore
  paperStorageService.saveAnnotationStore = (_paperId, nextStore) => {
    savedStore = structuredClone(nextStore)
    return { success: true }
  }
  mutableService.resolveAnnotationStore = () => ({ success: true, data: store })

  try {
    const rejected = await service.updateAnnotation({
      paperId: 'paper-1',
      annotationId: annotation.id,
      comment: '不允许'
    } satisfies UpdatePaperAnnotationPayload)
    assert.equal(rejected.success, false)
    assert.equal(rejected.error, '普通标记不支持修改笔记内容')

    const updated = await service.updateAnnotation({
      paperId: 'paper-1',
      annotationId: annotation.id,
      colorKey: 'orange'
    } satisfies UpdatePaperAnnotationPayload)

    assert.equal(updated.success, true)
    assert.equal(updated.data?.colorKey, 'orange')
    assert.equal(updated.data?.comment, '')
    if (!savedStore) {
      throw new Error('saveAnnotationStore 未被调用')
    }
    const ensuredStore = savedStore as PaperAnnotationStore
    assert.equal(ensuredStore.annotations[0].colorKey, 'orange')
  } finally {
    paperStorageService.saveAnnotationStore = originalSaveAnnotationStore
  }
})

test('updateAnnotation 允许笔记修改内容但不允许改颜色', async () => {
  const service = new PaperService()
  const mutableService = asMutableService(service)
  const segment = createSegment()
  const annotation = createAnnotation(segment, {
    kind: 'note',
    comment: '旧内容',
    colorKey: PAPER_ANNOTATION_NOTE_COLOR_KEY
  })
  const store = createStore(annotation)
  let savedStore: PaperAnnotationStore | null = null

  const originalSaveAnnotationStore = paperStorageService.saveAnnotationStore
  paperStorageService.saveAnnotationStore = (_paperId, nextStore) => {
    savedStore = structuredClone(nextStore)
    return { success: true }
  }
  mutableService.resolveAnnotationStore = () => ({ success: true, data: store })

  try {
    const rejected = await service.updateAnnotation({
      paperId: 'paper-1',
      annotationId: annotation.id,
      colorKey: 'blue'
    } satisfies UpdatePaperAnnotationPayload)
    assert.equal(rejected.success, false)
    assert.equal(rejected.error, '笔记不支持修改高亮颜色')

    const updated = await service.updateAnnotation({
      paperId: 'paper-1',
      annotationId: annotation.id,
      comment: '  新内容  '
    } satisfies UpdatePaperAnnotationPayload)

    assert.equal(updated.success, true)
    assert.equal(updated.data?.comment, '新内容')
    assert.equal(updated.data?.colorKey, PAPER_ANNOTATION_NOTE_COLOR_KEY)
    if (!savedStore) {
      throw new Error('saveAnnotationStore 未被调用')
    }
    const ensuredStore = savedStore as PaperAnnotationStore
    assert.equal(ensuredStore.annotations[0].comment, '新内容')
  } finally {
    paperStorageService.saveAnnotationStore = originalSaveAnnotationStore
  }
})

test('reanchorAnnotation 会保留普通标记的类型与颜色', async () => {
  const service = new PaperService()
  const mutableService = asMutableService(service)
  const segment = createSegment()
  const readerDocument = createReaderDocument(segment)
  const annotation = createAnnotation(segment, {
    kind: 'highlight',
    comment: '',
    colorKey: 'blue'
  })
  const store = createStore(annotation)
  let savedStore: PaperAnnotationStore | null = null

  const originalReadTranslationCache = paperStorageService.readTranslationCache
  const originalSaveAnnotationStore = paperStorageService.saveAnnotationStore

  mutableService.getReaderDocument = () => ({ success: true, data: readerDocument })
  mutableService.resolveAnnotationStore = () => ({ success: true, data: store })
  paperStorageService.readTranslationCache = () => ({ success: true, data: undefined })
  paperStorageService.saveAnnotationStore = (_paperId, nextStore) => {
    savedStore = structuredClone(nextStore)
    return { success: true }
  }

  try {
    const nextAnchor = buildPaperTextAnchor(segment.originalText, 5, 12)
    const result = await service.reanchorAnnotation({
      paperId: 'paper-1',
      annotationId: annotation.id,
      kind: 'highlight',
      semanticAnchor: {
        segmentStableId: segment.stableId,
        renderSegmentIdAtCreation: segment.renderId,
        sourceRevisionId: segment.sourceRevisionId,
        segmentTextHash: segment.textHash,
        sourceRefs: segment.sourceRefs
      },
      originalAnchor: nextAnchor,
      selectedTextSnapshot: nextAnchor.selectedText,
      contextBefore: nextAnchor.prefixText,
      contextAfter: nextAnchor.suffixText,
      comment: '会被清空',
      colorKey: 'blue'
    })

    assert.equal(result.success, true)
    assert.equal(result.data?.kind, 'highlight')
    assert.equal(result.data?.colorKey, 'blue')
    assert.equal(result.data?.comment, '')
    if (!savedStore) {
      throw new Error('saveAnnotationStore 未被调用')
    }
    const ensuredStore = savedStore as PaperAnnotationStore
    assert.equal(ensuredStore.annotations[0].comment, '')
  } finally {
    paperStorageService.readTranslationCache = originalReadTranslationCache
    paperStorageService.saveAnnotationStore = originalSaveAnnotationStore
  }
})

test('deleteTranslation 会同步删除译文标注并保留原文标注', async () => {
  const service = new PaperService()
  const segment = createSegment()
  const originalAnnotation = createAnnotation(segment, {
    id: 'annotation-original',
    kind: 'highlight',
    noteType: 'original_span',
    createdInView: 'original',
    comment: '',
    colorKey: 'yellow'
  })
  const translationAnnotation = createAnnotation(segment, {
    id: 'annotation-translation',
    kind: 'note',
    noteType: 'translation_view',
    createdInView: 'translation',
    colorKey: PAPER_ANNOTATION_NOTE_COLOR_KEY,
    translationAnchor: {
      ...buildPaperTextAnchor('这是一个重要发现。', 0, 6),
      translationRevisionId: 'translation-rev-1'
    }
  })
  const store = createStore()
  store.annotations = [originalAnnotation, translationAnnotation]
  let savedStore: PaperAnnotationStore | null = null

  const originalClearTranslationCache = paperStorageService.clearTranslationCache
  const originalReadAnnotationStore = paperStorageService.readAnnotationStore
  const originalSaveAnnotationStore = paperStorageService.saveAnnotationStore

  paperStorageService.clearTranslationCache = () => ({ success: true })
  paperStorageService.readAnnotationStore = () => ({ success: true, data: store })
  paperStorageService.saveAnnotationStore = (_paperId, nextStore) => {
    savedStore = structuredClone(nextStore)
    return { success: true }
  }

  try {
    const result = await service.deleteTranslation('paper-1')

    assert.equal(result.success, true)
    if (!savedStore) {
      throw new Error('saveAnnotationStore 未被调用')
    }
    const ensuredStore = savedStore as PaperAnnotationStore
    assert.deepEqual(
      ensuredStore.annotations.map((annotation) => annotation.id),
      ['annotation-original']
    )
  } finally {
    paperStorageService.clearTranslationCache = originalClearTranslationCache
    paperStorageService.readAnnotationStore = originalReadAnnotationStore
    paperStorageService.saveAnnotationStore = originalSaveAnnotationStore
  }
})
