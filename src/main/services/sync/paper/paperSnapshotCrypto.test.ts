/**
 * paper 同步加解密测试：AEAD 往返、AAD 域隔离、块 blockId 契约。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { sha256Hex } from '../crypto/hash'
import {
  openPaperAnnotations,
  openPaperBlock,
  openPaperMeta,
  openPaperPack,
  sealPaperAnnotations,
  sealPaperBlock,
  sealPaperMeta,
  sealPaperPack
} from './paperSnapshotCrypto'

const DEK = new Uint8Array(randomBytes(32))
const PLAIN = new TextEncoder().encode('论文同步测试内容')

test('meta seal/open 往返；错误 DEK 抛异常', () => {
  const ct = sealPaperMeta(DEK, PLAIN)
  assert.deepEqual(openPaperMeta(DEK, ct), PLAIN)
  assert.throws(() => openPaperMeta(new Uint8Array(randomBytes(32)), ct))
})

test('AAD 域隔离：annotations 密文不能用 meta 打开', () => {
  const ct = sealPaperAnnotations(DEK, PLAIN)
  assert.deepEqual(openPaperAnnotations(DEK, ct), PLAIN)
  assert.throws(() => openPaperMeta(DEK, ct))
})

test('pack seal/open 往返', () => {
  const ct = sealPaperPack(DEK, PLAIN)
  assert.deepEqual(openPaperPack(DEK, ct), PLAIN)
  assert.throws(() => openPaperAnnotations(DEK, ct))
})

test('块加密：blockId = sha256(密文)，可解密还原', () => {
  const { blockId, ciphertext } = sealPaperBlock(DEK, PLAIN)
  assert.equal(blockId, sha256Hex(ciphertext))
  assert.deepEqual(openPaperBlock(DEK, ciphertext), PLAIN)
})

test('DEK 长度非法抛异常', () => {
  assert.throws(() => sealPaperMeta(new Uint8Array(16), PLAIN), /DEK 长度非法/)
})
