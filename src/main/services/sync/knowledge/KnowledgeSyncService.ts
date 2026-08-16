/**
 * knowledge 同步编排引擎：扫描本地 knowledge/ 目录，三向 diff，
 * 下行按 key 类型分发（bases/metadata 合并落盘、file-manifest 拉块重组落盘），
 * 上行 bases/metadata 走 session-files CAS、file 走 Manifest+blocks 分块。
 * 向量库不同步——下行后对无向量库的 KB 触发 reindex 重建。
 *
 * 原则：引擎是旁观者——下行只走 KnowledgeServiceManager/FileService 的 applySynced* 方法。
 *
 * file 通道迁移：knowledge-file-* 不再走 session-files（4MiB 上限），改为
 * knowledge-file-manifest-{id}（块清单，走 session-files）+ /blocks（文件内容切块），
 * 参照 paper pack 模式。旧 knowledge-file-{id} 在迁移期检测到即删除。
 */
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import { logger } from '@main/services/logger'
import {
  KNOWLEDGE_BASES_FILE_NAME,
  FILES_METADATA_FILE_NAME,
  KNOWLEDGE_DATA_DIR_NAME,
  KNOWLEDGE_FILES_DIR_NAME
} from '@main/services/knowledge/knowledgePaths'
import type { KnowledgeBase, FileItem } from '@shared/types/knowledge'
import type {
  KnowledgeFileManifest,
  KnowledgeSyncResult,
  KnowledgeSyncState,
  SyncResult
} from '@shared/types/sync'
import type { SyncService } from '../SyncService'
import { casPutWithMerge } from '../casRetry'
import { sha256Hex } from '../crypto/hash'
import { chunkFile } from '../shared/chunkFile'
import { resetTrackerIfAccountChanged } from '../shared/trackerAccountScope'
import {
  sealKnowledgeFile,
  openKnowledgeFile,
  sealKnowledgeBlock,
  openKnowledgeBlock,
  sealKnowledgeManifest,
  openKnowledgeManifest
} from './knowledgeSnapshotCrypto'
import { KnowledgeSyncTracker, type TrackedKnowledgeKeyEntry } from './knowledgeSyncTracker'
import { mergeKnowledgeBases, mergeFileItems } from './knowledgeMerge'
import {
  makeBasesKey,
  makeMetadataKey,
  makeFileKey,
  makeFileManifestKey,
  isKnowledgeKey,
  parseKnowledgeKey,
  type ParsedKnowledgeKey
} from './knowledgeSyncKeys'

/** session-files 通道的密文上限（对齐 relay maxSessionFileBytes） */
const MAX_SESSION_FILE_BYTES = 4 * 1024 * 1024
/** session-files 密文开销（XChaCha20-Poly1305：nonce24 + tag16） */
const CIPHER_OVERHEAD_BYTES = 40
/** manifest CAS 重试上限（与 paper pack 一致） */
const MANIFEST_CAS_RETRY_LIMIT = 2

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

/** 本地文件条目（file-manifest 路径专用：只记元数据，不读内容进内存，按需流式切块） */
interface LocalFileEntry {
  fileId: string
  absPath: string
  size: number
  mtime: string
}

/** 扫描结果：小 JSON（bases/metadata）入 localMap；文件入 localFiles（不读内容） */
interface ScanResult {
  localMap: Map<string, LocalFile>
  localFiles: Map<string, LocalFileEntry>
}

