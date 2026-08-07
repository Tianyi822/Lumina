/**
 * 会话同步 tracker：持久化每会话的远端确认版本与内容 hash、删除 tombstone。
 * 存于 ~/.lumina/sync/session-sync.json（非机密，原子写 0600）；损坏文件自愈为空初始。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '@main/services/logger'
import { getSessionSyncTrackerFilePath } from '../syncPaths'

/** tombstone 保留时长：30 天 */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 单会话的远端确认状态 */
export interface TrackedSessionEntry {
  /** 远端已确认版本号 */
  version: number
  /** 该版本对应的本地落盘内容 sha256（hex） */
  contentHash: string
}

/** 删除 tombstone：本端已删除、防止对端复活期间回流 */
export interface SessionTombstoneEntry {
  deletedAt: string
}

/** tracker 文件结构 */
export interface SessionSyncTrackerData {
  schemaVersion: 1
  lastSyncAt: string | null
  sessions: Record<string, TrackedSessionEntry>
  tombstones: Record<string, SessionTombstoneEntry>
}

function emptyData(): SessionSyncTrackerData {
  return { schemaVersion: 1, lastSyncAt: null, sessions: {}, tombstones: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTrackerData(value: unknown): value is SessionSyncTrackerData {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== 1) return false
  if (!(value.lastSyncAt === null || typeof value.lastSyncAt === 'string')) return false
  if (!isRecord(value.sessions) || !isRecord(value.tombstones)) return false
  for (const entry of Object.values(value.sessions)) {
    if (!isRecord(entry)) return false
    if (!Number.isSafeInteger(entry.version) || typeof entry.contentHash !== 'string') return false
  }
  for (const entry of Object.values(value.tombstones)) {
    if (!isRecord(entry) || typeof entry.deletedAt !== 'string') return false
  }
  return true
}

export class SessionSyncTracker {
  private readonly filePath: string
  private data: SessionSyncTrackerData | null = null

  constructor(filePath: string = getSessionSyncTrackerFilePath()) {
    this.filePath = filePath
  }

  /** 读取数据（懒加载 + 内存缓存）；缺失/损坏返回空初始 */
  getData(): SessionSyncTrackerData {
    if (this.data) return this.data
    if (!existsSync(this.filePath)) {
      this.data = emptyData()
      return this.data
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      this.data = isTrackerData(parsed) ? parsed : emptyData()
    } catch (error) {
      logger.warn('会话同步 tracker 损坏，已重置', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      this.data = emptyData()
    }
    return this.data
  }

  setSession(sessionId: string, entry: TrackedSessionEntry): void {
    this.getData().sessions[sessionId] = entry
  }

  removeSession(sessionId: string): void {
    delete this.getData().sessions[sessionId]
  }

  setTombstone(sessionId: string, deletedAt: string): void {
    this.getData().tombstones[sessionId] = { deletedAt }
  }

  getTombstone(sessionId: string): SessionTombstoneEntry | null {
    return this.getData().tombstones[sessionId] ?? null
  }

  /** 清理超过保留期的 tombstone；损坏（deletedAt 不可解析）的保留以防远端复活 */
  pruneTombstones(nowMs: number = Date.now()): void {
    const tombstones = this.getData().tombstones
    for (const [sessionId, entry] of Object.entries(tombstones)) {
      const deletedAtMs = Date.parse(entry.deletedAt)
      // 解析失败时保留 tombstone：删除会让远端同 key 已删数据在下行阶段复活落盘
      if (Number.isNaN(deletedAtMs)) continue
      if (nowMs - deletedAtMs > TOMBSTONE_TTL_MS) {
        delete tombstones[sessionId]
      }
    }
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
      logger.error('写入会话同步 tracker 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }
}
