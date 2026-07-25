import test from 'node:test'
import assert from 'node:assert/strict'
import { saveWriterDocumentRequestSchema, writerDocumentSchema } from './writerSchema'

const content = {
  type: 'doc',
  content: [{ type: 'paragraph', attrs: { nodeId: 'block-1' }, content: [] }]
}

test('有效写作文档通过 Schema', () => {
  const parsed = writerDocumentSchema.parse({
    schemaVersion: 1,
    id: 'writer-12345678',
    revision: 0,
    title: '未命名文档',
    content,
    favorite: false,
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z'
  })
  assert.equal(parsed.content.type, 'doc')
})

test('保存请求拒绝负修订和非 doc 根节点', () => {
  assert.equal(
    saveWriterDocumentRequestSchema.safeParse({
      documentId: 'writer-12345678',
      expectedRevision: -1,
      title: '错误文档',
      content: { type: 'paragraph' }
    }).success,
    false
  )
})
