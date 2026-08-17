/**
 * paper 同步加解密（纯函数）。
 *
 * 密文格式：nonce24 ‖ XChaCha20-Poly1305(dek, plaintext, aad) ‖ tag16
 * AAD 域：lumina-paper-meta: / lumina-paper-annotations: / lumina-paper-pack: / lumina-paper-block:
 * 与其他数据域（session/config/writer/knowledge）分离。
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from 'node:crypto'
import { t } from '@main/services/i18n'
import { utf8ToBytes } from '../crypto/base64url'
import { sha256Hex } from '../crypto/hash'

const PAPER_META_AAD = utf8ToBytes('lumina-paper-meta:')
const PAPER_ANNOTATIONS_AAD = utf8ToBytes('lumina-paper-annotations:')
const PAPER_PACK_AAD = utf8ToBytes('lumina-paper-pack:')
const PAPER_BLOCK_AAD = utf8ToBytes('lumina-paper-block:')
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
  lengthErrorKey: string
): Uint8Array {
  assertDek(dek)
  if (ciphertext.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error(t(lengthErrorKey, { length: ciphertext.length }))
  }
  const nonce = ciphertext.subarray(0, NONCE_BYTES)
  const sealed = ciphertext.subarray(NONCE_BYTES)
  return xchacha20poly1305(dek, nonce, aad).decrypt(sealed)
}

/** 用 DEK 密封/解开 paper meta 明文 */
export function sealPaperMeta(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return sealWithAad(dek, PAPER_META_AAD, plaintext)
}
export function openPaperMeta(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return openWithAad(
    dek,
    PAPER_META_AAD,
    ciphertext,
    'notifications.sync.paperMetaCiphertextLengthInvalid'
  )
}

/** 用 DEK 密封/解开 paper annotations 明文 */
export function sealPaperAnnotations(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return sealWithAad(dek, PAPER_ANNOTATIONS_AAD, plaintext)
}
export function openPaperAnnotations(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return openWithAad(
    dek,
    PAPER_ANNOTATIONS_AAD,
    ciphertext,
    'notifications.sync.paperAnnotationsCiphertextLengthInvalid'
  )
}

/** 用 DEK 密封/解开 paper pack manifest 明文 */
export function sealPaperPack(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return sealWithAad(dek, PAPER_PACK_AAD, plaintext)
}
export function openPaperPack(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return openWithAad(
    dek,
    PAPER_PACK_AAD,
    ciphertext,
    'notifications.sync.paperPackCiphertextLengthInvalid'
  )
}

/** 块加密：返回密文与 blockId（blockId = sha256(密文)，对齐 relay blocks 通道契约） */
export function sealPaperBlock(
  dek: Uint8Array,
  chunk: Uint8Array
): { blockId: string; ciphertext: Uint8Array } {
  const ciphertext = sealWithAad(dek, PAPER_BLOCK_AAD, chunk)
  return { blockId: sha256Hex(ciphertext), ciphertext }
}

/** 解开 paper 块密文；tag 校验失败/长度非法抛异常 */
export function openPaperBlock(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return openWithAad(
    dek,
    PAPER_BLOCK_AAD,
    ciphertext,
    'notifications.sync.paperBlockCiphertextLengthInvalid'
  )
}
