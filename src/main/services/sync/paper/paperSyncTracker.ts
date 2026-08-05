/**
 * paper 同步 tracker：持久化每 key 的远端确认版本与内容 hash、删除 tombstone、
 * 每篇论文的 pack 基线（块复用 + 懒下载状态）。
 * 存于 ~/.lumina/sync/paper-sync.json（非机密，原子写 0600）；损坏文件自愈为空初始。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { logger } from '@main/services/logger'
import { getPaperSyncTrackerFilePath } from '../syncPaths'
import type { PaperPackManifest } from './paperPack'

/** tombstone 保留时长：30 天 */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 单 key 的远端确认状态 */
export interface TrackedPaperKeyEntry {
  version: number
  contentHash: string
}

/** 删除 tombstone */
export interface PaperTombstoneEntry {
  deletedAt: string
}

/** pack 基线中的单文件记录（块复用 + dirty 快判） */
export interface TrackedPaperPackFile {
  size: number
  mtime: string
  sha256: string
  blockIds: string[]
}

export type PaperPackDownloadState = 'remote' | 'downloading' | 'local' | 'error'

/** 每篇论文的 pack 跟踪状态 */
export interface TrackedPaperPack {
  /** 本地上行基线：path → 块引用 */
  files: Record<string, TrackedPaperPackFile>
  /** 远端下行 manifest（懒下载依据）；本地与远端一致后为 null */
  remoteManifest: PaperPackManifest | null
  downloadState: PaperPackDownloadState
}

/** tracker 文件结构 */
export interface PaperSyncTrackerData {
  schemaVersion: 1
  keys: Record<string, TrackedPaperKeyEntry>
  tombstones: Record<string, PaperTombstoneEntry>
  packs: Record<string, TrackedPaperPack>
  lastSyncAt: string | null
}

function emptyData(): PaperSyncTrackerData {
  return { schemaVersion: 1, keys: {}, tombstones: {}, packs: {}, lastSyncAt: null }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const DOWNLOAD_STATES = new Set(['remote', 'downloading', 'local', 'error'])

function isTrackerData(value: unknown): value is PaperSyncTrackerData {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== 1) return false
  if (!(value.lastSyncAt === null || typeof value.lastSyncAt === 'string')) return false
  if (!isRecord(value.keys) || !isRecord(value.tombstones) || !isRecord(value.packs)) return false
  for (const entry of Object.values(value.keys)) {
    if (!isRecord(entry)) return false
    if (!Number.isSafeInteger(entry.version) || typeof entry.contentHash !== 'string') return false
  }
  for (const entry of Object.values(value.tombstones)) {
    if (!isRecord(entry) || typeof entry.deletedAt !== 'string') return false
  }
  for (const pack of Object.values(value.packs)) {
    if (!isRecord(pack) || !isRecord(pack.files)) return false
    if (typeof pack.downloadState !== 'string' || !DOWNLOAD_STATES.has(pack.downloadState)) {
      return false
    }
    if (!(pack.remoteManifest === null || isRecord(pack.remoteManifest))) return false
    for (const file of Object.values(pack.files)) {
      if (!isRecord(file)) return false
      if (!Number.isSafeInteger(file.size) || typeof file.mtime !== 'string') return false
      if (typeof file.sha256 !== 'string' || !Array.isArray(file.blockIds)) return false
    }
  }
  return true
}

export class PaperSyncTracker {
  private readonly filePath: string
  private data: PaperSyncTrackerData | null = null

  constructor(filePath: string = getPaperSyncTrackerFilePath()) {
    this.filePath = filePath
  }

  getData(): PaperSyncTrackerData {
    if (this.data) return this.data
    if (!existsSync(this.filePath)) {
      this.data = emptyData()
      return this.data
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      this.data = isTrackerData(parsed) ? parsed : emptyData()
    } catch (error) {
      logger.warn('paper 同步 tracker 损坏，已重置', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      this.data = emptyData()
    }
    return this.data
  }

  setKey(key: string, entry: TrackedPaperKeyEntry): void {
    this.getData().keys[key] = entry
  }

  removeKey(key: string): void {
    delete this.getData().keys[key]
  }

  setTombstone(key: string, deletedAt: string): void {
    this.getData().tombstones[key] = { deletedAt }
  }

  getTombstone(key: string): PaperTombstoneEntry | null {
    return this.getData().tombstones[key] ?? null
  }

  pruneTombstones(nowMs: number = Date.now()): void {
    const tombstones = this.getData().tombstones
    for (const [key, entry] of Object.entries(tombstones)) {
      const deletedAtMs = Date.parse(entry.deletedAt)
      if (Number.isNaN(deletedAtMs) || nowMs - deletedAtMs > TOMBSTONE_TTL_MS) {
        delete tombstones[key]
      }
    }
  }

  setPack(paperId: string, pack: TrackedPaperPack): void {
    this.getData().packs[paperId] = pack
  }

  getPack(paperId: string): TrackedPaperPack | null {
    return this.getData().packs[paperId] ?? null
  }

  removePack(paperId: string): void {
    delete this.getData().packs[paperId]
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
      logger.error('写入 paper 同步 tracker 失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }
}
