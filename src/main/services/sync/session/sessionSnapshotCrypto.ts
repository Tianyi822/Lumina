/**
 * 会话快照加解密（纯函数）。
 *
 * 密文格式：nonce24 ‖ XChaCha20-Poly1305(dek, plaintext, aad)
 * AAD = utf8("lumina-session-file:") ‖ utf8(sessionId)，把密文绑定到具体会话。
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from 'node:crypto'
import { utf8ToBytes } from '../crypto/base64url'

/** AAD 前缀（固定长度，拼接无歧义） */
export const SESSION_SNAPSHOT_AAD_PREFIX = 'lumina-session-file:'

const NONCE_BYTES = 24
const TAG_BYTES = 16
const DEK_BYTES = 32

function buildAad(sessionId: string): Uint8Array {
  const prefix = utf8ToBytes(SESSION_SNAPSHOT_AAD_PREFIX)
  const id = utf8ToBytes(sessionId)
  const aad = new Uint8Array(prefix.length + id.length)
  aad.set(prefix, 0)
  aad.set(id, prefix.length)
  return aad
}

function assertDek(dek: Uint8Array): void {
  if (dek.length !== DEK_BYTES) {
    throw new Error(`DEK 长度非法：期望 ${DEK_BYTES} 字节，实际 ${dek.length}`)
  }
}

/** 用 DEK 密封会话快照明文 */
export function sealSessionSnapshot(
  dek: Uint8Array,
  sessionId: string,
  plaintext: Uint8Array
): Uint8Array {
  assertDek(dek)
  const nonce = new Uint8Array(randomBytes(NONCE_BYTES))
  const sealed = xchacha20poly1305(dek, nonce, buildAad(sessionId)).encrypt(plaintext)
  const out = new Uint8Array(NONCE_BYTES + sealed.length)
  out.set(nonce, 0)
  out.set(sealed, NONCE_BYTES)
  return out
}

/** 解开会话快照密文；tag 校验失败/AAD 不匹配/长度非法抛异常 */
export function openSessionSnapshot(
  dek: Uint8Array,
  sessionId: string,
  ciphertext: Uint8Array
): Uint8Array {
  assertDek(dek)
  if (ciphertext.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error(`会话快照密文长度非法：${ciphertext.length} 字节`)
  }
  const nonce = ciphertext.subarray(0, NONCE_BYTES)
  const sealed = ciphertext.subarray(NONCE_BYTES)
  return xchacha20poly1305(dek, nonce, buildAad(sessionId)).decrypt(sealed)
}
