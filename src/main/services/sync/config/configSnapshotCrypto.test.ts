/**
 * configSnapshotCrypto 纯函数单测：config 块与 manifest 加解密往返、AAD 域分离、篡改拒绝。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  sealConfigBlock,
  openConfigBlock,
  sealManifest,
  openManifest
} from './configSnapshotCrypto'

const DEK = new Uint8Array(randomBytes(32))
const PLAINTEXT = new TextEncoder().encode('{"theme":{"name":"lumina-dark"}}')

test('config 块加解密往返一致', () => {
  const ct = sealConfigBlock(DEK, PLAINTEXT)
  const pt = openConfigBlock(DEK, ct)
  assert.deepEqual(pt, PLAINTEXT)
})

test('config 块密文包含 nonce24 前缀且长度增加', () => {
  const ct = sealConfigBlock(DEK, PLAINTEXT)
  assert.ok(ct.length > PLAINTEXT.length + 24) // nonce24 + tag16
})

test('config 块密文篡改后解密抛异常', () => {
  const ct = sealConfigBlock(DEK, PLAINTEXT)
  ct[ct.length - 1] ^= 0xff // 翻转 tag 末位
  assert.throws(() => openConfigBlock(DEK, ct))
})

test('config 块密文长度非法抛异常', () => {
  const tooShort = new Uint8Array(10)
  assert.throws(() => openConfigBlock(DEK, tooShort))
})

test('DEK 长度非法抛异常', () => {
  const badDek = new Uint8Array(16)
  assert.throws(() => sealConfigBlock(badDek, PLAINTEXT))
  assert.throws(() => openConfigBlock(badDek, new Uint8Array(50)))
})

test('manifest 加解密往返一致', () => {
  const deviceId = 'device-abc-123'
  const manifestJson = new TextEncoder().encode('{"version":1,"files":[]}')
  const ct = sealManifest(DEK, deviceId, manifestJson)
  const pt = openManifest(DEK, deviceId, ct)
  assert.deepEqual(pt, manifestJson)
})

test('manifest AAD 绑定 deviceId：换 deviceId 解密失败', () => {
  const deviceId = 'device-abc-123'
  const ct = sealManifest(DEK, deviceId, new TextEncoder().encode('payload'))
  assert.throws(() => openManifest(DEK, 'other-device', ct))
})

test('config 块密文不能用 manifest 解密（AAD 域分离）', () => {
  const blockCt = sealConfigBlock(DEK, PLAINTEXT)
  assert.throws(() => openManifest(DEK, 'any-device', blockCt))
})
