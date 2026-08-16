import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeIndexKey,
  makeDocKey,
  makeAssetKey,
  isWriterKey,
  parseWriterKey
} from './writerSyncKeys'

test('makeIndexKey 返回固定 key', () => {
  assert.equal(makeIndexKey(), 'writer-index')
})

test('makeDocKey 拼接 documentId', () => {
  assert.equal(makeDocKey('writer-abc12345'), 'writer-doc-writer-abc12345')
})

test('makeAssetKey 拼接 documentId 与 fileName', () => {
  assert.equal(
    makeAssetKey('writer-abc12345', 'a1b2c3d4.png'),
    'writer-asset-writer-abc12345-a1b2c3d4.png'
  )
})

test('isWriterKey 识别三种前缀', () => {
  assert.equal(isWriterKey('writer-index'), true)
  assert.equal(isWriterKey('writer-doc-writer-abc'), true)
  assert.equal(isWriterKey('writer-asset-writer-abc-hash.png'), true)
  assert.equal(isWriterKey('session-12345-abc'), false)
  assert.equal(isWriterKey('config'), false)
})

test('parseWriterKey 解析 index', () => {
  assert.deepEqual(parseWriterKey('writer-index'), { kind: 'index' })
})

test('parseWriterKey 解析 document', () => {
  assert.deepEqual(parseWriterKey('writer-doc-writer-abc12345'), {
    kind: 'document',
    documentId: 'writer-abc12345'
  })
})

test('parseWriterKey 解析 asset（含扩展名）', () => {
  assert.deepEqual(parseWriterKey('writer-asset-writer-abc12345-deadbeef.png'), {
    kind: 'asset',
    documentId: 'writer-abc12345',
    fileName: 'deadbeef.png'
  })
})

test('parseWriterKey 对非 writing key 返回 null', () => {
  assert.equal(parseWriterKey('session-12345-abc'), null)
  assert.equal(parseWriterKey('writer-unknown'), null)
})

test('parseWriterKey 对 asset 扩展名校验（仅 png/jpg/webp/gif）', () => {
  assert.equal(parseWriterKey('writer-asset-writer-abc-hash.txt'), null)
  assert.ok(parseWriterKey('writer-asset-writer-abc-hash.jpg'))
  assert.ok(parseWriterKey('writer-asset-writer-abc-hash.webp'))
  assert.ok(parseWriterKey('writer-asset-writer-abc-hash.gif'))
})
