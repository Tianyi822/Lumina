/**
 * knowledge 同步文件加解密（纯函数）。
 *
 * 密文格式：nonce24 ‖ XChaCha20-Poly1305(dek, plaintext, aad) ‖ tag16
 * AAD 域：
 * - lumina-knowledge-file:（bases/metadata 整文件加密，走 session-files 通道）
 * - lumina-knowledge-block:（文件内容切块加密，走 blocks 通道）
 * - lumina-knowledge-manifest:（文件块清单加密，走 session-files 通道）
 * 三者 AAD 域分离，防止密文跨域误用。
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from 'node:crypto'
import { utf8ToBytes } from '../crypto/base64url'
import { sha256Hex } from '../crypto/hash'

const KNOWLEDGE_FILE_AAD = utf8ToBytes('lumina-knowledge-file:')
const KNOWLEDGE_BLOCK_AAD = utf8ToBytes('lumina-knowledge-block:')
const KNOWLEDGE_MANIFEST_AAD = utf8ToBytes('lumina-knowledge-manifest:')
const NONCE_BYTES = 24
const TAG_BYTES = 16
const DEK_BYTES = 32

function assertDek(dek: Uint8Array): void {
  if (dek.length !== DEK_BYTES) {
    throw new Error(`DEK 长度非法：期望 ${DEK_BYTES} 字节，实际 ${dek.length} 字节`)
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
  label: string
): Uint8Array {
  assertDek(dek)
  if (ciphertext.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error(`${label} 密文长度非法：${ciphertext.length} 字节`)
  }
  const nonce = ciphertext.subarray(0, NONCE_BYTES)
  const sealed = ciphertext.subarray(NONCE_BYTES)
  return xchacha20poly1305(dek, nonce, aad).decrypt(sealed)
}

/** 用 DEK 密封 knowledge 文件明文（bases/metadata，走 session-files 通道） */
export function sealKnowledgeFile(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return sealWithAad(dek, KNOWLEDGE_FILE_AAD, plaintext)
}

/** 解开 knowledge 文件密文；tag 校验失败/长度非法抛异常 */
export function openKnowledgeFile(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return openWithAad(dek, KNOWLEDGE_FILE_AAD, ciphertext, 'knowledge 文件')
}

/** 块加密：返回密文与 blockId（blockId = sha256(密文)，对齐 relay blocks 通道契约） */
export function sealKnowledgeBlock(
  dek: Uint8Array,
  chunk: Uint8Array
): { blockId: string; ciphertext: Uint8Array } {
  const ciphertext = sealWithAad(dek, KNOWLEDGE_BLOCK_AAD, chunk)
  return { blockId: sha256Hex(ciphertext), ciphertext }
}

/** 解开 knowledge 块密文；tag 校验失败/长度非法抛异常 */
export function openKnowledgeBlock(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return openWithAad(dek, KNOWLEDGE_BLOCK_AAD, ciphertext, 'knowledge 块')
}

/** 用 DEK 密封 knowledge 文件块清单明文（manifest，走 session-files 通道） */
export function sealKnowledgeManifest(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  return sealWithAad(dek, KNOWLEDGE_MANIFEST_AAD, plaintext)
}

/** 解开 knowledge 文件块清单密文；tag 校验失败/长度非法抛异常 */
export function openKnowledgeManifest(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  return openWithAad(dek, KNOWLEDGE_MANIFEST_AAD, ciphertext, 'knowledge 清单')
}
