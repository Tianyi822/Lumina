import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  makeIndexKey,
  makeDocKey,
  makeAssetKey,
  makeAssetsManifestKey,
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

// —— writer-assets manifest key（写作资产 manifest 通道化）——

test('makeAssetsManifestKey 拼接 documentId', () => {
  assert.equal(makeAssetsManifestKey('writer-abc12345'), 'writer-assets-writer-abc12345')
})

test('makeAssetsManifestKey 真实 docId 形态（writer-+uuid 共 43 字符）生成 57 字符 key', () => {
  const documentId = `writer-${randomUUID()}`
  assert.equal(documentId.length, 43)
  const key = makeAssetsManifestKey(documentId)
  assert.equal(key, `writer-assets-${documentId}`)
  assert.equal(key.length, 57) // 'writer-assets-' 14 字符 + docId 43 字符
})

test('makeAssetsManifestKey 生成的 key 符合服务端 sessionId 正则（≤64 实测）', () => {
  for (let i = 0; i < 20; i++) {
    const key = makeAssetsManifestKey(`writer-${randomUUID()}`)
    assert.ok(key.length <= 64, `key 超长: ${key.length}`)
    assert.ok(SERVER_SESSION_ID_PATTERN.test(key), `key 不合规: ${key}`)
  }
})

test('makeAssetsManifestKey 与 parseWriterKey 往返对称', () => {
  const documentId = `writer-${randomUUID()}`
  assert.deepEqual(parseWriterKey(makeAssetsManifestKey(documentId)), {
    kind: 'assets-manifest',
    documentId
  })
})

test('writer-assets- 前缀与旧 writer-asset- 前缀无嵌套混淆', () => {
  // manifest 前缀第 13 字符是 's' 而非连字符，不会被旧 asset 分支吞掉
  const parsed = parseWriterKey('writer-assets-writer-abc12345')
  assert.equal(parsed?.kind, 'assets-manifest')
  // 反向：旧 asset key 也不会被 manifest 分支吞掉（legacy 识别保留）
  const legacy = parseWriterKey('writer-asset-writer-abc12345-deadbeef-png')
  assert.deepEqual(legacy, {
    kind: 'asset',
    documentId: 'writer-abc12345',
    fileName: 'deadbeef.png'
  })
})

test('parseWriterKey 解析顺序：index → assets-manifest → doc → asset', () => {
  assert.deepEqual(parseWriterKey('writer-index'), { kind: 'index' })
  assert.deepEqual(parseWriterKey('writer-assets-writer-abc12345'), {
    kind: 'assets-manifest',
    documentId: 'writer-abc12345'
  })
  assert.deepEqual(parseWriterKey('writer-doc-writer-abc12345'), {
    kind: 'document',
    documentId: 'writer-abc12345'
  })
  assert.deepEqual(parseWriterKey('writer-asset-writer-abc12345-deadbeef-png'), {
    kind: 'asset',
    documentId: 'writer-abc12345',
    fileName: 'deadbeef.png'
  })
})

test('parseWriterKey 对 assets-manifest 的 documentId 形态校验', () => {
  assert.equal(parseWriterKey('writer-assets-'), null) // 空 documentId
  assert.equal(parseWriterKey('writer-assets-abc'), null) // 不符合 writer- 前缀形态
  assert.equal(parseWriterKey('writer-assets-Writer-abc'), null) // 大写非法
})

test('isWriterKey 识别 assets-manifest key', () => {
  assert.equal(isWriterKey('writer-assets-writer-abc12345'), true)
  assert.equal(isWriterKey('writer-assets-abc'), true) // 形态校验只在 parse 做
})
