import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeWriterIndex } from './writerMerge'
import type { WriterIndex } from '@shared/types/writer'

function makeIndex(overrides: Partial<WriterIndex> = {}): WriterIndex {
  return {
    schemaVersion: 1,
    folders: [],
    documents: [],
    recentDocumentIds: [],
    ...overrides
  } as WriterIndex
}

test('folders 按 id 并集，同 id 取 updatedAt 更新', () => {
  const local = makeIndex({
    folders: [
      {
        id: 'f1',
        name: '本地',
        sortOrder: 0,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-04T10:00:00.000Z'
      }
    ]
  })
  const remote = makeIndex({
    folders: [
      {
        id: 'f1',
        name: '远端改名',
        sortOrder: 0,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-04T11:00:00.000Z'
      },
      {
        id: 'f2',
        name: '远端新增',
        sortOrder: 1,
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z'
      }
    ]
  })
  const result = mergeWriterIndex({ local, remote })
  assert.equal(result.merged.folders.length, 2)
  const f1 = result.merged.folders.find((f) => f.id === 'f1')
  assert.equal(f1?.name, '远端改名') // updatedAt 更新
  assert.equal(result.changed, true)
})

test('recentDocumentIds 本机优先', () => {
  const local = makeIndex({ recentDocumentIds: ['doc-a', 'doc-b'] })
  const remote = makeIndex({ recentDocumentIds: ['doc-x', 'doc-y'] })
  const result = mergeWriterIndex({ local, remote })
  assert.deepEqual(result.merged.recentDocumentIds, ['doc-a', 'doc-b'])
})

test('documents summary 用 local', () => {
  const local = makeIndex({
    documents: [
      {
        id: 'writer-a',
        revision: 1,
        title: 'A',
        favorite: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z'
      }
    ]
  })
  const remote = makeIndex({
    documents: [
      {
        id: 'writer-b',
        revision: 1,
        title: 'B',
        favorite: false,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z'
      }
    ]
  })
  const result = mergeWriterIndex({ local, remote })
  assert.equal(result.merged.documents.length, 1)
  assert.equal(result.merged.documents[0].id, 'writer-a')
})

test('schemaVersion 取较大值', () => {
  const local = makeIndex({ schemaVersion: 1 })
  const remote = makeIndex({ schemaVersion: 2 } as Partial<WriterIndex>)
  const result = mergeWriterIndex({ local, remote })
  assert.equal(result.merged.schemaVersion, 2)
})

test('完全相同时 changed=false', () => {
  const idx = makeIndex({
    folders: [
      {
        id: 'f1',
        name: 'F1',
        sortOrder: 0,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z'
      }
    ]
  })
  const result = mergeWriterIndex({ local: idx, remote: idx })
  assert.equal(result.changed, false)
})