function emptyResult(): KnowledgeSyncResult {
  return {
    uploaded: 0,
    downloaded: 0,
    deletedLocal: 0,
    deletedRemote: 0,
    reindexed: 0,
    blocksUploaded: 0,
    blocksDownloaded: 0,
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
        blocksUploaded: result.blocksUploaded,
        blocksDownloaded: result.blocksDownloaded,
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

  private async scanLocal(): Promise<ScanResult> {
    const localMap = new Map<string, LocalFile>()
    const localFiles = new Map<string, LocalFileEntry>()

    // knowledge-bases.json
    await this.addFile(localMap, this.basesPath(), makeBasesKey())
    // files-metadata.json
    await this.addFile(localMap, this.metadataPath(), makeMetadataKey())

    // data/files/ 仅 uploaded 类型
    this.scannedFileItems = []
    let fmBytes: Buffer
    try {
      fmBytes = await readFile(this.metadataPath())
    } catch (error) {
      // 无 metadata 文件视为没有任何数据文件；其他读错误中止本轮，
      // 避免误判缺失导致 phase (a) 误删远端
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { localMap, localFiles }
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
      // file 走 Manifest+blocks 通道：只记元数据，不读内容进内存（支持大文件流式切块）
      try {
        const st = await stat(fullPath)
        localFiles.set(makeFileManifestKey(file.id), {
          fileId: file.id,
          absPath: fullPath,
          size: st.size,
          mtime: st.mtime.toISOString()
        })
      } catch (error) {
        // 文件不存在视为缺失（正常：未创建或已删除）；其他读错误中止本轮
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
    }
    return { localMap, localFiles }
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
    resetTrackerIfAccountChanged('知识库', tracker, this._deps.syncService.getStatus().accountId)
    tracker.pruneTombstones()
    const trackedKeys = tracker.getData().keys

    // 阶段 0:扫描（bases/metadata 入 localMap，文件入 localFiles）
    const { localMap, localFiles } = await this.scanLocal()

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

    // (a) 本地上行删除：tracked key 本地已无对应内容 → 删远端
    //     含三类：bases/metadata（localMap）、file-manifest（localFiles）、旧 file key（迁移）
    for (const key of Object.keys(trackedKeys)) {
      const parsed = parseKnowledgeKey(key)
      // file-manifest key 用 localFiles 判断是否存在
      const exists = parsed?.kind === 'file-manifest' ? localFiles.has(key) : localMap.has(key)
      if (exists) continue
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

      const parsed = parseKnowledgeKey(key)
      if (!parsed) {
        result.errors.push({ key, message: 'key 解析失败' })
        continue
      }

      // 迁移：旧 knowledge-file-{id} 不再下载内容，直接删除转用 file-manifest 路径
      if (parsed.kind === 'file') {
        const del = await client.deleteSessionFile(key, remoteVersion)
        if (del.success || del.code === 'session_file_not_found') {
          tracker.setTombstone(key, new Date().toISOString())
          if (del.success && del.data?.deleted) result.deletedRemote++
        } else {
          result.errors.push({ key, message: `迁移删除旧 file key 失败：${del.error ?? del.code}` })
        }
        continue
      }

      // file-manifest：拉 manifest → 拉块重组 → 落盘
      if (parsed.kind === 'file-manifest') {
        await this.downloadFileBlocks(client, dek, parsed.fileId, key, remoteVersion, result)
        continue
      }

      // bases/metadata：解密 → 合并落盘
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
      const parsed = parseKnowledgeKey(key)
      if (!parsed) continue
      // file-manifest：查 localFiles，本地未修改则删本地文件
      if (parsed.kind === 'file-manifest') {
        const local = localFiles.get(key)
        if (!local) continue
        // 本地文件已被修改（mtime/size 与基线不同）则不删（保留本地修改）
        const baseline = tracked.fileBlocks
        if (!baseline) continue
        if (baseline.size !== local.size || baseline.mtime !== local.mtime) continue
        const del = await this._deps.fileStorage.applySyncedFileDeletion(parsed.fileId)
        if (!del.success) {
          result.errors.push({ key, message: `本地删除失败：${del.error ?? '未知'}` })
          continue
        }
        tracker.removeKey(key)
        localFiles.delete(key)
        result.deletedLocal++
        // applySyncedFileDeletion 重写了 files-metadata.json，刷新扫描快照让本轮即可上行最新 metadata
        const refreshedMeta = await this.readLocalEntry({ kind: 'metadata' })
        if (refreshedMeta) localMap.set(makeMetadataKey(), refreshedMeta)
        continue
      }
      // bases/metadata：远端删除时不删本地共享 JSON（bases/metadata 是多端合并的共享状态，
      // 远端删除只意味着对端退订，本地仍保留自己的副本并可能上行复活）。仅清理 tracker。
      // （旧 file kind 在 phase b 迁移删除，不在此处理）
    }

    // (d) 上行 dirty：bases/metadata 走 session-files CAS
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

    // (d) 上行 dirty：file 走 Manifest+blocks
    for (const [key, local] of localFiles) {
      await this.uploadFileBlocks(client, dek, key, local, result)
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
    // 仅 bases/metadata 经此路径：file/file-manifest 在 runSync 阶段 (b) 已分流处理
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
      default:
        // file / file-manifest 不经此路径（runSync 已分流）
        return 'ignored'
    }
  }

  /** 解析 key 对应的本地磁盘路径（bases/metadata 直接返回；file/file-manifest 不支持） */
  private resolveLocalPath(parsed: ParsedKnowledgeKey): string | null {
    switch (parsed.kind) {
      case 'bases':
        return this.basesPath()
      case 'metadata':
        return this.metadataPath()
      default:
        // file / file-manifest 走 Manifest+blocks，无需读整文件到 localMap
        return null
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

  /**
   * 上行文件块：diff（size+mtime 未变则复用 blockIds）→ chunkFile → sealKnowledgeBlock
   * → blocksMissing → putBlock → 构建 manifest → session-files CAS 上行 manifest。
   * 任一块失败则中止该文件 manifest 上行（已上传块内容寻址可复用，下轮重试）。
   * manifest 上行成功后，若远端存在旧 knowledge-file-{id}（迁移残留）则删除。
   */
  private async uploadFileBlocks(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    key: string,
    local: LocalFileEntry,
    result: KnowledgeSyncResult
  ): Promise<void> {
    const tracker = this._deps.tracker
    const tracked = tracker.getData().keys[key]
    const fileId = local.fileId

    // diff：size+mtime 未变且已有 blockIds 基线 → 复用，不重切块
    const baseline = tracked?.fileBlocks
    const unchanged =
      baseline &&
      baseline.size === local.size &&
      baseline.mtime === local.mtime &&
      baseline.blockIds.length > 0

    if (unchanged && baseline) {
      // manifest 指纹未变 → 检查是否需要上行 manifest（tracked.version 已存在则 skip）
      const manifestFingerprint = `${baseline.sha256}:${baseline.blockIds.join(',')}`
      if (tracked && tracked.contentHash === manifestFingerprint) {
        result.skipped++
        return
      }
      // 用基线 blockIds 构建 manifest（块已在 relay，无需重传）
      await this.putFileManifest(
        client,
        dek,
        key,
        fileId,
        baseline.size,
        baseline.sha256,
        baseline.blockIds,
        local.mtime,
        tracked,
        result
      )
      return
    }

    // 变了：切块加密上传
    const blockIds: string[] = []
    try {
      const chunkResult = await chunkFile(local.absPath, async (chunk) => {
        const { blockId, ciphertext } = sealKnowledgeBlock(dek, chunk)
        const missing = await client.blocksMissing([blockId])
        if (!missing.success || !missing.data) {
          throw new Error(`查询块缺失失败：${missing.error ?? missing.code ?? '未知错误'}`)
        }
        if (missing.data.missing.includes(blockId)) {
          const putBlock = await client.putBlock(blockId, ciphertext)
          // 失败必须抛错中止：否则 manifest 会引用 relay 上不存在的块
          if (!putBlock.success) {
            throw new Error(`块上传失败：${putBlock.error ?? putBlock.code ?? '未知错误'}`)
          }
          if (putBlock.data?.created) result.blocksUploaded++
        }
        blockIds.push(blockId)
      })
      // 切块+上传全部成功，构建并上行 manifest
      await this.putFileManifest(
        client,
        dek,
        key,
        fileId,
        chunkResult.size,
        chunkResult.sha256,
        blockIds,
        local.mtime,
        tracked,
        result
      )
    } catch (error) {
      result.errors.push({
        key,
        message: `文件切块/上传失败：${error instanceof Error ? error.message : String(error)}`
      })
    }
  }

  /** 构建 manifest → session-files CAS 上行；成功后更新 tracker + 迁移删旧 file key */
  private async putFileManifest(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    key: string,
    fileId: string,
    size: number,
    sha256: string,
    blockIds: string[],
    fileMtime: string,
    tracked: TrackedKnowledgeKeyEntry | undefined,
    result: KnowledgeSyncResult
  ): Promise<void> {
    const tracker = this._deps.tracker
    const manifest: KnowledgeFileManifest = {
      schemaVersion: 1,
      fileId,
      updatedAt: new Date().toISOString(),
      size,
      sha256,
      blockIds
    }
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest))
    if (manifestBytes.length + CIPHER_OVERHEAD_BYTES > MAX_SESSION_FILE_BYTES) {
      result.errors.push({ key, message: '文件块清单超过 4MiB 上限' })
      return
    }
    // manifest 内容指纹（忽略 updatedAt）
    const manifestFingerprint = `${sha256}:${blockIds.join(',')}`

    // CAS 上行（内容指纹 CAS，冲突只 rebase 重推，无字段级 merge——blockIds 内容寻址幂等）
    let base = tracked?.version ?? 0
    let putOk = false
    let putVersion = 0
    for (let attempt = 0; attempt <= MANIFEST_CAS_RETRY_LIMIT; attempt++) {
      const ct = sealKnowledgeManifest(dek, manifestBytes)
      const put = await client.putSessionFile(key, base, ct)
      if (put.success && put.data) {
        putOk = true
        putVersion = put.data.version
        break
      }
      if (put.code !== 'stale_session_file') {
        result.errors.push({
          key,
          message: `文件块清单上行失败：${put.error ?? put.code ?? '未知错误'}`
        })
        return
      }
      // stale：拉最新版本号 re-base 重推（manifest 是内容寻址 CAS，重推不丢数据）
      const latest = await client.getSessionFile(key)
      base = latest.data?.version ?? 0
    }
    if (!putOk) {
      result.errors.push({ key, message: '文件块清单版本冲突重试耗尽' })
      return
    }

    // 更新 tracker：version + contentHash（指纹）+ fileBlocks 基线（mtime 记录本地文件 mtime，
    // 供 phase (c) 判断"本地文件上传后是否被修改"）
    tracker.setKey(key, {
      version: putVersion,
      contentHash: manifestFingerprint,
      fileBlocks: { size, mtime: fileMtime, sha256, blockIds }
    })
    result.uploaded++

    // 迁移：若远端存在旧 knowledge-file-{id}（迁移残留）则删除
    const oldKey = makeFileKey(fileId)
    const oldVersion = (await client.listSessionFiles()).data?.sessions.find(
      (s) => s.sessionId === oldKey
    )?.version
    if (oldVersion !== undefined) {
      const del = await client.deleteSessionFile(oldKey, oldVersion)
      if (del.success || del.code === 'session_file_not_found') {
        tracker.setTombstone(oldKey, new Date().toISOString())
      }
    }
  }

  /**
   * 下行文件块：拉 manifest → 逐块 getBlock 解密 → 重组 → sha256 校验 → 落盘。
   * 某块失败或校验失败只记错误，不落盘（下轮重试）。
   */
  private async downloadFileBlocks(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    fileId: string,
    key: string,
    remoteVersion: number,
    result: KnowledgeSyncResult
  ): Promise<void> {
    const tracker = this._deps.tracker

    // 拉 manifest
    const dl = await client.getSessionFile(key)
    if (!dl.success || !dl.data) {
      if (dl.code !== 'session_file_not_found')
        result.errors.push({ key, message: `下载文件块清单失败：${dl.error ?? dl.code}` })
      return
    }
    let manifestBytes: Uint8Array
    try {
      manifestBytes = openKnowledgeManifest(dek, dl.data.bytes)
    } catch {
      result.errors.push({ key, message: '文件块清单解密失败' })
      return
    }
    const manifest = this.parseKnowledgeFileManifest(manifestBytes)
    if (!manifest) {
      result.errors.push({ key, message: '文件块清单解析失败' })
      return
    }

    // 逐块拉取解密
    const blockBuffers: Buffer[] = []
    for (const blockId of manifest.blockIds) {
      let blockBytes: Uint8Array | null = null
      for (let retry = 0; retry < 2; retry++) {
        const blockDl = await client.getBlock(blockId)
        if (blockDl.success && blockDl.data) {
          try {
            blockBytes = openKnowledgeBlock(dek, blockDl.data.bytes)
            break
          } catch {
            /* 解密失败重试 */
          }
        }
      }
      if (!blockBytes) {
        result.errors.push({ key, message: `块下载失败：${blockId}` })
        return
      }
      result.blocksDownloaded++
      blockBuffers.push(Buffer.from(blockBytes))
    }

    // 重组 + sha256 校验
    const reassembled = Buffer.concat(blockBuffers)
    const hash = createHash('sha256').update(reassembled).digest('hex')
    if (hash !== manifest.sha256) {
      result.errors.push({ key, message: '文件下载 sha256 校验失败' })
      return
    }

    // 落盘
    const applyResult = await this._deps.fileStorage.applySyncedFileContent(fileId, reassembled)
    if (!applyResult.success) {
      result.errors.push({ key, message: `文件落盘失败：${applyResult.error ?? '未知'}` })
      return
    }

    // 更新 tracker：version + contentHash（指纹）+ fileBlocks 基线
    const manifestFingerprint = `${manifest.sha256}:${manifest.blockIds.join(',')}`
    tracker.setKey(key, {
      version: dl.data.version ?? remoteVersion,
      contentHash: manifestFingerprint,
      fileBlocks: {
        size: manifest.size,
        mtime: new Date().toISOString(),
        sha256: manifest.sha256,
        blockIds: manifest.blockIds
      }
    })
    result.downloaded++
  }

  /** 解析并校验文件块清单（JSON）；字段非法返回 null */
  private parseKnowledgeFileManifest(bytes: Uint8Array): KnowledgeFileManifest | null {
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
      const v = value as Record<string, unknown>
      if (v.schemaVersion !== 1) return null
      if (typeof v.fileId !== 'string' || v.fileId.length === 0) return null
      if (typeof v.updatedAt !== 'string') return null
      if (!Number.isSafeInteger(v.size) || (v.size as number) < 0) return null
      if (typeof v.sha256 !== 'string') return null
      if (!Array.isArray(v.blockIds) || !v.blockIds.every((b) => typeof b === 'string')) return null
      return v as unknown as KnowledgeFileManifest
    } catch {
      return null
    }
  }
}
