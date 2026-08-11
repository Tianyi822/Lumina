import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { sha256Hex } from '../crypto/hash'
import {
  sealKnowledgeFile,
  openKnowledgeFile,
  sealKnowledgeBlock,
  openKnowledgeBlock,
  sealKnowledgeManifest,
  openKnowledgeManifest
} from './knowledgeSnapshotCrypto'

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

// === 块加密（knowledge file → blocks 通道）===

const BLOCK_PLAIN = new Uint8Array(randomBytes(100))

test('块加密：blockId = sha256(密文)，可解密还原', () => {
  const { blockId, ciphertext } = sealKnowledgeBlock(DEK, BLOCK_PLAIN)
  assert.equal(blockId, sha256Hex(ciphertext))
  assert.deepEqual(openKnowledgeBlock(DEK, ciphertext), BLOCK_PLAIN)
})

test('块密文篡改后解密抛异常', () => {
  const { ciphertext } = sealKnowledgeBlock(DEK, BLOCK_PLAIN)
  ciphertext[ciphertext.length - 1] ^= 0xff
  assert.throws(() => openKnowledgeBlock(DEK, ciphertext))
})

test('块密文长度非法抛异常', () => {
  assert.throws(() => openKnowledgeBlock(DEK, new Uint8Array(10)))
})

test('AAD 域隔离：block 密文不能用 file/manifest 打开', () => {
  const { ciphertext } = sealKnowledgeBlock(DEK, BLOCK_PLAIN)
  assert.throws(() => openKnowledgeFile(DEK, ciphertext))
  assert.throws(() => openKnowledgeManifest(DEK, ciphertext))
})

// === Manifest 加密（knowledge file manifest → session-files 通道）===

test('manifest seal/open 往返一致', () => {
  const ct = sealKnowledgeManifest(DEK, PLAINTEXT)
  assert.deepEqual(openKnowledgeManifest(DEK, ct), PLAINTEXT)
})

test('AAD 域隔离：manifest 密文不能用 file/block 打开', () => {
  const ct = sealKnowledgeManifest(DEK, PLAINTEXT)
  assert.throws(() => openKnowledgeFile(DEK, ct))
  assert.throws(() => openKnowledgeBlock(DEK, ct))
})

test('manifest 密文长度 > 明文 + nonce24', () => {
  const ct = sealKnowledgeManifest(DEK, PLAINTEXT)
  assert.ok(ct.length > PLAINTEXT.length + 24)
})
