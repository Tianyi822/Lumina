/**
 * writing 同步文件加解密（纯函数）。
 *
 * 密文格式：nonce24 ‖ XChaCha20-Poly1305(dek, plaintext, aad) ‖ tag16
 * AAD = utf8("lumina-writer-file:")，与 config/session 的 AAD 域分离。
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from 'node:crypto'
import { utf8ToBytes } from '../crypto/base64url'

const WRITER_FILE_AAD = utf8ToBytes('lumina-writer-file:')
const NONCE_BYTES = 24
const TAG_BYTES = 16
const DEK_BYTES = 32

function assertDek(dek: Uint8Array): void {
  if (dek.length !== DEK_BYTES) {
    throw new Error(`DEK 长度非法：期望 ${DEK_BYTES} 字节，实际 ${dek.length} 字节`)
  }
}

/** 用 DEK 密封 writing 文件明文 */
export function sealWriterFile(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  assertDek(dek)
  const nonce = new Uint8Array(randomBytes(NONCE_BYTES))
  const sealed = xchacha20poly1305(dek, nonce, WRITER_FILE_AAD).encrypt(plaintext)
  const out = new Uint8Array(NONCE_BYTES + sealed.length)
  out.set(nonce, 0)
  out.set(sealed, NONCE_BYTES)
  return out
}

/** 解开 writing 文件密文；tag 校验失败/长度非法抛异常 */
export function openWriterFile(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  assertDek(dek)
  if (ciphertext.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error(`writing 文件密文长度非法：${ciphertext.length} 字节`)
  }
  const nonce = ciphertext.subarray(0, NONCE_BYTES)
  const sealed = ciphertext.subarray(NONCE_BYTES)
  return xchacha20poly1305(dek, nonce, WRITER_FILE_AAD).decrypt(sealed)
}
