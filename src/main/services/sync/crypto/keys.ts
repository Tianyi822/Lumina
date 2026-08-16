/**
 * Ed25519 密钥与签名封装（§3.2）。
 *
 * 三类 key（login / account-auth / device）均由各自的 32 字节种子生成，
 * 私钥即种子。登录 key、account-auth key、设备 key 三类种子不得复用。
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { randomBytes } from 'node:crypto'

/** Ed25519 种子/私钥字节数 */
const ED25519_SEED_BYTES = 32

/** 生成随机 32 字节 Ed25519 种子（设备 key 用） */
export function generateSeed(): Uint8Array {
  return new Uint8Array(randomBytes(ED25519_SEED_BYTES))
}

/** 由种子导出 32 字节公钥 */
export function getPublicKey(seed: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(seed)
}

/** 用种子对消息做 Ed25519 签名，返回 64 字节签名 */
export function sign(message: Uint8Array, seed: Uint8Array): Uint8Array {
  return ed25519.sign(message, seed)
}

/** 校验 Ed25519 签名（用于本地单测） */
export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  return ed25519.verify(signature, message, publicKey)
}
