/**
 * 同步非机密状态存储：读写 ~/.lumina/sync/state.json。
 * 仅保存不涉及密钥的元数据；机密（设备种子/DEK/Token）由 SyncSecretStore 管理。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { logger } from '@main/services/logger'
import { getSyncDirPath, getSyncStateFilePath } from './syncPaths'

/** 同步的本地非机密状态 */
export interface SyncState {
  relayUrl: string
  instanceId: string
  accountId: string
  deviceId: string
  normalizedUsername: string
  deviceName: string
  syncGroupId: string
  groupRevision: number
  cryptoStateRevision: number
  dekEpoch: number
  hasOtherSyncData: boolean
  /** 会话 Token 到期时间（Unix 秒） */
  sessionExpiresAt: number
  /** 服务端与本地时钟偏差（毫秒） */
  serverTimeOffsetMs: number
}

export class SyncStateStore {
  /** 读取状态；文件不存在或损坏返回 null */
  load(): SyncState | null {
    const filePath = getSyncStateFilePath()
    if (!existsSync(filePath)) return null
    try {
      const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf-8'))
      if (!isSyncState(parsed)) {
        logger.warn('同步状态文件结构非法，已忽略', 'main')
        return null
      }
      return parsed
    } catch (error) {
      logger.warn('读取同步状态失败', 'main', { error: normalize(error) })
      return null
    }
  }

  /** 写入完整状态 */
  save(state: SyncState): boolean {
    const filePath = getSyncStateFilePath()
    const tempPath = `${filePath}.tmp`
    try {
      const dir = getSyncDirPath()
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(tempPath, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 })
      renameSync(tempPath, filePath)
      return true
    } catch (error) {
      rmSync(tempPath, { force: true })
      logger.error('写入同步状态失败', 'main', { error: normalize(error) })
      return false
    }
  }

  /** 合并更新部分字段（仅在已有状态时生效） */
  update(patch: Partial<SyncState>): SyncState | null {
    const current = this.load()
    if (!current) return null
    const next = { ...current, ...patch }
    return this.save(next) ? next : null
  }

  /** 删除状态文件 */
  clear(): void {
    try {
      rmSync(getSyncStateFilePath(), { force: true })
    } catch (error) {
      logger.warn('清除同步状态失败', 'main', { error: normalize(error) })
    }
  }
}

function normalize(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isSyncState(value: unknown): value is SyncState {
  if (!isRecord(value)) return false
  const stringFields = [
    'relayUrl',
    'instanceId',
    'accountId',
    'deviceId',
    'normalizedUsername',
    'deviceName',
    'syncGroupId'
  ]
  if (!stringFields.every((field) => typeof value[field] === 'string' && value[field].length > 0)) {
    return false
  }
  const integerFields = ['groupRevision', 'cryptoStateRevision', 'dekEpoch', 'sessionExpiresAt']
  return (
    integerFields.every(
      (field) => Number.isSafeInteger(value[field]) && Number(value[field]) >= 0
    ) &&
    typeof value.hasOtherSyncData === 'boolean' &&
    typeof value.serverTimeOffsetMs === 'number' &&
    Number.isFinite(value.serverTimeOffsetMs)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
