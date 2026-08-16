/**
 * 密码派生与 HKDF 域分离（§3.1）。
 *
 * passwordRoot = Argon2id(password, authSalt, m=65536KiB, t=3, p=1, out=32)
 * 再用 HKDF-SHA256 做域分离（HKDF salt 为零长度空值，Argon2id 已使用 authSalt）：
 *   loginSeed       = HKDF(passwordRoot, info="lumina-login-ed25519",        32)
 *   envelopeKey     = HKDF(passwordRoot, info="lumina-dek-envelope-key",     32)
 *   accountAuthSeed = HKDF(DEK,          info="lumina-account-auth-ed25519", 32)
 *
 * 登录 key、account-auth key、设备 key 三类种子不得复用。
 */
import { argon2idAsync } from '@noble/hashes/argon2.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { utf8ToBytes } from './base64url'

/** 固定的 Argon2id 参数（与 `/connections/start` 返回的 kdf 一致） */
const ARGON2ID_PARAMS = {
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 1,
  outputBytes: 32
} as const

const INFO_LOGIN = 'lumina-login-ed25519'
const INFO_ENVELOPE_KEY = 'lumina-dek-envelope-key'
const INFO_ACCOUNT_AUTH = 'lumina-account-auth-ed25519'

/** HKDF salt 为零长度空值（不是 authSalt） */
const EMPTY_SALT = new Uint8Array(0)

/**
 * 密码取 UTF-8 字节（不做 Unicode normalization）派生 passwordRoot。
 * @param password 明文密码
 * @param authSalt `/connections/start` 返回的 16 字节 authSalt
 */
export function derivePasswordRoot(password: string, authSalt: Uint8Array): Promise<Uint8Array> {
  return argon2idAsync(utf8ToBytes(password), authSalt, {
    t: ARGON2ID_PARAMS.iterations,
    m: ARGON2ID_PARAMS.memoryKiB,
    p: ARGON2ID_PARAMS.parallelism,
    dkLen: ARGON2ID_PARAMS.outputBytes,
    asyncTick: 16
  })
}

/** 由 passwordRoot 派生 Ed25519 登录 key 种子 */
export function deriveLoginSeed(passwordRoot: Uint8Array): Uint8Array {
  return hkdf(sha256, passwordRoot, EMPTY_SALT, utf8ToBytes(INFO_LOGIN), 32)
}

/** 由 passwordRoot 派生 DEK 信封包裹密钥（XChaCha20-Poly1305 key） */
export function deriveEnvelopeKey(passwordRoot: Uint8Array): Uint8Array {
  return hkdf(sha256, passwordRoot, EMPTY_SALT, utf8ToBytes(INFO_ENVELOPE_KEY), 32)
}

/** 由 DEK 派生 account-auth Ed25519 key 种子 */
export function deriveAccountAuthSeed(dek: Uint8Array): Uint8Array {
  return hkdf(sha256, dek, EMPTY_SALT, utf8ToBytes(INFO_ACCOUNT_AUTH), 32)
}
