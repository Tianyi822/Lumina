/**
 * writerSnapshotCrypto 纯函数单测：writing 文件加解密往返、密文格式与篡改拒绝。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { sealWriterFile, openWriterFile } from './writerSnapshotCrypto'

const DEK = new Uint8Array(randomBytes(32))
const PLAINTEXT = new TextEncoder().encode('{"id":"writer-test","revision":1}')

test('加解密往返一致', () => {
  const ct = sealWriterFile(DEK, PLAINTEXT)
  const pt = openWriterFile(DEK, ct)
  assert.deepEqual(pt, PLAINTEXT)
})

test('密文长度 > 明文 + nonce24 + tag16', () => {
  const ct = sealWriterFile(DEK, PLAINTEXT)
  assert.ok(ct.length > PLAINTEXT.length + 24)
})

test('密文篡改后解密抛异常', () => {
  const ct = sealWriterFile(DEK, PLAINTEXT)
  ct[ct.length - 1] ^= 0xff
  assert.throws(() => openWriterFile(DEK, ct))
})

test('密文长度非法抛异常', () => {
  assert.throws(() => openWriterFile(DEK, new Uint8Array(10)))
})

test('DEK 长度非法抛异常', () => {
  const badDek = new Uint8Array(16)
  assert.throws(() => sealWriterFile(badDek, PLAINTEXT))
  assert.throws(() => openWriterFile(badDek, new Uint8Array(50)))
})
