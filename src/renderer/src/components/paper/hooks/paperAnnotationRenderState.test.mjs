import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSegmentAnnotationRenderKey,
  mergeSegmentAnnotationsForRender
} from './paperAnnotationRenderState.ts'

function createAnnotation(overrides = {}) {
  return {
    id: overrides.id ?? 'annotation-1',
    paperId: 'paper-1',
    kind: overrides.kind ?? 'highlight',
    noteType: overrides.noteType ?? 'original_span',
    createdInView: overrides.createdInView ?? 'original',
    semanticAnchor: {
      segmentStableId: overrides.segmentStableId ?? 'stable-1',
      renderSegmentIdAtCreation: 'seg-1',
      sourceRevisionId: 'rev-1',
      segmentTextHash: 'hash-1',
      sourceRefs: { pageIndexes: [0], blockIndexes: [0] }
    },
    originalAnchor: {
      selectedText: 'selected',
      prefixText: '',
      suffixText: '',
      startOffset: overrides.startOffset ?? 0,
      endOffset: overrides.endOffset ?? 8,
      normalizedText: 'selected'
    },
    selectedTextSnapshot: 'selected',
    contextBefore: '',
    contextAfter: '',
    comment: overrides.comment ?? '',
    colorKey: overrides.colorKey ?? 'yellow',
    status: 'active',
    recoveryMeta: { recoveryFailureCount: 0 },
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z'
  }
}

function createSegment(overrides = {}) {
  return {
    stableId: 'stable-1',
    annotations: overrides.annotations ?? [],
    originalHtml: overrides.originalHtml ?? '<p>旧原文</p>',
    translationHtml: overrides.translationHtml ?? '<p>旧译文</p>',
    htmlStatus: overrides.htmlStatus ?? 'ready'
  }
}

test('新增视觉批注时保留旧 HTML 并进入 pending', () => {
  const segment = createSegment()
  const annotation = createAnnotation()

  const result = mergeSegmentAnnotationsForRender(segment, [annotation])

  assert.equal(result.visualChanged, true)
  assert.equal(result.segment.htmlStatus, 'pending')
  assert.equal(result.segment.originalHtml, '<p>旧原文</p>')
  assert.equal(result.segment.translationHtml, '<p>旧译文</p>')
  assert.equal(result.segment.annotations[0], annotation)
})

test('删除视觉批注时保留旧 HTML 并进入 pending', () => {
  const annotation = createAnnotation()
  const segment = createSegment({ annotations: [annotation] })

  const result = mergeSegmentAnnotationsForRender(segment, [])

  assert.equal(result.visualChanged, true)
  assert.equal(result.segment.htmlStatus, 'pending')
  assert.equal(result.segment.originalHtml, '<p>旧原文</p>')
  assert.equal(result.segment.translationHtml, '<p>旧译文</p>')
  assert.equal(result.segment.annotations.length, 0)
})

test('仅修改笔记 comment 不触发视觉失效', () => {
  const oldAnnotation = createAnnotation({
    kind: 'note',
    colorKey: 'green',
    comment: '旧笔记'
  })
  const nextAnnotation = {
    ...oldAnnotation,
    comment: '新笔记',
    updatedAt: '2026-01-02T00:00:00.000Z'
  }
  const segment = createSegment({ annotations: [oldAnnotation] })

  const result = mergeSegmentAnnotationsForRender(segment, [nextAnnotation])

  assert.equal(result.visualChanged, false)
  assert.equal(result.segment.htmlStatus, 'ready')
  assert.equal(result.segment.originalHtml, '<p>旧原文</p>')
  assert.equal(result.segment.translationHtml, '<p>旧译文</p>')
  assert.equal(result.segment.annotations[0], nextAnnotation)
})

test('批注引用完全一致时保持原段落对象', () => {
  const annotation = createAnnotation()
  const segment = createSegment({ annotations: [annotation] })

  const result = mergeSegmentAnnotationsForRender(segment, [annotation])

  assert.equal(result.visualChanged, false)
  assert.equal(result.segment, segment)
})

test('视觉渲染 key 忽略 comment 与 updatedAt', () => {
  const oldAnnotation = createAnnotation({ comment: '旧笔记' })
  const nextAnnotation = {
    ...oldAnnotation,
    comment: '新笔记',
    updatedAt: '2026-01-02T00:00:00.000Z'
  }

  assert.equal(
    getSegmentAnnotationRenderKey([oldAnnotation]),
    getSegmentAnnotationRenderKey([nextAnnotation])
  )
})
