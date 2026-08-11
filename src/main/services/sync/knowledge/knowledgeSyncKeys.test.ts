import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeBasesKey,
  makeMetadataKey,
  makeFileKey,
  makeFileManifestKey,
  isKnowledgeKey,
  parseKnowledgeKey
} from './knowledgeSyncKeys'

test('makeBasesKey 返回固定 key', () => {
  assert.equal(makeBasesKey(), 'knowledge-bases')
})

test('makeMetadataKey 返回固定 key', () => {
  assert.equal(makeMetadataKey(), 'knowledge-metadata')
})

test('makeFileKey 拼接 fileId', () => {
  assert.equal(makeFileKey('file-1234567890'), 'knowledge-file-file-1234567890')
})

test('makeFileManifestKey 拼接 fileId', () => {
  assert.equal(makeFileManifestKey('file-1234567890'), 'knowledge-file-manifest-file-1234567890')
})

test('isKnowledgeKey 识别四种前缀', () => {
  assert.equal(isKnowledgeKey('knowledge-bases'), true)
  assert.equal(isKnowledgeKey('knowledge-metadata'), true)
  assert.equal(isKnowledgeKey('knowledge-file-file-123'), true)
  assert.equal(isKnowledgeKey('knowledge-file-manifest-file-123'), true)
  assert.equal(isKnowledgeKey('writer-index'), false)
  assert.equal(isKnowledgeKey('session-123-abc'), false)
})

test('parseKnowledgeKey 解析 bases', () => {
  assert.deepEqual(parseKnowledgeKey('knowledge-bases'), { kind: 'bases' })
})

test('parseKnowledgeKey 解析 metadata', () => {
  assert.deepEqual(parseKnowledgeKey('knowledge-metadata'), { kind: 'metadata' })
})

test('parseKnowledgeKey 解析 file', () => {
  assert.deepEqual(parseKnowledgeKey('knowledge-file-file-1234567890'), {
    kind: 'file',
    fileId: 'file-1234567890'
  })
})

test('parseKnowledgeKey 解析 file-manifest', () => {
  assert.deepEqual(parseKnowledgeKey('knowledge-file-manifest-file-1234567890'), {
    kind: 'file-manifest',
    fileId: 'file-1234567890'
  })
})

test('parseKnowledgeKey 对非 knowledge key 返回 null', () => {
  assert.equal(parseKnowledgeKey('writer-index'), null)
  assert.equal(parseKnowledgeKey('knowledge-unknown'), null)
})

test('parseKnowledgeKey 前缀歧义隔离：file-manifest 不被误判为 file', () => {
  // knowledge-file-manifest-xxx 也以 knowledge-file- 开头，
  // 必须解析为 file-manifest 而非 file（fileId='manifest-xxx'）
  const parsed = parseKnowledgeKey('knowledge-file-manifest-file-abc')
  assert.equal(parsed?.kind, 'file-manifest')
  assert.notEqual(parsed?.kind, 'file')
})
