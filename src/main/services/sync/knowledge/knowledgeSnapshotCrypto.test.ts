import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { sealKnowledgeFile, openKnowledgeFile } from './knowledgeSnapshotCrypto'

const DEK = new Uint8Array(randomBytes(32))
const PLAINTEXT = new TextEncoder().encode('{"id":"kb-test","name":"测试库"}')

test('加解密往返一致', () => {
  const ct = sealKnowledgeFile(DEK, PLAINTEXT)
  const pt = openKnowledgeFile(DEK, ct)
  assert.deepEqual(pt, PLAINTEXT)
})

test('密文长度 > 明文 + nonce24', () => {
  const ct = sealKnowledgeFile(DEK, PLAINTEXT)
  assert.ok(ct.length > PLAINTEXT.length + 24)
})

test('密文篡改后解密抛异常', () => {
  const ct = sealKnowledgeFile(DEK, PLAINTEXT)
  ct[ct.length - 1] ^= 0xff
  assert.throws(() => openKnowledgeFile(DEK, ct))
})

test('密文长度非法抛异常', () => {
  assert.throws(() => openKnowledgeFile(DEK, new Uint8Array(10)))
})

test('DEK 长度非法抛异常', () => {
  const badDek = new Uint8Array(16)
  assert.throws(() => sealKnowledgeFile(badDek, PLAINTEXT))
  assert.throws(() => openKnowledgeFile(badDek, new Uint8Array(50)))
})
