/**
 * isSessionSyncKey 谓词单测：真会话 key 与各领域 key 的判别。
 * 事故背景：listSessionFiles 返回五领域共用命名空间的全部 key，会话同步
 * 未过滤即把 knowledge-/paper-/writer- key 当会话 ID 解密，跨域 AAD 隔离
 * 导致每轮解密失败误报。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { isSessionSyncKey } from './sessionSyncKeys'

test('合法会话 ID 判为会话 key', () => {
  assert.equal(isSessionSyncKey('session-100-aaa'), true)
})

test('knowledge 领域 key 全部排除', () => {
  assert.equal(isSessionSyncKey('knowledge-bases'), false)
  assert.equal(isSessionSyncKey('knowledge-metadata'), false)
  assert.equal(isSessionSyncKey('knowledge-file-1773726865157'), false)
  assert.equal(isSessionSyncKey('knowledge-file-manifest-file-1773726865157'), false)
})

test('paper 领域 key 全部排除', () => {
  assert.equal(isSessionSyncKey('paper-meta-0154b2ab-cf67-460e-88c3-0c995f175863'), false)
  assert.equal(isSessionSyncKey('paper-annotations-0154b2ab-cf67-460e-88c3-0c995f175863'), false)
  assert.equal(isSessionSyncKey('paper-pack-0154b2ab-cf67-460e-88c3-0c995f175863'), false)
})

test('writer 领域 key 全部排除', () => {
  assert.equal(isSessionSyncKey('writer-index'), false)
  assert.equal(isSessionSyncKey('writer-doc-abc123'), false)
  assert.equal(isSessionSyncKey('writer-asset-abc123-img.png'), false)
})

test('非法会话 ID 排除', () => {
  assert.equal(isSessionSyncKey(''), false)
  assert.equal(isSessionSyncKey('a'), false)
  assert.equal(isSessionSyncKey('has.dot'), false)
  assert.equal(isSessionSyncKey('has_underscore'), false)
  assert.equal(isSessionSyncKey('Upper-case'), false)
  // 裸 UUID 是 paperId 形状，并非会话 ID（会话 ID 恒为 session-{timestamp}-{random}）
  assert.equal(isSessionSyncKey('0154b2ab-cf67-460e-88c3-0c995f175863'), false)
})
