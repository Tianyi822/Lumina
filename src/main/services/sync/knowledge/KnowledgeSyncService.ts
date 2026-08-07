/**
 * knowledge 同步编排引擎：扫描本地 knowledge/ 目录，三向 diff，
 * 下行按 key 类型分发（bases/metadata 合并落盘、file 写入），上行 CAS。
 * 向量库不同步——下行后对无向量库的 KB 触发 reindex 重建。
 *
 * 原则：引擎是旁观者——下行只走 KnowledgeServiceManager/FileService 的 applySynced* 方法。
 */
import { readFile, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { logger } from '@main/services/logger'
import {
  KNOWLEDGE_BASES_FILE_NAME,
  FILES_METADATA_FILE_NAME,
  KNOWLEDGE_DATA_DIR_NAME,
  KNOWLEDGE_FILES_DIR_NAME
} from '@main/services/knowledge/knowledgePaths'
import type { KnowledgeBase, FileItem } from '@shared/types/knowledge'
import type { KnowledgeSyncResult, KnowledgeSyncState, SyncResult } from '@shared/types/sync'
import type { SyncService } from '../SyncService'
import { casPutWithMerge } from '../casRetry'
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
  /** knowledge 数据目录（生产注入 configPaths.getKnowledgeDirPath，测试注入 tmpdir） */
  knowledgeDirProvider: () => string
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
    this.knowledgeDir = deps.knowledgeDirProvider
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    this.eventDebounceMs = deps.eventDebounceMs ?? DEFAULT_EVENT_DEBOUNCE_MS
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
    if (Date.now() < this.rateLimitedUntil) {
      return { success: false, code: 'rate_limited', error: '同步请求被限流，请稍后重试' }
    }
    this.kickoff()
    if (this.chain) await this.chain
    const last = this.state.lastResult
    if (this.state.phase === 'error') {
      return {
        success: false,
        code: Date.now() < this.rateLimitedUntil ? 'rate_limited' : 'unknown_error',
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

  /**
   * 解析 file.filePath 到存储目录内的绝对路径（防路径注入）：
   * `..` 逃逸或指向目录外的绝对路径返回 null，调用方直接跳过该文件。
   */
  private resolveFileStoragePath(filePath: string): string | null {
    const base = resolve(this.filesStoragePath())
    const resolved = resolve(base, filePath)
    if (resolved === base || !resolved.startsWith(base + sep)) return null
    return resolved
  }

  private async scanLocal(): Promise<Map<string, LocalFile>> {
    const files = new Map<string, LocalFile>()

    // knowledge-bases.json
    await this.addFile(files, this.basesPath(), makeBasesKey())
    // files-metadata.json
    await this.addFile(files, this.metadataPath(), makeMetadataKey())

    // data/files/ 仅 uploaded 类型
    this.scannedFileItems = []
    let fmBytes: Buffer
    try {
      fmBytes = await readFile(this.metadataPath())
    } catch (error) {
      // 无 metadata 文件视为没有任何数据文件；其他读错误中止本轮，
      // 避免误判缺失导致 phase (a) 误删远端
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return files
      throw error
    }
    let fileItems: unknown
    try {
      fileItems = JSON.parse(fmBytes.toString('utf-8'))
    } catch {
      throw new Error('files-metadata.json 解析失败，中止本轮同步（避免误判文件缺失而删除远端）')
    }
    if (!Array.isArray(fileItems)) {
      throw new Error('files-metadata.json 内容非法（非数组），中止本轮同步')
    }
    this.scannedFileItems = fileItems as FileItem[]
    for (const file of this.scannedFileItems) {
      if (file.sourceKind !== 'uploaded') continue
      // 不合法 filePath（路径注入嫌疑）直接跳过
      const fullPath = this.resolveFileStoragePath(file.filePath)
      if (!fullPath) continue
      await this.addFile(files, fullPath, makeFileKey(file.id))
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
    } catch (error) {
      // 文件不存在视为缺失（正常：未创建或已删除）；
      // 其他读错误（EACCES/EISDIR 等）中止本轮，避免误判缺失导致 phase (a) 删除远端
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
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

      // 单 key 内容非法（如 JSON 损坏）只记错误，不阻塞整轮其他 key
      let downloadOutcome: 'downloaded' | 'ignored'
      try {
        downloadOutcome = await this.applyRemoteFile(parsed, plainBytes, reindexNeeded)
      } catch (error) {
        result.errors.push({
          key,
          message: `内容应用失败：${error instanceof Error ? error.message : String(error)}`
        })
        continue
      }
      if (downloadOutcome !== 'downloaded') continue

      // tracker 记录远端版本的内容 hash（而非本地合并结果），
      // 使 phase (d) 能识别"本地合并产物 ≠ 远端版本内容"并把并集上行
      tracker.setKey(key, {
        version: dl.data.version ?? remoteVersion,
        contentHash: sha256Hex(plainBytes)
      })
      // 本地落盘内容已被下行改写，刷新扫描快照，避免 phase (d) 用合并前旧字节覆盖远端
      const fresh = await this.readLocalEntry(parsed)
      if (fresh) {
        localMap.set(key, fresh)
      } else {
        localMap.delete(key)
      }
      result.downloaded++
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
      // applySyncedFileDeletion 重写了 files-metadata.json，刷新扫描快照让本轮即可上行最新 metadata
      const refreshedMeta = await this.readLocalEntry({ kind: 'metadata' })
      if (refreshedMeta) localMap.set(makeMetadataKey(), refreshedMeta)
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
        // 优先用 scanLocal 解析出的 file 元数据；未命中回退 storage 实时读取
        // （同一轮内 metadata 先于 file 下行时，scannedFileItems 是阶段 0 的旧快照）
        let fileItem = this.scannedFileItems.find((f) => f.id === fileId)
        if (!fileItem) {
          const metadata = this._deps.fileStorage.readFilesMetadataForSync()
          fileItem = metadata.find((f) => f.id === fileId)
        }
        if (!fileItem) return 'ignored' // metadata 未到，下轮重试

        const applyResult = await this._deps.fileStorage.applySyncedFileContent(fileId, bytes)
        if (!applyResult.success) return 'ignored'
        return 'downloaded'
      }
    }
  }

  /** 解析 key 对应的本地磁盘路径（file 类查 metadata 得 filePath，含防注入校验） */
  private resolveLocalPath(parsed: ParsedKnowledgeKey): string | null {
    switch (parsed.kind) {
      case 'bases':
        return this.basesPath()
      case 'metadata':
        return this.metadataPath()
      case 'file': {
        let file = this.scannedFileItems.find((f) => f.id === parsed.fileId)
        if (!file) {
          const metadata = this._deps.fileStorage.readFilesMetadataForSync()
          file = metadata.find((f) => f.id === parsed.fileId)
        }
        return file ? this.resolveFileStoragePath(file.filePath) : null
      }
    }
  }

  /** 重读 key 当前的本地磁盘内容（下行落盘后刷新扫描快照用）；读不到返回 null */
  private async readLocalEntry(parsed: ParsedKnowledgeKey): Promise<LocalFile | null> {
    const path = this.resolveLocalPath(parsed)
    if (!path) return null
    try {
      const bytes = new Uint8Array(await readFile(path))
      const st = await stat(path)
      return { bytes, hash: sha256Hex(bytes), mtime: st.mtime.toISOString() }
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
    const parsed = parseKnowledgeKey(key)
    let currentBytes = bytes

    const outcome = await casPutWithMerge({
      initialBytes: bytes,
      initialBase: baseVersion,
      putFn: async (b, base) => client.putSessionFile(key, base, sealKnowledgeFile(dek, b)),
      onConflict: async () => {
        // 409：拉最新 → 按 key 类型 merge → 落盘 → 重读
        const latest = await client.getSessionFile(key)
        if (!latest.success || !latest.data) {
          return { resolved: 'failed', error: '冲突后拉取失败' }
        }
        const nextBase = latest.data.version ?? 0

        // file 类型为二进制内容寻址，无字段级 merge，本地优先（保留 currentBytes）
        if (!parsed || parsed.kind === 'file') {
          return { resolved: 'rebased', bytes: currentBytes, nextBase }
        }

        // bases/metadata：解密远端 → 与本地 merge → 落盘 → 重读
        let remoteBytes: Uint8Array
        try {
          remoteBytes = openKnowledgeFile(dek, latest.data.bytes)
        } catch {
          return { resolved: 'failed', error: '冲突合并解密失败' }
        }
        try {
          if (parsed.kind === 'bases') {
            const remoteBases = JSON.parse(new TextDecoder().decode(remoteBytes)) as KnowledgeBase[]
            const localBases = await this._deps.knowledgeStorage.readKnowledgeBasesForSync()
            const merge = mergeKnowledgeBases({ local: localBases, remote: remoteBases })
            if (merge.changed) {
              const applyResult = await this._deps.knowledgeStorage.applySyncedKnowledgeBases(
                merge.merged
              )
              if (!applyResult.success) {
                return { resolved: 'failed', error: '冲突合并落盘失败' }
              }
              for (const kb of merge.merged) {
                if (
                  kb.indexInvalidation?.needsReindex ||
                  !this._deps.knowledgeManager.vectorDBExists(kb.id)
                ) {
                  this._deps.knowledgeManager.reindexKnowledgeBase(kb.id)
                }
              }
            }
          } else {
            // metadata
            const remoteFiles = JSON.parse(new TextDecoder().decode(remoteBytes)) as FileItem[]
            const localFiles = this._deps.fileStorage.readFilesMetadataForSync()
            const merge = mergeFileItems({ local: localFiles, remote: remoteFiles })
            if (merge.changed) {
              const applyResult = await this._deps.fileStorage.applySyncedFilesMetadata(
                merge.merged
              )
              if (!applyResult.success) {
                return { resolved: 'failed', error: '冲突合并落盘失败' }
              }
            }
          }
        } catch {
          return { resolved: 'failed', error: '冲突合并 JSON 解析失败' }
        }

        // 重读本地合并后产物
        const reread = await this.readLocalEntry(parsed)
        if (!reread) {
          return { resolved: 'failed', error: '冲突合并后重读本地失败' }
        }
        currentBytes = reread.bytes
        return { resolved: 'rebased', bytes: reread.bytes, nextBase }
      }
    })

    if (outcome.ok) {
      // 合并后落盘字节可能变化（如路径归一化），用实际落盘 hash 校正 contentHash
      const finalHash = parsed && parsed.kind !== 'file' ? sha256Hex(currentBytes) : contentHash
      this._deps.tracker.setKey(key, { version: outcome.version, contentHash: finalHash })
      result.uploaded++
    } else {
      result.errors.push({ key, message: outcome.error })
    }
  }
}
