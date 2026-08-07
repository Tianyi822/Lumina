/**
 * knowledge 同步 tracker：持久化每 key 的远端确认版本与内容 hash、删除 tombstone。
 * 存于 ~/.lumina/sync/knowledge-sync.json（非机密，原子写 0600）；损坏文件自愈为空初始。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '@main/services/logger'
import { getKnowledgeSyncTrackerFilePath } from '../syncPaths'

/** tombstone 保留时长：30 天 */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 单 key 的远端确认状态 */
export interface TrackedKnowledgeKeyEntry {
  version: number
  contentHash: string
}

/** 删除 tombstone */
export interface KnowledgeTombstoneEntry {
  deletedAt: string
}

/** tracker 文件结构 */
export interface KnowledgeSyncTrackerData {
  schemaVersion: 1
  keys: Record<string, TrackedKnowledgeKeyEntry>
  tombstones: Record<string, KnowledgeTombstoneEntry>
  lastSyncAt: string | null
}

function emptyData(): KnowledgeSyncTrackerData {
  return { schemaVersion: 1, keys: {}, tombstones: {}, lastSyncAt: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTrackerData(value: unknown): value is KnowledgeSyncTrackerData {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== 1) return false
  if (!(value.lastSyncAt === null || typeof value.lastSyncAt === 'string')) return false
  if (!isRecord(value.keys) || !isRecord(value.tombstones)) return false
  for (const entry of Object.values(value.keys)) {
    if (!isRecord(entry)) return false
    if (!Number.isSafeInteger(entry.version) || typeof entry.contentHash !== 'string') return false
  }
  for (const entry of Object.values(value.tombstones)) {
    if (!isRecord(entry) || typeof entry.deletedAt !== 'string') return false
  }
  return true
}

export class KnowledgeSyncTracker {
  private readonly filePath: string
  private data: KnowledgeSyncTrackerData | null = null

  constructor(filePath: string = getKnowledgeSyncTrackerFilePath()) {
    this.filePath = filePath
  }

  getData(): KnowledgeSyncTrackerData {
    if (this.data) return this.data
    if (!existsSync(this.filePath)) {
      this.data = emptyData()
      return this.data
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      this.data = isTrackerData(parsed) ? parsed : emptyData()
    } catch (error) {
      logger.warn('knowledge 同步 tracker 损坏，已重置', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      this.data = emptyData()
    }
    return this.data
  }

  setKey(key: string, entry: TrackedKnowledgeKeyEntry): void {
    this.getData().keys[key] = entry
  }

  removeKey(key: string): void {
    delete this.getData().keys[key]
  }

  setTombstone(key: string, deletedAt: string): void {
    this.getData().tombstones[key] = { deletedAt }
  }

  getTombstone(key: string): KnowledgeTombstoneEntry | null {
    return this.getData().tombstones[key] ?? null
  }

  pruneTombstones(nowMs: number = Date.now()): void {
    const tombstones = this.getData().tombstones
    for (const [key, entry] of Object.entries(tombstones)) {
      const deletedAtMs = Date.parse(entry.deletedAt)
      // deletedAt 无法解析的损坏记录保留：删除会让远端同 key 复活失去拦截
      if (Number.isNaN(deletedAtMs)) continue
      if (nowMs - deletedAtMs > TOMBSTONE_TTL_MS) {
        delete tombstones[key]
      }
    }
  }

  setLastSyncAt(iso: string): void {
    this.getData().lastSyncAt = iso
  }

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
      logger.error('写入 knowledge 同步 tracker 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }
}
