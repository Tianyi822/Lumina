/**
 * sessionSnapshotCrypto 纯函数单测：密封/解开、AAD 绑定、篡改拒绝。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { utf8ToBytes } from '../crypto/base64url'
import { openSessionSnapshot, sealSessionSnapshot } from './sessionSnapshotCrypto'

const dek = new Uint8Array(randomBytes(32))
const sessionId = 'session-1000-abc'

test('密封后可解开，内容逐字节一致', () => {
  const plaintext = utf8ToBytes('{"kind":"meta"}\n')
  const sealed = sealSessionSnapshot(dek, sessionId, plaintext)
  assert.equal(sealed.length, 24 + plaintext.length + 16)
  assert.deepEqual(openSessionSnapshot(dek, sessionId, sealed), plaintext)
})

test('AAD 绑定 sessionId：换 sessionId 解不开', () => {
  const sealed = sealSessionSnapshot(dek, sessionId, utf8ToBytes('data'))
  assert.throws(() => openSessionSnapshot(dek, 'session-1000-other', sealed))
})

test('DEK 错误解不开', () => {
  const sealed = sealSessionSnapshot(dek, sessionId, utf8ToBytes('data'))
  assert.throws(() => openSessionSnapshot(new Uint8Array(randomBytes(32)), sessionId, sealed))
})

test('篡改密文被拒绝', () => {
  const sealed = sealSessionSnapshot(dek, sessionId, utf8ToBytes('data'))
  sealed[30] = (sealed[30] ?? 0) ^ 0xff
  assert.throws(() => openSessionSnapshot(dek, sessionId, sealed))
})

test('长度非法直接抛异常', () => {
  assert.throws(() => openSessionSnapshot(dek, sessionId, new Uint8Array(10)))
  assert.throws(() => sealSessionSnapshot(new Uint8Array(16), sessionId, utf8ToBytes('x')))
})
