import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeIndexKey,
  makeDocKey,
  makeAssetKey,
  isWriterKey,
  parseWriterKey
} from './writerSyncKeys'

/** 服务端 sessionId 正则（中段不允许点号等特殊字符） */
const SERVER_SESSION_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/

test('makeIndexKey 返回固定 key', () => {
  assert.equal(makeIndexKey(), 'writer-index')
})

test('makeDocKey 拼接 documentId', () => {
  assert.equal(makeDocKey('writer-abc12345'), 'writer-doc-writer-abc12345')
})

test('makeAssetKey 拼接 documentId 与 fileName（点号换连字符）', () => {
  assert.equal(
    makeAssetKey('writer-abc12345', 'a1b2c3d4.png'),
    'writer-asset-writer-abc12345-a1b2c3d4-png'
  )
})

test('makeAssetKey 生成的 key 符合服务端 sessionId 正则', () => {
  for (const fileName of ['a1b2c3d4.png', 'deadbeef.jpg', 'cafebabe.webp', '0123abcd.gif']) {
    const key = makeAssetKey('writer-abc12345', fileName)
    assert.ok(SERVER_SESSION_ID_PATTERN.test(key), `key 不合规: ${key}`)
  }
})

test('makeAssetKey 与 parseWriterKey 往返对称', () => {
  for (const fileName of ['a1b2c3d4.png', 'deadbeef.jpg', 'cafebabe.webp', '0123abcd.gif']) {
    const key = makeAssetKey('writer-abc12345', fileName)
    assert.deepEqual(parseWriterKey(key), {
      kind: 'asset',
      documentId: 'writer-abc12345',
      fileName
    })
  }
})

test('parseWriterKey 拒绝旧带点号格式', () => {
  assert.equal(parseWriterKey('writer-asset-writer-abc12345-a1b2c3d4.png'), null)
})

test('isWriterKey 识别三种前缀', () => {
  assert.equal(isWriterKey('writer-index'), true)
  assert.equal(isWriterKey('writer-doc-writer-abc'), true)
  assert.equal(isWriterKey('writer-asset-writer-abc-hash-png'), true)
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

test('parseWriterKey 解析 asset（key 内连字符，fileName 还原点号）', () => {
  assert.deepEqual(parseWriterKey('writer-asset-writer-abc12345-deadbeef-png'), {
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
  assert.equal(parseWriterKey('writer-asset-writer-abc-hash-txt'), null)
  assert.ok(parseWriterKey('writer-asset-writer-abc-hash-jpg'))
  assert.ok(parseWriterKey('writer-asset-writer-abc-hash-webp'))
  assert.ok(parseWriterKey('writer-asset-writer-abc-hash-gif'))
})
