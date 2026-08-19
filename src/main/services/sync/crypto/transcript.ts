/**
 * 账户生命周期 transcript / DEK 信封 AAD 的长度前缀编码。
 *
 * 与服务端 `internal/auth/transcript.go` 逐字节一致：
 *   UTF8(domain) || repeat( uint32be(byteLength(field)) || fieldBytes )
 * domain 为原文前缀（无冒号、无长度前缀），随后每个字段先写 4 字节大端长度。
 * 字段顺序固定，不能改用 JSON / 分隔符拼接 / 字段排序。
 */
import { utf8ToBytes } from './base64url'

/** transcript / AAD 域常量（与服务端一致，均无尾随冒号） */
const DOMAIN_ACCOUNT_CREATE = 'lumina-account-create'
const DOMAIN_LOGIN_PROOF = 'lumina-login-proof'
const DOMAIN_DEVICE_SESSION = 'lumina-device-session'
const DOMAIN_DISCARD_GROUPS = 'lumina-discard-sync-groups'
const DOMAIN_DEK_ENVELOPE = 'lumina-dek-envelope'

/** 4 字节大端无符号整数 */
function uint32be(value: number): Uint8Array {
  const buf = new Uint8Array(4)
  new DataView(buf.buffer).setUint32(0, value >>> 0, false)
  return buf
}

/** 8 字节大端无符号整数（用于 groupRevision） */
function uint64be(value: number): Uint8Array {
  const buf = new Uint8Array(8)
  new DataView(buf.buffer).setBigUint64(0, BigInt(value), false)
  return buf
}

/**
 * 按 `UTF8(domain) || Σ(uint32be(len)+field)` 构造 transcript 字节。
 */
export function buildTranscript(domain: string, fields: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [utf8ToBytes(domain)]
  for (const field of fields) {
    parts.push(uint32be(field.length))
    parts.push(field)
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** 注册 transcript（lumina-account-create） */
export function buildAccountCreateTranscript(input: {
  instanceId: string
  attemptId: string
  challenge: Uint8Array
  normalizedUsername: string
  accountId: string
  authSalt: Uint8Array
  loginPublicKey: Uint8Array
  accountAuthPublicKey: Uint8Array
  dekEnvelopeHash: Uint8Array
  deviceId: string
  deviceName: string
  devicePublicKey: Uint8Array
}): Uint8Array {
  return buildTranscript(DOMAIN_ACCOUNT_CREATE, [
    utf8ToBytes(input.instanceId),
    utf8ToBytes(input.attemptId),
    input.challenge,
    utf8ToBytes(input.normalizedUsername),
    utf8ToBytes(input.accountId),
    input.authSalt,
    input.loginPublicKey,
    input.accountAuthPublicKey,
    input.dekEnvelopeHash,
    utf8ToBytes(input.deviceId),
    utf8ToBytes(input.deviceName),
    input.devicePublicKey
  ])
}

/** 登录 transcript（lumina-login-proof） */
export function buildLoginTranscript(input: {
  instanceId: string
  attemptId: string
  normalizedUsername: string
  challenge: Uint8Array
  deviceId: string
  deviceName: string
  devicePublicKey: Uint8Array
}): Uint8Array {
  return buildTranscript(DOMAIN_LOGIN_PROOF, [
    utf8ToBytes(input.instanceId),
    utf8ToBytes(input.attemptId),
    utf8ToBytes(input.normalizedUsername),
    input.challenge,
    utf8ToBytes(input.deviceId),
    utf8ToBytes(input.deviceName),
    input.devicePublicKey
  ])
}

/** 会话续期 transcript（lumina-device-session） */
export function buildSessionTranscript(input: {
  instanceId: string
  attemptId: string
  challenge: Uint8Array
  deviceId: string
}): Uint8Array {
  return buildTranscript(DOMAIN_DEVICE_SESSION, [
    utf8ToBytes(input.instanceId),
    utf8ToBytes(input.attemptId),
    input.challenge,
    utf8ToBytes(input.deviceId)
  ])
}

/** 放弃其他同步组 transcript（lumina-discard-sync-groups） */
export function buildDiscardGroupsTranscript(input: {
  instanceId: string
  accountId: string
  deviceId: string
  groupId: string
  groupRevision: number
}): Uint8Array {
  return buildTranscript(DOMAIN_DISCARD_GROUPS, [
    utf8ToBytes(input.instanceId),
    utf8ToBytes(input.accountId),
    utf8ToBytes(input.deviceId),
    utf8ToBytes(input.groupId),
    uint64be(input.groupRevision)
  ])
}

/** DEK 信封 AAD（lumina-dek-envelope） */
export function buildDekEnvelopeAad(input: {
  instanceId: string
  normalizedUsername: string
  accountId: string
  authSalt: Uint8Array
}): Uint8Array {
  return buildTranscript(DOMAIN_DEK_ENVELOPE, [
    utf8ToBytes(input.instanceId),
    utf8ToBytes(input.normalizedUsername),
    utf8ToBytes(input.accountId),
    input.authSalt
  ])
}
