/**
 * knowledge 同步编排引擎：扫描本地 knowledge/ 目录，三向 diff，
 * 下行按 key 类型分发（bases/metadata 合并落盘、file 写入），上行 CAS。
 * 向量库不同步——下行后对无向量库的 KB 触发 reindex 重建。
 *
 * 原则：引擎是旁观者——下行只走 KnowledgeServiceManager/FileService 的 applySynced* 方法。
 */
import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@main/services/logger'
import type { KnowledgeBase, FileItem } from '@shared/types/knowledge'
import type { KnowledgeSyncResult, KnowledgeSyncState, SyncResult } from '@shared/types/sync'
import type { SyncService } from '../SyncService'
import { sha256Hex } from '../crypto/hash'
import { sealKnowledgeFile, openKnowledgeFile } from './knowledgeSnapshotCrypto'
import { KnowledgeSyncTracker } from './knowledgeSyncTracker'
import { mergeKnowledgeBases, mergeFileItems } from './knowledgeMerge'
import {
  makeBasesKey,
  makeMetadataKey,
  makeFileKey,
  isKnowledgeKey,
  parseKnowledgeKey,
  type ParsedKnowledgeKey
} from './knowledgeSyncKeys'

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_EVENT_DEBOUNCE_MS = 2_000
const CAS_RETRY_LIMIT = 2

const KNOWLEDGE_BASES_FILE_NAME = 'knowledge-bases.json'
const FILES_METADATA_FILE_NAME = 'files-metadata.json'
const KNOWLEDGE_DATA_DIR_NAME = 'data'
const KNOWLEDGE_FILES_DIR_NAME = 'files'

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type KnowledgeStorageLike = {
  readKnowledgeBasesForSync(): Promise<KnowledgeBase[]>
  applySyncedKnowledgeBases(merged: KnowledgeBase[]): Promise<{ success: boolean; error?: string }>
}
type FileStorageLike = {
  readFilesMetadataForSync(): FileItem[]
  applySyncedFilesMetadata(merged: FileItem[]): Promise<{ success: boolean; error?: string }>
  applySyncedFileDeletion(fileId: string): Promise<{ success: boolean; error?: string }>
  applySyncedFileContent(
    fileId: string,
    bytes: Uint8Array
  ): Promise<{ success: boolean; error?: string }>
}
type KnowledgeManagerLike = {
  reindexKnowledgeBase(kbId: string): Promise<void>
  vectorDBExists(kbId: string): boolean
}

export interface KnowledgeSyncServiceDeps {
  syncService: SyncServiceLike
  knowledgeStorage: KnowledgeStorageLike
  fileStorage: FileStorageLike
  knowledgeManager: KnowledgeManagerLike
  tracker: KnowledgeSyncTracker
  broadcast: (state: KnowledgeSyncState) => void
  knowledgeDirProvider?: () => string
  intervalMs?: number
  eventDebounceMs?: number
}

interface LocalFile {
  bytes: Uint8Array
  hash: string
  mtime: string
}

function emptyResult(): KnowledgeSyncResult {
  return {
    uploaded: 0,
    downloaded: 0,
    deletedLocal: 0,
    deletedRemote: 0,
    reindexed: 0,
    skipped: 0,
    errors: []
  }
}

export class KnowledgeSyncService {
  /** 测试访问内部依赖用（命名以 _ 前缀表示内部约定） */
  readonly _deps: KnowledgeSyncServiceDeps
  private readonly knowledgeDir: () => string
  private readonly intervalMs: number
  private readonly eventDebounceMs: number

  private state: KnowledgeSyncState = {
    phase: 'idle',
    lastSyncAt: null,
    lastResult: null,
    lastError: null
  }
  private timer: ReturnType<typeof setInterval> | null = null
  private eventTimer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> | null = null
  private queued = false
  private rateLimitedUntil = 0
  /** 本轮 scanLocal 解析出的 file 元数据缓存（applyRemoteFile 'file' 用于查 filePath） */
  private scannedFileItems: FileItem[] = []

  constructor(deps: KnowledgeSyncServiceDeps) {
    this._deps = deps
    this.knowledgeDir =
      deps.knowledgeDirProvider ?? (() => join(this.getHomeDir(), '.lumina', 'knowledge'))
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    this.eventDebounceMs = deps.eventDebounceMs ?? DEFAULT_EVENT_DEBOUNCE_MS
  }

  private getHomeDir(): string {
    // 简化：实际用 configPaths 的 getConfigDirPath
    return process.env.HOME || process.env.USERPROFILE || ''
  }

  getState(): KnowledgeSyncState {
    return this.state
  }

