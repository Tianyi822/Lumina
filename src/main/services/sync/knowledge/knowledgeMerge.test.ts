import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeKnowledgeBases, mergeFileItems } from './knowledgeMerge'
import type { KnowledgeBase, FileItem } from '@shared/types/knowledge'

function makeKB(overrides: Partial<KnowledgeBase> = {}): KnowledgeBase {
  return {
    id: 'kb-test',
    name: '测试库',
    embeddingConfig: { baseUrl: 'http://x', model: 'm', dimensions: 768 },
    embeddingDimension: 768,
    chunkSize: 500,
    chunkOverlap: 50,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    linkedFileIds: [],
    ...overrides
  } as KnowledgeBase
}

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: 'file-test',
    name: 'test.txt',
    filePath: '123-abc.txt',
    absolutePath: '/data/files/123-abc.txt',
    fileType: 'text/plain',
    size: 100,
    uploadedAt: '2026-08-05T00:00:00.000Z',
    usedByKBIds: [],
    sourceKind: 'uploaded',
    ...overrides
  } as FileItem
}

test('KB 按 id 并集，同 id 取 updatedAt 更新', () => {
  const local = [makeKB({ id: 'kb-1', updatedAt: '2026-08-04T00:00:00.000Z' })]
  const remote = [
    makeKB({ id: 'kb-1', name: '远端改名', updatedAt: '2026-08-05T00:00:00.000Z' }),
    makeKB({ id: 'kb-2', name: '远端新增', updatedAt: '2026-08-03T00:00:00.000Z' })
  ]
  const result = mergeKnowledgeBases({ local, remote })
  assert.equal(result.merged.length, 2)
  const kb1 = result.merged.find((k) => k.id === 'kb-1')
  assert.equal(kb1?.name, '远端改名')
  assert.equal(result.changed, true)
})

test('KB 完全相同 changed=false', () => {
  const kb = makeKB()
  const result = mergeKnowledgeBases({ local: [kb], remote: [kb] })
  assert.equal(result.changed, false)
})

test('KB embeddingConfig 全字段同步（含 apiKey）', () => {
  const local: KnowledgeBase[] = []
  const remote = [
    makeKB({
      embeddingConfig: {
        baseUrl: 'http://api.example.com',
        apiKey: 'sk-secret-key',
        model: 'text-embedding-3',
        dimensions: 1536
      }
    })
  ]
  const result = mergeKnowledgeBases({ local, remote })
  assert.equal(result.merged[0].embeddingConfig.apiKey, 'sk-secret-key')
})

test('File 按 id 并集，同 id 取 uploadedAt 更新', () => {
  const local = [makeFile({ id: 'file-1', uploadedAt: '2026-08-04T00:00:00.000Z' })]
  const remote = [
    makeFile({ id: 'file-1', name: '远端改名.txt', uploadedAt: '2026-08-05T00:00:00.000Z' }),
    makeFile({ id: 'file-2', name: '新增.txt', uploadedAt: '2026-08-03T00:00:00.000Z' })
  ]
  const result = mergeFileItems({ local, remote })
  assert.equal(result.merged.length, 2)
  const f1 = result.merged.find((f) => f.id === 'file-1')
  assert.equal(f1?.name, '远端改名.txt')
})

test('File 完全相同 changed=false', () => {
  const file = makeFile()
  const result = mergeFileItems({ local: [file], remote: [file] })
  assert.equal(result.changed, false)
})
