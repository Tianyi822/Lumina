/**
 * DEK 信封的 XChaCha20-Poly1305 封装/解封（§3.1）。
 *
 * 唯一字节格式（解码后必须恰好 72 字节）：
 *   24-byte random nonce || Seal(DEK, aad)   // 32 字节密文 + 16 字节 tag
 * AAD 由 buildDekEnvelopeAad 给出（instanceId, normalizedUsername, accountId, authSalt）。
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from 'node:crypto'
import { t } from '@main/services/i18n'

/** XChaCha20-Poly1305 的 nonce 字节数 */
const NONCE_BYTES = 24
/** DEK 明文字节数 */
const DEK_BYTES = 32
/** DEK 信封总字节数：24 nonce + 32 密文 + 16 tag */
const DEK_ENVELOPE_BYTES = 72

/** 生成随机 32 字节 DEK */
export function generateDek(): Uint8Array {
  return new Uint8Array(randomBytes(DEK_BYTES))
}

/**
 * 用 envelopeKey 封装 DEK，返回 72 字节信封。
 * @param envelopeKey 32 字节包裹密钥（deriveEnvelopeKey 得到）
 * @param dek 32 字节 DEK
 * @param aad 附加认证数据（buildDekEnvelopeAad）
 */
export function sealDek(envelopeKey: Uint8Array, dek: Uint8Array, aad: Uint8Array): Uint8Array {
  const nonce = new Uint8Array(randomBytes(NONCE_BYTES))
  const sealed = xchacha20poly1305(envelopeKey, nonce, aad).encrypt(dek)
  const envelope = new Uint8Array(NONCE_BYTES + sealed.length)
  envelope.set(nonce, 0)
  envelope.set(sealed, NONCE_BYTES)
  return envelope
}

/**
 * 用 envelopeKey 解开 72 字节 DEK 信封。
 * tag 校验失败会抛出异常（等价于密码错误）。
 */
export function openDek(
  envelopeKey: Uint8Array,
  envelope: Uint8Array,
  aad: Uint8Array
): Uint8Array {
  if (envelope.length !== DEK_ENVELOPE_BYTES) {
    throw new Error(
      t('notifications.sync.dekEnvelopeLengthInvalid', {
        expected: DEK_ENVELOPE_BYTES,
        actual: envelope.length
      })
    )
  }
  const nonce = envelope.subarray(0, NONCE_BYTES)
  const sealed = envelope.subarray(NONCE_BYTES)
  return xchacha20poly1305(envelopeKey, nonce, aad).decrypt(sealed)
}
