/**
 * config 同步 tracker：持久化本设备 manifest 链指针与 config hash。
 * 存于 ~/.lumina/sync/config-sync.json（非机密，原子写 0600）；损坏自愈为空初始。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '@main/services/logger'
import { getConfigSyncTrackerFilePath } from '../syncPaths'

/** 本设备 manifest 链已确认状态 */
interface TrackedConfigEntry {
  /** putSelfManifest 返回的 version */
  selfManifestVersion: number
  /** sha256(上传的 manifest 密文) hex，幂等判定 */
  selfManifestContentHash: string
}

/** tracker 文件结构 */
export interface ConfigSyncTrackerData extends TrackedConfigEntry {
  schemaVersion: 1
  /** sha256(本地 config.json 明文) hex（上次同步确认值） */
  syncedConfigHash: string
  /** 对应的 mtime（ISO），LWW 比对基准 */
  syncedConfigMtime: string
  lastSyncAt: string | null
}

function emptyData(): ConfigSyncTrackerData {
  return {
    schemaVersion: 1,
    selfManifestVersion: 0,
    selfManifestContentHash: '',
    syncedConfigHash: '',
    syncedConfigMtime: '',
    lastSyncAt: null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTrackerData(value: unknown): value is ConfigSyncTrackerData {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== 1) return false
  if (!Number.isSafeInteger(value.selfManifestVersion)) return false
  if (typeof value.selfManifestContentHash !== 'string') return false
  if (typeof value.syncedConfigHash !== 'string') return false
  if (typeof value.syncedConfigMtime !== 'string') return false
  if (!(value.lastSyncAt === null || typeof value.lastSyncAt === 'string')) return false
  return true
}

export class ConfigSyncTracker {
  private readonly filePath: string
  private data: ConfigSyncTrackerData | null = null

  constructor(filePath: string = getConfigSyncTrackerFilePath()) {
    this.filePath = filePath
  }

  /** 读取数据（懒加载 + 内存缓存）；缺失/损坏返回空初始 */
  getData(): ConfigSyncTrackerData {
    if (this.data) return this.data
    if (!existsSync(this.filePath)) {
      this.data = emptyData()
      return this.data
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      this.data = isTrackerData(parsed) ? parsed : emptyData()
    } catch (error) {
      logger.warn('config 同步 tracker 损坏，已重置', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      this.data = emptyData()
    }
    return this.data
  }

  setSelfManifest(version: number, contentHash: string): void {
    const data = this.getData()
    data.selfManifestVersion = version
    data.selfManifestContentHash = contentHash
  }

  setSyncedConfig(hash: string, mtime: string): void {
    const data = this.getData()
    data.syncedConfigHash = hash
    data.syncedConfigMtime = mtime
  }

  setLastSyncAt(iso: string): void {
    this.getData().lastSyncAt = iso
  }

  /** 原子写（tmp → rename），0600 */
  save(): boolean {
    const tempPath = `${this.filePath}.tmp`
    try {
      const dir = dirname(this.filePath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      writeFileSync(tempPath, JSON.stringify(this.getData(), null, 2), {
        encoding: 'utf-8',
        mode: 0o600
      })
      renameSync(tempPath, this.filePath)
      return true
    } catch (error) {
      rmSync(tempPath, { force: true })
      logger.error('写入 config 同步 tracker 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }
}
