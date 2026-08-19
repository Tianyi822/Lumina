/**
 * 统一 SHA-256（全项目禁止 BLAKE2b）。用于：
 * 1. 设备证明 canonical 串中的 hex(sha256(body))；
 * 2. blockId = hex(sha256(ciphertextBytes))；
 * 3. 注册 transcript 中的 sha256(dekEnvelope)。
 */
import { sha256 } from '@noble/hashes/sha2.js'

/** 计算 SHA-256，返回 32 字节 */
export function sha256Bytes(data: Uint8Array): Uint8Array {
  return sha256(data)
}

/** 计算 SHA-256，返回 64 位小写十六进制字符串 */
export function sha256Hex(data: Uint8Array): string {
  return Buffer.from(sha256(data)).toString('hex')
}
