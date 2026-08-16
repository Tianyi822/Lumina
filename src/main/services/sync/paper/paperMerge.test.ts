/**
 * paper 合并纯函数测试：meta 整文档 LWW、annotations 按 id 并集 LWW。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import type { PaperAnnotation, PaperAnnotationStore, PaperDocument } from '@shared/types/paper'
import { mergePaperAnnotations, mergePaperMeta } from './paperMerge'

function makeMeta(id: string, updatedAt: string, title = '标题'): PaperDocument {
  return {
    id,
    fileName: `${id}.pdf`,
    title,
    filePath: `/papers/${id}/source.pdf`,
    fileHash: 'a'.repeat(64),
    fileSize: 1000,
    pageCount: 10,
    status: 'completed',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt,
    lastOpenedAt: updatedAt,
    ocrProvider: 'glm',
    ocrModel: 'glm-4v',
    completedPageCount: 10
  } as PaperDocument
}

function makeAnnotation(id: string, updatedAt: string, comment = ''): PaperAnnotation {
  return { id, kind: 'highlight', colorKey: 'blue', updatedAt, comment } as PaperAnnotation
}

function makeStore(
  paperId: string,
  annotations: PaperAnnotation[],
  updatedAt: string
): PaperAnnotationStore {
  return { version: 3, paperId, annotations, updatedAt } as PaperAnnotationStore
}

test('meta：远端 updatedAt 更新 → 远端赢', () => {
  const local = makeMeta('p1', '2026-08-01T00:00:00.000Z', '旧')
  const remote = makeMeta('p1', '2026-08-02T00:00:00.000Z', '新')
  const { merged, changed } = mergePaperMeta({ local, remote })
  assert.equal(merged.title, '新')
  assert.equal(changed, true)
})

test('meta：本地更新 → 本地赢且 changed=false', () => {
  const local = makeMeta('p1', '2026-08-02T00:00:00.000Z', '本地')
  const remote = makeMeta('p1', '2026-08-01T00:00:00.000Z', '远端')
  const { merged, changed } = mergePaperMeta({ local, remote })
  assert.equal(merged.title, '本地')
  assert.equal(changed, false)
})

test('meta：本地不存在 → 远端直接采纳', () => {
  const remote = makeMeta('p1', '2026-08-01T00:00:00.000Z')
  const { merged, changed } = mergePaperMeta({ local: null, remote })
  assert.equal(merged.id, 'p1')
  assert.equal(changed, true)
})

test('annotations：按 id 并集，同 id 取 updatedAt 更新', () => {
  const local = makeStore(
    'p1',
    [
      makeAnnotation('a1', '2026-08-02T00:00:00.000Z', '本地新'),
      makeAnnotation('a2', '2026-08-01T00:00:00.000Z')
    ],
    '2026-08-02T00:00:00.000Z'
  )
  const remote = makeStore(
    'p1',
    [
      makeAnnotation('a1', '2026-08-01T00:00:00.000Z', '远端旧'),
      makeAnnotation('a3', '2026-08-01T00:00:00.000Z')
    ],
    '2026-08-01T00:00:00.000Z'
  )
  const { merged, changed } = mergePaperAnnotations({ local, remote })
  assert.equal(merged.annotations.length, 3)
  assert.equal(merged.annotations.find((a) => a.id === 'a1')?.comment, '本地新')
  assert.equal(changed, true)
})

test('annotations：本地为 null → 远端直接采纳；无变化时 changed=false', () => {
  const remote = makeStore(
    'p1',
    [makeAnnotation('a1', '2026-08-01T00:00:00.000Z')],
    '2026-08-01T00:00:00.000Z'
  )
  const adopted = mergePaperAnnotations({ local: null, remote })
  assert.equal(adopted.merged.annotations.length, 1)
  assert.equal(adopted.changed, true)

  const same = mergePaperAnnotations({ local: remote, remote })
  assert.equal(same.changed, false)
})
