/**
 * writing 同步文件加解密（纯函数）。
 *
 * 密文格式：nonce24 ‖ XChaCha20-Poly1305(dek, plaintext, aad) ‖ tag16
 * AAD 域：
 * - lumina-writer-file:（index/document JSON 整文件加密，走 session-files 通道）
 * - lumina-writer-asset-block:（资产内容切块加密，走 blocks 通道）
 * - lumina-writer-asset-manifest:（资产块清单加密，走 session-files 通道）
 * 三者 AAD 域分离（也与 config/session/paper/knowledge 域分离），密文不可跨域解密。
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from 'node:crypto'
import type { ParseKeys } from 'i18next'
import { t } from '@main/services/i18n'
import { utf8ToBytes } from '../crypto/base64url'
import { sha256Hex } from '../crypto/hash'

const WRITER_FILE_AAD = utf8ToBytes('lumina-writer-file:')
const WRITER_ASSET_BLOCK_AAD = utf8ToBytes('lumina-writer-asset-block:')
const WRITER_ASSET_MANIFEST_AAD = utf8ToBytes('lumina-writer-asset-manifest:')
const NONCE_BYTES = 24
const TAG_BYTES = 16
const DEK_BYTES = 32

function assertDek(dek: Uint8Array): void {
  if (dek.length !== DEK_BYTES) {
    throw new Error(
      t('notifications.sync.dekLengthInvalid', { expected: DEK_BYTES, actual: dek.length })
    )
  }
}

function sealWithAad(dek: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Uint8Array {
  assertDek(dek)
  const nonce = new Uint8Array(randomBytes(NONCE_BYTES))
  const sealed = xchacha20poly1305(dek, nonce, aad).encrypt(plaintext)
  const out = new Uint8Array(NONCE_BYTES + sealed.length)
  out.set(nonce, 0)
  out.set(sealed, NONCE_BYTES)
  return out
}

function openWithAad(
  dek: Uint8Array,
  aad: Uint8Array,
  ciphertext: Uint8Array,
  lengthErrorKey: Extract<ParseKeys, `notifications.sync.${string}`>
): Uint8Array {
  assertDek(dek)
  if (ciphertext.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error(t(lengthErrorKey, { length: ciphertext.length }))
  }
  const nonce = ciphertext.subarray(0, NONCE_BYTES)
  const sealed = ciphertext.subarray(NONCE_BYTES)
  return xchacha20poly1305(dek, nonce, aad).decrypt(sealed)
}

/** 用 DEK 密封 writing 文件明文（index/document JSON） */
export function sealWriterFile(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return sealWithAad(dek, WRITER_FILE_AAD, plaintext)
}

/** 解开 writing 文件密文；tag 校验失败/长度非法抛异常 */
export function openWriterFile(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return openWithAad(
    dek,
    WRITER_FILE_AAD,
    ciphertext,
    'notifications.sync.writerFileCiphertextLengthInvalid'
  )
}

/** 资产块加密：返回密文与 blockId（blockId = sha256(密文)，对齐 relay blocks 通道契约） */
export function sealWriterAssetBlock(
  dek: Uint8Array,
  chunk: Uint8Array
): { blockId: string; ciphertext: Uint8Array } {
  const ciphertext = sealWithAad(dek, WRITER_ASSET_BLOCK_AAD, chunk)
  return { blockId: sha256Hex(ciphertext), ciphertext }
}

/** 解开写作资产块密文；blockId 与密文 sha256 不符、tag 校验失败或长度非法抛异常 */
export function openWriterAssetBlock(
  dek: Uint8Array,
  blockId: string,
  ciphertext: Uint8Array
): Uint8Array {
  assertDek(dek)
  if (sha256Hex(ciphertext) !== blockId) {
    throw new Error(t('notifications.sync.writerAssetBlockIdMismatch', { blockId }))
  }
  return openWithAad(
    dek,
    WRITER_ASSET_BLOCK_AAD,
    ciphertext,
    'notifications.sync.writerAssetBlockCiphertextLengthInvalid'
  )
}

/** 用 DEK 密封写作资产块清单明文（走 session-files 通道） */
export function sealWriterAssetManifest(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return sealWithAad(dek, WRITER_ASSET_MANIFEST_AAD, plaintext)
}

/** 解开写作资产块清单密文；tag 校验失败/长度非法抛异常 */
export function openWriterAssetManifest(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return openWithAad(
    dek,
    WRITER_ASSET_MANIFEST_AAD,
    ciphertext,
    'notifications.sync.writerAssetManifestCiphertextLengthInvalid'
  )
}
