/**
 * 同步机密存储：用 Electron safeStorage 加密后写 ~/.lumina/sync/secrets.enc。
 *
 * 保存设备私钥种子、DEK、会话 Token。safeStorage 不可用时明确告警，
 * 密钥仅在本次会话内存中保留，不静默写入明文。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { safeStorage } from 'electron'
import { logger } from '@main/services/logger'
import { decodeBase64Url } from './crypto/base64url'
import { getSyncDirPath, getSyncSecretsFilePath } from './syncPaths'

/** 同步的本地机密（均为 base64url 编码的字节或不透明字符串） */
export interface SyncSecrets {
  /** 设备 Ed25519 种子（base64url，32 字节） */
  deviceSeedB64: string
  /** DEK（base64url，32 字节） */
  dekB64: string
  /** 会话 Token（JWT，不透明字符串） */
  sessionToken: string
}

export class SyncSecretStore {
  /** 安全存储是否可用 */
  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  /** 读取并解密机密；不可用/不存在/损坏返回 null */
  load(): SyncSecrets | null {
    const filePath = getSyncSecretsFilePath()
    if (!existsSync(filePath)) return null
    if (!this.isAvailable()) {
      logger.warn('安全存储不可用，无法读取同步机密', 'main')
      return null
    }
    try {
      const encrypted = readFileSync(filePath)
      const json = safeStorage.decryptString(encrypted)
      const parsed: unknown = JSON.parse(json)
      if (!isSyncSecrets(parsed)) {
        logger.warn('同步机密文件结构非法，已忽略', 'main')
        return null
      }
      return parsed
    } catch (error) {
      logger.warn('解密同步机密失败', 'main', { error: normalize(error) })
      return null
    }
  }

  /**
   * 加密并写入机密。安全存储不可用时告警并返回 false，由调用方保留内存身份。
   */
  save(secrets: SyncSecrets): boolean {
    if (!this.isAvailable()) {
      logger.warn('安全存储不可用，同步机密不落盘，仅本次会话内存保留', 'main')
      return false
    }
    const filePath = getSyncSecretsFilePath()
    const tempPath = `${filePath}.tmp`
    try {
      const dir = getSyncDirPath()
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const encrypted = safeStorage.encryptString(JSON.stringify(secrets))
      writeFileSync(tempPath, encrypted, { mode: 0o600 })
      renameSync(tempPath, filePath)
      return true
    } catch (error) {
      rmSync(tempPath, { force: true })
      logger.error('写入同步机密失败', 'main', { error: normalize(error) })
      return false
    }
  }

  /** 删除机密文件 */
  clear(): void {
    try {
      rmSync(getSyncSecretsFilePath(), { force: true })
    } catch (error) {
      logger.warn('清除同步机密失败', 'main', { error: normalize(error) })
    }
  }
}

function normalize(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isSyncSecrets(value: unknown): value is SyncSecrets {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.deviceSeedB64 !== 'string' ||
    typeof candidate.dekB64 !== 'string' ||
    typeof candidate.sessionToken !== 'string' ||
    candidate.sessionToken.length === 0
  ) {
    return false
  }
  try {
    decodeBase64Url(candidate.deviceSeedB64, 32)
    decodeBase64Url(candidate.dekB64, 32)
    return true
  } catch {
    return false
  }
}
