/**
 * writing 同步 tracker：持久化每 key 的远端确认版本与内容 hash、删除 tombstone。
 * 存于 ~/.lumina/sync/writer-sync.json（非机密，原子写 0600）；损坏文件自愈为空初始。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '@main/services/logger'
import { resetTrackerDataIfOwnerChanged } from '../shared/trackerAccountScope'
import { getWriterSyncTrackerFilePath } from '../syncPaths'

/** tombstone 保留时长：30 天 */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** assets-manifest key 的单文件块基线（size+mtime 未变时复用 blockIds，避免每轮重切块） */
export interface TrackedWriterAssetFileBlocks {
  size: number
  mtime: string
  sha256: string
  blockIds: string[]
}

/** 单 key 的远端确认状态 */
export interface TrackedWriterKeyEntry {
  /** session-files 通道返回的 version */
  version: number
  /**
   * contentHash：index/document 为 sha256(本地明文) hex；
   * assets-manifest 为清单指纹（fileName:sha256:blockIds 摘要），dirty 判定
   */
  contentHash: string
  /** assets-manifest key 专属：文件块基线（index/document/旧 asset key 无此字段） */
  fileBlocks?: Record<string, TrackedWriterAssetFileBlocks>
}

/** 删除 tombstone：本端已删除、防止对端复活期间回流 */
export interface WriterTombstoneEntry {
  deletedAt: string
}

/** tracker 文件结构 */
export interface WriterSyncTrackerData {
  schemaVersion: 1
  /** 该 tracker 数据所属的同步账号；缺省/null 表示未绑定（首次同步时认领） */
  ownerAccountId?: string | null
  keys: Record<string, TrackedWriterKeyEntry>
  tombstones: Record<string, WriterTombstoneEntry>
  lastSyncAt: string | null
}

function emptyData(): WriterSyncTrackerData {
  return { schemaVersion: 1, ownerAccountId: null, keys: {}, tombstones: {}, lastSyncAt: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAssetFileBlocks(value: unknown): value is TrackedWriterAssetFileBlocks {
  if (!isRecord(value)) return false
  if (!Number.isSafeInteger(value.size)) return false
  if (typeof value.mtime !== 'string') return false
  if (typeof value.sha256 !== 'string') return false
  if (!Array.isArray(value.blockIds) || !value.blockIds.every((b) => typeof b === 'string')) {
    return false
  }
  return true
}

function isTrackerData(value: unknown): value is WriterSyncTrackerData {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== 1) return false
  if (
    value.ownerAccountId !== undefined &&
    !(value.ownerAccountId === null || typeof value.ownerAccountId === 'string')
  ) {
    return false
  }
  if (!(value.lastSyncAt === null || typeof value.lastSyncAt === 'string')) return false
  if (!isRecord(value.keys) || !isRecord(value.tombstones)) return false
  for (const entry of Object.values(value.keys)) {
    if (!isRecord(entry)) return false
    if (!Number.isSafeInteger(entry.version) || typeof entry.contentHash !== 'string') return false
    // fileBlocks 可选（仅 assets-manifest key）；存在时必须结构合法，损坏整体自愈为空初始
    if (entry.fileBlocks !== undefined) {
      if (!isRecord(entry.fileBlocks)) return false
      for (const blocks of Object.values(entry.fileBlocks)) {
        if (!isAssetFileBlocks(blocks)) return false
      }
    }
  }
  for (const entry of Object.values(value.tombstones)) {
    if (!isRecord(entry) || typeof entry.deletedAt !== 'string') return false
  }
  return true
}

export class WriterSyncTracker {
  private readonly filePath: string
  private data: WriterSyncTrackerData | null = null

  constructor(filePath: string = getWriterSyncTrackerFilePath()) {
    this.filePath = filePath
  }

  /** 读取数据（懒加载 + 内存缓存）；缺失/损坏返回空初始 */
  getData(): WriterSyncTrackerData {
    if (this.data) return this.data
    if (!existsSync(this.filePath)) {
      this.data = emptyData()
      return this.data
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      this.data = isTrackerData(parsed) ? parsed : emptyData()
    } catch (error) {
      logger.warn('writing 同步 tracker 损坏，已重置', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      this.data = emptyData()
    }
    return this.data
  }

  setKey(key: string, entry: TrackedWriterKeyEntry): void {
    this.getData().keys[key] = entry
  }

  removeKey(key: string): void {
    delete this.getData().keys[key]
  }

  setTombstone(key: string, deletedAt: string): void {
    this.getData().tombstones[key] = { deletedAt }
  }

  getTombstone(key: string): WriterTombstoneEntry | null {
    return this.getData().tombstones[key] ?? null
  }

  /** 清理超过保留期的 tombstone；损坏（deletedAt 不可解析）的保留以防远端复活 */
  pruneTombstones(nowMs: number = Date.now()): void {
    const tombstones = this.getData().tombstones
    for (const [key, entry] of Object.entries(tombstones)) {
      const deletedAtMs = Date.parse(entry.deletedAt)
      // 解析失败时保留 tombstone：删除会让远端同 key 已删数据在下行阶段复活落盘
      if (Number.isNaN(deletedAtMs)) continue
      if (nowMs - deletedAtMs > TOMBSTONE_TTL_MS) {
        delete tombstones[key]
      }
    }
  }

  setLastSyncAt(iso: string): void {
    this.getData().lastSyncAt = iso
  }

  /** 账号变更时整体重置（返回 true 表示已重置并持久化）；未绑定时认领当前账号 */
  resetIfOwnerChanged(accountId: string | null): boolean {
    const outcome = resetTrackerDataIfOwnerChanged(this.getData(), accountId, emptyData)
    this.data = outcome.data
    if (outcome.reset) this.save()
    return outcome.reset
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
      logger.error('写入 writing 同步 tracker 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }
}
