import test from 'node:test'
import assert from 'node:assert/strict'
import { recoverPaperAnnotation } from './paperAnnotationRecovery.ts'
import type {
  PaperAnnotation,
  PaperReaderDocument,
  PaperReaderSegment
} from '../../../shared/types/paper.ts'
import { PAPER_ANNOTATION_NOTE_COLOR_KEY } from '../../../shared/types/paper.ts'
import { buildPaperTextAnchor as buildAnchor } from '../../../shared/utils/paperAnnotationAnchors.ts'

function createSegment(overrides: Partial<PaperReaderSegment> = {}): PaperReaderSegment {
  return {
    id: overrides.id ?? 'segment-1',
    renderId: overrides.renderId ?? 'render-1',
    stableId: overrides.stableId ?? 'stable-1',
    index: overrides.index ?? 0,
    kind: overrides.kind ?? 'paragraph',
    originalMarkdown: overrides.originalMarkdown ?? 'Important finding appears in this sentence.',
    originalText: overrides.originalText ?? 'Important finding appears in this sentence.',
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

function createReaderDocument(segments: PaperReaderSegment[]): PaperReaderDocument {
  return {
    paperId: 'paper-1',
    markdown: segments.map((segment) => segment.originalMarkdown).join('\n\n'),
    sourceRevisionId: 'source-rev-doc',
    updatedAt: '2025-01-01T00:00:00.000Z',
    segments
  }
}

function createAnnotation(
  segment: PaperReaderSegment,
  overrides: Partial<PaperAnnotation> = {}
): PaperAnnotation {
  const originalAnchor = buildAnchor(segment.originalText, 0, 17)

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
    comment: overrides.comment ?? '记录一下',
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

test('recoverPaperAnnotation 会在段落漂移后保留笔记类型与绿色高亮', () => {
  const oldSegment = createSegment({
    stableId: 'stable-old',
    renderId: 'render-old',
    textHash: 'hash-old',
    sourceRevisionId: 'source-old',
    originalText: 'Important finding appears in this sentence.'
  })
  const nextSegment = createSegment({
    stableId: 'stable-new',
    renderId: 'render-new',
    textHash: 'hash-new',
    sourceRevisionId: 'source-new',
    originalText: 'Opening context. Important finding appears in this sentence.'
  })
  const annotation = createAnnotation(oldSegment, {
    kind: 'note',
    colorKey: PAPER_ANNOTATION_NOTE_COLOR_KEY,
    semanticAnchor: {
      segmentStableId: 'missing-segment',
      renderSegmentIdAtCreation: 'render-missing',
      sourceRevisionId: 'source-missing',
      segmentTextHash: 'hash-missing',
      sourceRefs: oldSegment.sourceRefs
    }
  })

  const result = recoverPaperAnnotation(
    annotation,
    createReaderDocument([nextSegment]),
    true,
    '2025-02-02T00:00:00.000Z'
  )

  assert.equal(result.annotation.kind, 'note')
  assert.equal(result.annotation.colorKey, PAPER_ANNOTATION_NOTE_COLOR_KEY)
  assert.equal(result.annotation.status, 'active')
  assert.equal(result.annotation.semanticAnchor.segmentStableId, 'stable-new')
})

test('recoverPaperAnnotation 会在译文缺失时保留普通标记类型并降级状态', () => {
  const segment = createSegment()
  const originalAnchor = buildAnchor(segment.originalText, 0, 17)
  const translationAnchor = {
    ...buildAnchor('这是一个重要发现。', 0, 6),
    translationRevisionId: 'translation-rev-1'
  }
  const annotation = createAnnotation(segment, {
    kind: 'highlight',
    noteType: 'translation_view',
    createdInView: 'translation',
    comment: '',
    colorKey: 'blue',
    translationAnchor
  })

  const result = recoverPaperAnnotation(
    {
      ...annotation,
      originalAnchor
    },
    createReaderDocument([segment]),
    false,
    '2025-02-02T00:00:00.000Z'
  )

  assert.equal(result.annotation.kind, 'highlight')
  assert.equal(result.annotation.colorKey, 'blue')
  assert.equal(result.annotation.comment, '')
  assert.equal(result.annotation.status, 'translation_missing')
})
