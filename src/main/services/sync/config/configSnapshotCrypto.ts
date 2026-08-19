/**
 * config 块与 manifest 加解密（纯函数）。
 *
 * 密文格式：nonce24 ‖ XChaCha20-Poly1305(dek, plaintext, aad) ‖ tag16
 * AAD 域分离：config 块用固定前缀，manifest 绑定 deviceId，防跨用途密文误用。
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from 'node:crypto'
import { t } from '@main/services/i18n'
import { utf8ToBytes } from '../crypto/base64url'

const CONFIG_BLOCK_AAD = utf8ToBytes('lumina-config-block:')
const MANIFEST_AAD_PREFIX = 'lumina-manifest:'

const NONCE_BYTES = 24
const TAG_BYTES = 16
const DEK_BYTES = 32

/** manifest AAD = utf8("lumina-manifest:") ‖ utf8(deviceId)，绑定到具体设备 */
function buildManifestAad(deviceId: string): Uint8Array {
  const prefix = utf8ToBytes(MANIFEST_AAD_PREFIX)
  const id = utf8ToBytes(deviceId)
  const aad = new Uint8Array(prefix.length + id.length)
  aad.set(prefix, 0)
  aad.set(id, prefix.length)
  return aad
}

function assertDek(dek: Uint8Array): void {
  if (dek.length !== DEK_BYTES) {
    throw new Error(
      t('notifications.sync.dekLengthInvalid', { expected: DEK_BYTES, actual: dek.length })
    )
  }
}

/** 用 DEK 密封 config 明文（整文件 = 1 块） */
export function sealConfigBlock(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  assertDek(dek)
  const nonce = new Uint8Array(randomBytes(NONCE_BYTES))
  const sealed = xchacha20poly1305(dek, nonce, CONFIG_BLOCK_AAD).encrypt(plaintext)
  const out = new Uint8Array(NONCE_BYTES + sealed.length)
  out.set(nonce, 0)
  out.set(sealed, NONCE_BYTES)
  return out
}

/** 解开 config 块密文；tag 校验失败/长度非法抛异常 */
export function openConfigBlock(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  assertDek(dek)
  if (ciphertext.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error(
      t('notifications.sync.configBlockCiphertextLengthInvalid', { length: ciphertext.length })
    )
  }
  const nonce = ciphertext.subarray(0, NONCE_BYTES)
  const sealed = ciphertext.subarray(NONCE_BYTES)
  return xchacha20poly1305(dek, nonce, CONFIG_BLOCK_AAD).decrypt(sealed)
}

/** 用 DEK 密封 manifest 明文，AAD 绑定 deviceId */
export function sealManifest(dek: Uint8Array, deviceId: string, plaintext: Uint8Array): Uint8Array {
  assertDek(dek)
  const nonce = new Uint8Array(randomBytes(NONCE_BYTES))
  const sealed = xchacha20poly1305(dek, nonce, buildManifestAad(deviceId)).encrypt(plaintext)
  const out = new Uint8Array(NONCE_BYTES + sealed.length)
  out.set(nonce, 0)
  out.set(sealed, NONCE_BYTES)
  return out
}

/** 解开 manifest 密文；deviceId 不匹配会 tag 失败抛异常 */
export function openManifest(
  dek: Uint8Array,
  deviceId: string,
  ciphertext: Uint8Array
): Uint8Array {
  assertDek(dek)
  if (ciphertext.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error(
      t('notifications.sync.configManifestCiphertextLengthInvalid', { length: ciphertext.length })
    )
  }
  const nonce = ciphertext.subarray(0, NONCE_BYTES)
  const sealed = ciphertext.subarray(NONCE_BYTES)
  return xchacha20poly1305(dek, nonce, buildManifestAad(deviceId)).decrypt(sealed)
}
