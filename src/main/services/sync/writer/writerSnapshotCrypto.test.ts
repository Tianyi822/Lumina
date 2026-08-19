/**
 * writerSnapshotCrypto 纯函数单测：writing 文件/资产块/资产清单加解密往返、
 * 密文格式、篡改拒绝与 AAD 域隔离（跨域解密必须失败）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import {
  sealWriterFile,
  openWriterFile,
  sealWriterAssetBlock,
  openWriterAssetBlock,
  sealWriterAssetManifest,
  openWriterAssetManifest
} from './writerSnapshotCrypto'

const DEK = new Uint8Array(randomBytes(32))
const PLAINTEXT = new TextEncoder().encode('{"id":"writer-test","revision":1}')
const ASSET_BYTES = new Uint8Array(randomBytes(1024))

function sha256HexOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

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

// —— 写作资产块（blocks 通道，AAD = lumina-writer-asset-block:）——

test('资产块加解密往返一致，blockId = sha256(密文)', () => {
  const { blockId, ciphertext } = sealWriterAssetBlock(DEK, ASSET_BYTES)
  assert.match(blockId, /^[a-f0-9]{64}$/)
  // 用 node:crypto 独立复核 blockId 契约
  assert.equal(blockId, sha256HexOf(ciphertext))
  assert.ok(ciphertext.length > ASSET_BYTES.length + 24)
  const opened = openWriterAssetBlock(DEK, blockId, ciphertext)
  assert.deepEqual(opened, ASSET_BYTES)
})

test('openWriterAssetBlock 拒绝 blockId 与密文 sha256 不符', () => {
  const { blockId, ciphertext } = sealWriterAssetBlock(DEK, ASSET_BYTES)
  assert.throws(() => openWriterAssetBlock(DEK, '0'.repeat(64), ciphertext))
  // blockId 形态合法但指向别的密文同样拒绝
  assert.throws(() =>
    openWriterAssetBlock(DEK, blockId, sealWriterAssetBlock(DEK, ASSET_BYTES).ciphertext)
  )
})

test('资产块密文篡改后解密抛异常', () => {
  const { blockId, ciphertext } = sealWriterAssetBlock(DEK, ASSET_BYTES)
  ciphertext[ciphertext.length - 1] ^= 0xff
  assert.throws(() => openWriterAssetBlock(DEK, blockId, ciphertext))
})

test('资产块密文长度非法抛异常', () => {
  const short = new Uint8Array(10)
  assert.throws(() => openWriterAssetBlock(DEK, sha256HexOf(short), short))
})

// —— 写作资产清单（session-files 通道，AAD = lumina-writer-asset-manifest:）——

test('资产清单加解密往返一致', () => {
  const ct = sealWriterAssetManifest(DEK, PLAINTEXT)
  const pt = openWriterAssetManifest(DEK, ct)
  assert.deepEqual(pt, PLAINTEXT)
})

test('资产清单密文篡改后解密抛异常', () => {
  const ct = sealWriterAssetManifest(DEK, PLAINTEXT)
  ct[ct.length - 1] ^= 0xff
  assert.throws(() => openWriterAssetManifest(DEK, ct))
})

test('资产清单密文长度非法抛异常', () => {
  assert.throws(() => openWriterAssetManifest(DEK, new Uint8Array(10)))
})

// —— AAD 域隔离（跨域解密必须失败）——

test('manifest 域密文不能用资产块域解开', () => {
  const manifestCt = sealWriterAssetManifest(DEK, ASSET_BYTES)
  // 传入正确 sha256 使其通过 blockId 校验，tag 因 AAD 不符必须失败
  assert.throws(() => openWriterAssetBlock(DEK, sha256HexOf(manifestCt), manifestCt))
})

test('资产块域密文不能用 manifest 域解开', () => {
  const { ciphertext } = sealWriterAssetBlock(DEK, ASSET_BYTES)
  assert.throws(() => openWriterAssetManifest(DEK, ciphertext))
})

test('writer 文件域密文不能用资产块/清单域解开', () => {
  const fileCt = sealWriterFile(DEK, PLAINTEXT)
  assert.throws(() => openWriterAssetManifest(DEK, fileCt))
  assert.throws(() => openWriterAssetBlock(DEK, sha256HexOf(fileCt), fileCt))
})

test('资产块域密文不能用 writer 文件域解开', () => {
  const { ciphertext } = sealWriterAssetBlock(DEK, ASSET_BYTES)
  assert.throws(() => openWriterFile(DEK, ciphertext))
})

test('资产块/清单 DEK 长度非法抛异常', () => {
  const badDek = new Uint8Array(16)
  assert.throws(() => sealWriterAssetBlock(badDek, ASSET_BYTES))
  assert.throws(() => sealWriterAssetManifest(badDek, PLAINTEXT))
})
