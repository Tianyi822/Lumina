/**
 * config 同步 tracker：持久化本设备 manifest 链指针、config hash 与已应用远端 head。
 * 存于 ~/.lumina/sync/config-sync.json（非机密，原子写 0600）；损坏自愈为空初始。
 * 校验仅检查自身字段，对旧版文件中的多余字段宽容（忽略不拒绝）。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '@main/services/logger'
import { getConfigSyncTrackerFilePath } from '../syncPaths'

/** 已应用的远端 manifest head（下载/合并确认后记录，未变则整轮跳过） */
interface AppliedRemoteHead {
  deviceId: string
  version: number
}

/** tracker 文件结构 */
export interface ConfigSyncTrackerData {
  schemaVersion: 1
  /** putSelfManifest 返回的 version（本设备 manifest 链 CAS base） */
  selfManifestVersion: number
  /** sha256(本地 config.json 明文) hex（上次同步确认值） */
  syncedConfigHash: string
  /** 上次下行/合并时应用的远端 head；null 表示从未应用 */
  appliedRemoteHead: AppliedRemoteHead | null
  lastSyncAt: string | null
}

function emptyData(): ConfigSyncTrackerData {
  return {
    schemaVersion: 1,
    selfManifestVersion: 0,
    syncedConfigHash: '',
    appliedRemoteHead: null,
    lastSyncAt: null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAppliedRemoteHead(value: unknown): value is AppliedRemoteHead {
  if (!isRecord(value)) return false
  return typeof value.deviceId === 'string' && Number.isSafeInteger(value.version)
}

function isTrackerData(value: unknown): value is ConfigSyncTrackerData {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== 1) return false
  if (!Number.isSafeInteger(value.selfManifestVersion)) return false
  if (typeof value.syncedConfigHash !== 'string') return false
  if (!(value.appliedRemoteHead === null || isAppliedRemoteHead(value.appliedRemoteHead))) {
    return false
  }
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

  setSelfManifest(version: number): void {
    this.getData().selfManifestVersion = version
  }

  setSyncedConfig(hash: string): void {
    this.getData().syncedConfigHash = hash
  }

  setAppliedRemoteHead(deviceId: string, version: number): void {
    this.getData().appliedRemoteHead = { deviceId, version }
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