  start(): void {
    if (this.timer || !this.isConnected()) return
    this.timer = setInterval(() => this.kickoff(), this.intervalMs)
    this.timer.unref()
    this.kickoff()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.eventTimer) {
      clearTimeout(this.eventTimer)
      this.eventTimer = null
    }
  }

  kickoff(): void {
    if (!this.isConnected()) return
    if (Date.now() < this.rateLimitedUntil) return
    this.queued = true
    if (!this.chain) this.chain = this.drain()
  }

  handleKnowledgeFileEvent(): void {
    if (this.eventTimer) clearTimeout(this.eventTimer)
    this.eventTimer = setTimeout(() => {
      this.eventTimer = null
      this.kickoff()
    }, this.eventDebounceMs)
  }

  async syncNow(): Promise<SyncResult<KnowledgeSyncResult>> {
    if (!this.isConnected())
      return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    this.kickoff()
    if (this.chain) await this.chain
    const last = this.state.lastResult
    if (this.state.phase === 'error') {
      return {
        success: false,
        code: 'unknown_error',
        error: this.state.lastError ?? '知识库同步失败',
        data: last ?? undefined
      }
    }
    return { success: true, data: last ?? emptyResult() }
  }

  private isConnected(): boolean {
    return this._deps.syncService.getStatus().connected
  }

  private setState(patch: Partial<KnowledgeSyncState>): void {
    this.state = { ...this.state, ...patch }
    this._deps.broadcast(this.state)
  }

  private async drain(): Promise<void> {
    try {
      while (this.queued) {
        this.queued = false
        await this.runOnce()
      }
    } finally {
      this.chain = null
    }
  }

  private async runOnce(): Promise<void> {
    this.setState({ phase: 'running' })
    try {
      const result = await this.runSync()
      const failed = result.errors.length > 0
      this.setState({
        phase: failed ? 'error' : 'idle',
        lastSyncAt: new Date().toISOString(),
        lastResult: result,
        lastError: failed ? `${result.errors.length} 项知识库同步失败` : null
      })
      logger.info('知识库同步完成', 'main', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
        deletedLocal: result.deletedLocal,
        deletedRemote: result.deletedRemote,
        reindexed: result.reindexed,
        skipped: result.skipped,
        errors: result.errors.length
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ phase: 'error', lastError: message })
      logger.error('知识库同步整轮失败', 'main', { error: message })
    }
  }

  /** knowledge-bases.json 路径（解析到注入的 knowledgeDir） */
  private basesPath(): string {
    return join(this.knowledgeDir(), KNOWLEDGE_BASES_FILE_NAME)
  }

  /** files-metadata.json 路径（解析到注入的 knowledgeDir） */
  private metadataPath(): string {
    return join(this.knowledgeDir(), FILES_METADATA_FILE_NAME)
  }

  /** data/files/ 存储目录路径 */
  private filesStoragePath(): string {
    return join(this.knowledgeDir(), KNOWLEDGE_DATA_DIR_NAME, KNOWLEDGE_FILES_DIR_NAME)
  }

  private async scanLocal(): Promise<Map<string, LocalFile>> {
    const files = new Map<string, LocalFile>()

    // knowledge-bases.json
    await this.addFile(files, this.basesPath(), makeBasesKey())
    // files-metadata.json
    await this.addFile(files, this.metadataPath(), makeMetadataKey())

    // data/files/ 仅 uploaded 类型
    let fmBytes: Buffer | null = null
    try {
      fmBytes = await readFile(this.metadataPath())
    } catch {
      /* 无文件 */
    }
    if (fmBytes) {
      try {
        const fileItems = JSON.parse(fmBytes.toString('utf-8')) as FileItem[]
        this.scannedFileItems = Array.isArray(fileItems) ? fileItems : []
        const storagePath = this.filesStoragePath()
        for (const file of this.scannedFileItems) {
          if (file.sourceKind !== 'uploaded') continue
          const fullPath = join(storagePath, file.filePath)
          if (!existsSync(fullPath)) continue
          await this.addFile(files, fullPath, makeFileKey(file.id))
        }
      } catch {
        /* metadata 解析失败跳过 */
      }
    }
    return files
  }

  private async addFile(
    files: Map<string, LocalFile>,
    fullPath: string,
    key: string
  ): Promise<void> {
    try {
      const bytes = new Uint8Array(await readFile(fullPath))
      const st = await stat(fullPath)
      files.set(key, { bytes, hash: sha256Hex(bytes), mtime: st.mtime.toISOString() })
    } catch {
      /* 文件不存在跳过 */
    }
  }

  private async runSync(): Promise<KnowledgeSyncResult> {
    const result = emptyResult()
    if (!this.isConnected()) return result
    const dek = this._deps.syncService.getDataKey()
    const client = this._deps.syncService.getClient()
    if (!dek || !client) return result

    const tracker = this._deps.tracker
    tracker.pruneTombstones()
    const trackedKeys = tracker.getData().keys

    // 阶段 0:扫描
    const localMap = await this.scanLocal()

    // 阶段 1:拉远端列表
    const remoteList = await client.listSessionFiles()
    if (!remoteList.success || !remoteList.data) {
      if (remoteList.code === 'rate_limited') {
        const retryAfterMs =
          typeof remoteList.extra?.retryAfterMs === 'number'
            ? remoteList.extra.retryAfterMs
            : this.intervalMs
        this.rateLimitedUntil = Date.now() + retryAfterMs
      }
      throw new Error(
        `拉取 session-files 列表失败：${remoteList.error ?? remoteList.code ?? '未知错误'}`
      )
    }
    const remoteMap = new Map(
      remoteList.data.sessions
        .filter((s) => isKnowledgeKey(s.sessionId))
        .map((s) => [s.sessionId, s.version])
    )

    // (a) 本地上行删除
    for (const key of Object.keys(trackedKeys)) {
      if (localMap.has(key)) continue
      const remoteVersion = remoteMap.get(key)
      if (remoteVersion === undefined) {
        tracker.removeKey(key)
        continue
      }
      const del = await client.deleteSessionFile(key, remoteVersion)
      if (del.success || del.code === 'session_file_not_found') {
        tracker.removeKey(key)
        tracker.setTombstone(key, new Date().toISOString())
        if (del.success && del.data?.deleted) result.deletedRemote++
      } else {
        result.errors.push({ key, message: `删除远端失败：${del.error ?? del.code}` })
      }
    }

    // (b) 下行
    const reindexNeeded = new Set<string>()
    for (const [key, remoteVersion] of remoteMap) {
      if (tracker.getTombstone(key)) continue
      const tracked = trackedKeys[key]
      if (!(!tracked || remoteVersion > tracked.version)) continue

      const dl = await client.getSessionFile(key)
      if (!dl.success || !dl.data) {
        if (dl.code !== 'session_file_not_found')
          result.errors.push({ key, message: `下载失败：${dl.error ?? dl.code}` })
        continue
      }

      let plainBytes: Uint8Array
      try {
        plainBytes = openKnowledgeFile(dek, dl.data.bytes)
      } catch {
        result.errors.push({ key, message: '解密失败' })
        continue
      }

      const parsed = parseKnowledgeKey(key)
      if (!parsed) {
        result.errors.push({ key, message: 'key 解析失败' })
        continue
      }

      const downloadOutcome = await this.applyRemoteFile(parsed, plainBytes, reindexNeeded)
      if (downloadOutcome === 'downloaded') {
        const reread = await this.rereadLocalFile(parsed)
        tracker.setKey(key, {
          version: dl.data.version ?? remoteVersion,
          contentHash: reread ?? sha256Hex(plainBytes)
        })
        result.downloaded++
      }
    }

    // (c) 远端删除 → 本地删除
    for (const [key, tracked] of Object.entries(trackedKeys)) {
      if (remoteMap.has(key)) continue
      const local = localMap.get(key)
      if (!local) continue
      if (local.hash !== tracked.contentHash) continue

      const parsed = parseKnowledgeKey(key)
      if (!parsed || parsed.kind !== 'file') continue
      const del = await this._deps.fileStorage.applySyncedFileDeletion(parsed.fileId)
      if (!del.success) {
        result.errors.push({ key, message: `本地删除失败：${del.error ?? '未知'}` })
        continue
      }
      tracker.removeKey(key)
      localMap.delete(key)
      result.deletedLocal++
    }

    // (d) 上行 dirty
    for (const [key, local] of localMap) {
      const tracked = trackedKeys[key]
      const dirty = !tracked || local.hash !== tracked.contentHash
      if (!dirty) {
        result.skipped++
        continue
      }
      await this.uploadFile(
        client,
        dek,
        key,
        local.bytes,
        tracked?.version ?? 0,
        result,
        local.hash
      )
    }

    // 向量库重建（异步）
    for (const kbId of reindexNeeded) {
      void this._deps.knowledgeManager.reindexKnowledgeBase(kbId)
      result.reindexed++
    }

    tracker.setLastSyncAt(new Date().toISOString())
    tracker.save()
    return result
  }

  private async applyRemoteFile(
    parsed: ParsedKnowledgeKey,
    bytes: Uint8Array,
    reindexNeeded: Set<string>
  ): Promise<'downloaded' | 'ignored'> {
    switch (parsed.kind) {
      case 'bases': {
        const remoteBases = JSON.parse(new TextDecoder().decode(bytes)) as KnowledgeBase[]
        const localBases = await this._deps.knowledgeStorage.readKnowledgeBasesForSync()
        const merge = mergeKnowledgeBases({ local: localBases, remote: remoteBases })
        if (merge.changed) {
          const applyResult = await this._deps.knowledgeStorage.applySyncedKnowledgeBases(
            merge.merged
          )
          if (!applyResult.success) return 'ignored'
          for (const kb of merge.merged) {
            if (
              kb.indexInvalidation?.needsReindex ||
              !this._deps.knowledgeManager.vectorDBExists(kb.id)
            ) {
              reindexNeeded.add(kb.id)
            }
          }
        }
        return 'downloaded'
      }
      case 'metadata': {
        const remoteFiles = JSON.parse(new TextDecoder().decode(bytes)) as FileItem[]
        const localFiles = this._deps.fileStorage.readFilesMetadataForSync()
        const merge = mergeFileItems({ local: localFiles, remote: remoteFiles })
        if (merge.changed) {
          const applyResult = await this._deps.fileStorage.applySyncedFilesMetadata(merge.merged)
          if (!applyResult.success) return 'ignored'
        }
        return 'downloaded'
      }
      case 'file': {
        const fileId = parsed.fileId
        // 优先用 scanLocal 解析出的 file 元数据（保证本轮 scan 看到的 file 一定可落盘），
        // 否则回退到 storage 的实时读取（下行先于 metadata 的边缘场景）
        let fileItem = this.scannedFileItems.find((f) => f.id === fileId)
        if (!fileItem) {
          const metadata = this._deps.fileStorage.readFilesMetadataForSync()
          fileItem = metadata.find((f) => f.id === fileId)
        }
        if (!fileItem) return 'ignored' // metadata 未到，下轮重试

        // 兜底：若 storage 内存尚未持有该 file（启动未从磁盘加载、或本端先上行未走 apply），
        // 先把本轮扫描到的 metadata 通过 applySyncedFilesMetadata 回填，保证 applySyncedFileContent 可解析 filePath。
        // 遵循旁观者原则：仅走 applySynced* 方法。
        const storageFiles = this._deps.fileStorage.readFilesMetadataForSync()
        if (!storageFiles.some((f) => f.id === fileId) && this.scannedFileItems.length > 0) {
          const merge = mergeFileItems({ local: storageFiles, remote: this.scannedFileItems })
          if (merge.changed) {
            const meta = await this._deps.fileStorage.applySyncedFilesMetadata(merge.merged)
            if (!meta.success) return 'ignored'
          }
        }

        const applyResult = await this._deps.fileStorage.applySyncedFileContent(fileId, bytes)
        if (!applyResult.success) return 'ignored'
        return 'downloaded'
      }
    }
  }

  private async rereadLocalFile(parsed: ParsedKnowledgeKey): Promise<string | null> {
    let path: string | null = null
    switch (parsed.kind) {
      case 'bases':
        path = this.basesPath()
        break
      case 'metadata':
        path = this.metadataPath()
        break
      case 'file': {
        let file = this.scannedFileItems.find((f) => f.id === parsed.fileId)
        if (!file) {
          const metadata = this._deps.fileStorage.readFilesMetadataForSync()
          file = metadata.find((f) => f.id === parsed.fileId)
        }
        if (file) path = join(this.filesStoragePath(), file.filePath)
        break
      }
    }
    if (!path) return null
    try {
      const bytes = await readFile(path)
      return sha256Hex(new Uint8Array(bytes))
    } catch {
      return null
    }
  }

  private async uploadFile(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    key: string,
    bytes: Uint8Array,
    baseVersion: number,
    result: KnowledgeSyncResult,
    contentHash: string
  ): Promise<void> {
    const currentBytes = bytes
    let base = baseVersion
    for (let attempt = 0; attempt <= CAS_RETRY_LIMIT; attempt++) {
      const ct = sealKnowledgeFile(dek, currentBytes)
      const put = await client.putSessionFile(key, base, ct)
      if (put.success && put.data) {
        this._deps.tracker.setKey(key, { version: put.data.version, contentHash })
        result.uploaded++
        return
      }
      if (put.code !== 'stale_session_file') {
        result.errors.push({ key, message: `上传失败：${put.error ?? put.code}` })
        return
      }
      // 409：拉最新重试
      const latest = await client.getSessionFile(key)
      if (!latest.success || !latest.data) {
        result.errors.push({ key, message: '冲突后拉取失败' })
        return
      }
      // knowledge 元数据不做字段级合并，本地优先
      base = latest.data.version ?? base + 1
    }
    result.errors.push({ key, message: '版本冲突重试耗尽' })
  }
}
