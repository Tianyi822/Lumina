import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isFallbackPaperSegmentStableId,
  isPaperAnnotationIndexReady
} from './paperAnnotationReadiness.ts'

test('reader document 与当前论文匹配且有段落时批注索引就绪', () => {
  assert.equal(
    isPaperAnnotationIndexReady('paper-1', {
      paperId: 'paper-1',
      segments: [{ stableId: 'stable-1' }]
    }),
    true
  )
})

test('reader document 缺失、论文不匹配或无段落时批注索引未就绪', () => {
  assert.equal(isPaperAnnotationIndexReady('paper-1', null), false)
  assert.equal(isPaperAnnotationIndexReady('paper-1', { paperId: 'paper-2', segments: [] }), false)
  assert.equal(isPaperAnnotationIndexReady('paper-1', { paperId: 'paper-1', segments: [] }), false)
})

test('fallback 段落 stableId 使用 seg-数字 形式', () => {
  assert.equal(isFallbackPaperSegmentStableId('seg-29'), true)
  assert.equal(isFallbackPaperSegmentStableId('stable-29'), false)
  assert.equal(isFallbackPaperSegmentStableId('seg-draft'), false)
})
