import test from 'node:test'
import assert from 'node:assert/strict'
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { findPaperAnnotationNoteConflict } from './paperAnnotationConflicts.ts'

function createAnchor(startOffset, endOffset, selectedText = 'selected') {
  return {
    selectedText,
    prefixText: '',
    suffixText: '',
    startOffset,
    endOffset,
    normalizedText: selectedText
  }
}

function createAnnotation(overrides = {}) {
  const originalAnchor = overrides.originalAnchor ?? createAnchor(10, 20)

  return {
    id: overrides.id ?? 'annotation-1',
    paperId: 'paper-1',
    kind: overrides.kind ?? 'note',
    noteType: overrides.noteType ?? 'original_span',
    createdInView: overrides.createdInView ?? 'original',
    semanticAnchor: {
      segmentStableId: overrides.segmentStableId ?? 'segment-1',
      renderSegmentIdAtCreation: 'render-1',
      sourceRevisionId: 'source-rev-1',
      segmentTextHash: 'hash-1',
      sourceRefs: {
        pageIndexes: [0],
        blockIndexes: [0]
      }
    },
    originalAnchor,
    translationAnchor: overrides.translationAnchor,
    selectedTextSnapshot: originalAnchor.selectedText,
    contextBefore: '',
    contextAfter: '',
    comment: overrides.comment ?? '已有笔记',
    colorKey: overrides.colorKey ?? 'green',
    status: overrides.status ?? 'active',
    recoveryMeta: {
      recoveryFailureCount: 0
    },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  }
}

test('findPaperAnnotationNoteConflict 会识别完全位于已有笔记内的选区', () => {
  const conflict = findPaperAnnotationNoteConflict([createAnnotation()], {
    kind: 'note',
    segmentStableId: 'segment-1',
    originalAnchor: createAnchor(12, 16)
  })

  assert.equal(conflict?.annotation.id, 'annotation-1')
  assert.equal(conflict?.reason, 'range_overlap')
})

test('findPaperAnnotationNoteConflict 会识别与已有笔记部分重叠的选区', () => {
  const conflict = findPaperAnnotationNoteConflict([createAnnotation()], {
    kind: 'note',
    segmentStableId: 'segment-1',
    originalAnchor: createAnchor(18, 28)
  })

  assert.equal(conflict?.annotation.id, 'annotation-1')
  assert.equal(conflict?.reason, 'range_overlap')
})

test('findPaperAnnotationNoteConflict 会识别包含已有笔记范围的选区', () => {
  const conflict = findPaperAnnotationNoteConflict([createAnnotation()], {
    kind: 'note',
    segmentStableId: 'segment-1',
    originalAnchor: createAnchor(0, 30)
  })

  assert.equal(conflict?.annotation.id, 'annotation-1')
  assert.equal(conflict?.reason, 'range_overlap')
})

test('findPaperAnnotationNoteConflict 允许同一段落不重叠的第二个笔记', () => {
  const conflict = findPaperAnnotationNoteConflict([createAnnotation()], {
    kind: 'note',
    segmentStableId: 'segment-1',
    originalAnchor: createAnchor(24, 30)
  })

  assert.equal(conflict, null)
})

test('findPaperAnnotationNoteConflict 允许不同段落创建笔记', () => {
  const conflict = findPaperAnnotationNoteConflict([createAnnotation()], {
    kind: 'note',
    segmentStableId: 'segment-2',
    originalAnchor: createAnchor(12, 16)
  })

  assert.equal(conflict, null)
})

test('findPaperAnnotationNoteConflict 允许原文与译文笔记在同段不重叠时共存', () => {
  const existingTranslationNote = createAnnotation({
    noteType: 'translation_view',
    createdInView: 'translation',
    originalAnchor: createAnchor(10, 20),
    translationAnchor: {
      ...createAnchor(0, 6, '译文片段'),
      translationRevisionId: 'translation-rev-1'
    }
  })

  const conflict = findPaperAnnotationNoteConflict([existingTranslationNote], {
    kind: 'note',
    segmentStableId: 'segment-1',
    originalAnchor: createAnchor(24, 30)
  })

  assert.equal(conflict, null)
})

test('findPaperAnnotationNoteConflict 不限制普通标记重叠', () => {
  const conflict = findPaperAnnotationNoteConflict(
    [
      createAnnotation(),
      createAnnotation({
        id: 'annotation-highlight',
        kind: 'highlight',
        colorKey: 'blue',
        comment: '',
        originalAnchor: createAnchor(12, 18)
      })
    ],
    {
      kind: 'highlight',
      segmentStableId: 'segment-1',
      originalAnchor: createAnchor(12, 16)
    }
  )

  assert.equal(conflict, null)
})

test('findPaperAnnotationNoteConflict 支持忽略当前笔记且不再按异常状态跳过笔记', () => {
  const conflict = findPaperAnnotationNoteConflict(
    [
      createAnnotation({ id: 'annotation-current' }),
      createAnnotation({
        id: 'annotation-invalid',
        status: 'invalid',
        originalAnchor: createAnchor(24, 30)
      })
    ],
    {
      kind: 'note',
      segmentStableId: 'segment-1',
      originalAnchor: createAnchor(24, 28),
      ignoreAnnotationId: 'annotation-current'
    }
  )

  assert.equal(conflict?.annotation.id, 'annotation-invalid')
  assert.equal(conflict?.reason, 'range_overlap')
})
