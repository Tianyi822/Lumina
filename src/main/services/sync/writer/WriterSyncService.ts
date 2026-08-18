/**
 * writing 同步编排引擎：定时/手动/事件触发，扫描本地 writing/ 目录，
 * 三向 diff（本地新改/远端新改/删除），下行按 key 类型分发，上行 CAS。
 *
 * 通道划分：index/document（小 JSON）走 session-files CAS；文档资产走
 * Manifest+blocks——manifest（writer-assets-{docId}，块清单）走 session-files，
 * 资产内容切块（XChaCha20-Poly1305，AAD 域独立）走 /blocks，参照 paper/knowledge。
 * 旧 writer-asset-{docId}-{hash-ext} 整文件 key 因含点号不合规从未上行成功，
 * 服务端无存量，tracker 残留记录在 phase (a) 的 removeKey 路径清理。
 *
 * 原则：引擎是旁观者——下行只走 WriterStorageService.applySynced* / WriterAssetService.importBytes，
 * 不直接写业务文件。DEK/RelayClient 经 SyncService 主进程内部接口获取。
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from '@main/services/logger'
import { t } from '@main/services/i18n'
import type { WriterDocument, WriterIndex } from '@shared/types/writer'
import {
  parseWriterAssetManifest,
  type WriterAssetManifest,
  type WriterAssetManifestFileEntry,
  type WriterSyncResult,
  type WriterSyncState,
  type SyncResult
} from '@shared/types/sync'
import type { SyncService } from '../SyncService'
import { casPutWithMerge } from '../casRetry'
import { sha256Hex } from '../crypto/hash'
import { chunkFile } from '../shared/chunkFile'
import { resetTrackerIfAccountChanged } from '../shared/trackerAccountScope'
import {
  sealWriterFile,
  openWriterFile,
  sealWriterAssetBlock,
  openWriterAssetBlock,
  sealWriterAssetManifest,
  openWriterAssetManifest
} from './writerSnapshotCrypto'
import {
  WriterSyncTracker,
  type TrackedWriterAssetFileBlocks,
  type TrackedWriterKeyEntry
} from './writerSyncTracker'
import { mergeWriterIndex } from './writerMerge'
import {
  makeIndexKey,
  makeDocKey,
  makeAssetsManifestKey,
  isWriterKey,
  parseWriterKey,
  type ParsedWriterKey
} from './writerSyncKeys'
import {
  getWritingRootPath,
  getWriterDocumentPath,
  getWriterAssetsDir,
  isValidWriterDocumentId
} from '@main/services/writer/writerPaths'

/** session-files 通道的密文上限（对齐 relay maxSessionFileBytes） */
const MAX_SESSION_FILE_BYTES = 4 * 1024 * 1024
/** session-files 密文开销（XChaCha20-Poly1305：nonce24 + tag16） */
const CIPHER_OVERHEAD_BYTES = 40
/** manifest CAS 重试上限（与 paper pack / knowledge file 一致） */
const MANIFEST_CAS_RETRY_LIMIT = 2

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_EVENT_DEBOUNCE_MS = 2_000

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type WriterStorageLike = {
  listDocuments(): Promise<{ success: boolean; data?: WriterIndex | null; error?: string }>
  applySyncedIndex(merged: WriterIndex): Promise<{ success: boolean; error?: string }>
  applySyncedDocument(doc: WriterDocument): Promise<{ success: boolean; error?: string }>
  applySyncedDeletedDocument(id: string): Promise<{ success: boolean; error?: string }>
  readDocumentForSync(id: string): Promise<{ success: boolean; data?: WriterDocument | null }>
}
type WriterAssetLike = {
  importBytes(
    docId: string,
    input: { fileName: string; declaredMimeType: string; bytes: Uint8Array }
  ): Promise<{ success: boolean; error?: string }>
}

export interface WriterSyncServiceDeps {
  syncService: SyncServiceLike
  storage: WriterStorageLike
  assetService: WriterAssetLike
  tracker: WriterSyncTracker
  broadcast: (state: WriterSyncState) => void
  writingRootProvider?: () => string
  intervalMs?: number
  eventDebounceMs?: number
}

interface LocalFile {
  bytes: Uint8Array
  hash: string
}

/** 走 session-files JSON 通道的 key（index/document）；asset/assets-manifest 走块通道，不经此类型 */
type JsonParsedWriterKey = Exclude<ParsedWriterKey, { kind: 'assets-manifest' | 'asset' }>

/** 本地资产文件元数据（不整读内容，切块时流式读） */
interface LocalAssetFile {
  fileName: string
  absPath: string
  size: number
  mtime: string
}

/** 单文档的本地资产集合（manifest key → 该条目） */
interface LocalAssetsEntry {
  documentId: string
  files: LocalAssetFile[]
}

interface ScanResult {
  localMap: Map<string, LocalFile>
  localAssets: Map<string, LocalAssetsEntry>
}

/**
 * 资产清单指纹（忽略 updatedAt）：按条目摘要排序拼接。
 * 与 tracker.contentHash 比对做 dirty/skip 判定，块内容寻址保证同指纹即同内容。
 */
function assetsFingerprint(
  files: ReadonlyArray<{ fileName: string; sha256: string; blockIds: string[] }>
): string {
  return files
    .map((f) => `${f.fileName}:${f.sha256}:${f.blockIds.join(',')}`)
    .sort()
    .join(';')
}

function emptyResult(): WriterSyncResult {
  return {
    uploaded: 0,
    downloaded: 0,
    deletedLocal: 0,
    deletedRemote: 0,
    blocksUploaded: 0,
    blocksDownloaded: 0,
    skipped: 0,
    errors: []
  }
}

/** asset 文件名正则（sha256 + 扩展名） */
const ASSET_FILE_PATTERN = /^[a-f0-9]+\.(png|jpg|webp|gif)$/

/** MIME 映射（与 WriterAssetService 的 IMAGE_FORMATS 一致） */
function extToMime(ext: string): string {
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

export class WriterSyncService {
  private readonly syncService: SyncServiceLike
  private readonly storage: WriterStorageLike
  private readonly assetService: WriterAssetLike
  private readonly tracker: WriterSyncTracker
  private readonly broadcast: (state: WriterSyncState) => void
  private readonly writingRoot: () => string
  private readonly intervalMs: number
  private readonly eventDebounceMs: number

  private state: WriterSyncState = {
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

  constructor(deps: WriterSyncServiceDeps) {
    this.syncService = deps.syncService
    this.storage = deps.storage
    this.assetService = deps.assetService
    this.tracker = deps.tracker
    this.broadcast = deps.broadcast
    this.writingRoot = deps.writingRootProvider ?? getWritingRootPath
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    this.eventDebounceMs = deps.eventDebounceMs ?? DEFAULT_EVENT_DEBOUNCE_MS
  }

  getState(): WriterSyncState {
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
    if (!this.chain) {
      this.chain = this.drain()
    }
  }

  handleWriterFileEvent(): void {
    if (this.eventTimer) clearTimeout(this.eventTimer)
    this.eventTimer = setTimeout(() => {
      this.eventTimer = null
      this.kickoff()
    }, this.eventDebounceMs)
  }

  async syncNow(): Promise<SyncResult<WriterSyncResult>> {
    if (!this.isConnected()) {
      return { success: false, code: 'not_connected', error: t('notifications.sync.notConnected') }
    }
    if (Date.now() < this.rateLimitedUntil) {
      return {
        success: false,
        code: 'rate_limited',
        error: t('notifications.sync.rateLimitedRetryLater')
      }
    }
    this.kickoff()
    if (this.chain) await this.chain
    const last = this.state.lastResult
    if (this.state.phase === 'error') {
      return {
        success: false,
        code: Date.now() < this.rateLimitedUntil ? 'rate_limited' : 'unknown_error',
        error: this.state.lastError ?? t('notifications.sync.writerSyncFallback'),
        data: last ?? undefined
      }
    }
    return { success: true, data: last ?? emptyResult() }
  }

  private isConnected(): boolean {
    return this.syncService.getStatus().connected
  }

  private setState(patch: Partial<WriterSyncState>): void {
    this.state = { ...this.state, ...patch }
    this.broadcast(this.state)
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
        lastError: failed
          ? t('notifications.sync.lastErrorWriter', { count: result.errors.length })
          : null
      })
      logger.info('写作同步完成', 'main', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
        deletedLocal: result.deletedLocal,
        deletedRemote: result.deletedRemote,
        blocksUploaded: result.blocksUploaded,
        blocksDownloaded: result.blocksDownloaded,
        skipped: result.skipped,
        errors: result.errors.length
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ phase: 'error', lastError: message })
      logger.error('写作同步整轮失败', 'main', { error: message })
    }
  }

  /** 扫描本地 writing/ 目录：index/document 入 localMap（整读），资产入 localAssets（仅元数据） */
  private async scanLocal(): Promise<ScanResult> {
    const files = new Map<string, LocalFile>()
    const localAssets = new Map<string, LocalAssetsEntry>()
    const root = this.writingRoot()

    // index.json
    await this.addFile(files, join(root, 'index.json'), makeIndexKey())

    // documents
    const documentsPath = join(root, 'documents')
    let docDirs: string[] = []
    try {
      docDirs = await readdir(documentsPath)
    } catch {
      // 目录不存在视为空
    }
    for (const docId of docDirs) {
      if (!isValidWriterDocumentId(docId)) continue
      // document.json
      await this.addFile(files, getWriterDocumentPath(docId, root), makeDocKey(docId))
      // assets：走 Manifest+blocks 通道，只记元数据不整读（大图不进内存）
      const entry = await this.scanAssetsDir(docId)
      // 有资产文件才登记 manifest key；资产清空/目录消失 → key 缺位，
      // phase (a) 删远端 manifest，资产删除得以传播
      if (entry.files.length > 0) localAssets.set(makeAssetsManifestKey(docId), entry)
    }
    return { localMap: files, localAssets }
  }

  /** 扫描单文档 assets 目录的文件元数据（readdir + stat，不读内容） */
  private async scanAssetsDir(documentId: string): Promise<LocalAssetsEntry> {
    const entry: LocalAssetsEntry = { documentId, files: [] }
    const assetsDir = getWriterAssetsDir(documentId, this.writingRoot())
    let assetFiles: string[] = []
    try {
      assetFiles = await readdir(assetsDir)
    } catch {
      return entry // 目录不存在视为空清单
    }
    for (const assetFile of assetFiles) {
      if (!ASSET_FILE_PATTERN.test(assetFile)) continue
      const absPath = join(assetsDir, assetFile)
      try {
        const st = await stat(absPath)
        entry.files.push({
          fileName: assetFile,
          absPath,
          size: st.size,
          mtime: st.mtime.toISOString()
        })
      } catch {
        // 文件在 readdir 与 stat 之间消失，跳过
      }
    }
    return entry
  }

  private async addFile(
    files: Map<string, LocalFile>,
    fullPath: string,
    key: string
  ): Promise<void> {
    try {
      const bytes = new Uint8Array(await readFile(fullPath))
      files.set(key, { bytes, hash: sha256Hex(bytes) })
    } catch {
      // 文件不存在跳过
    }
  }

  private async runSync(): Promise<WriterSyncResult> {
    const result = emptyResult()
    if (!this.isConnected()) return result
    const dek = this.syncService.getDataKey()
    const client = this.syncService.getClient()
    if (!dek || !client) return result

    const tracker = this.tracker
    resetTrackerIfAccountChanged('写作', tracker, this.syncService.getStatus().accountId)
    tracker.pruneTombstones()
    const trackedKeys = tracker.getData().keys

    // 阶段 0：扫描本地
    const { localMap, localAssets } = await this.scanLocal()

    // 阶段 1：拉远端列表
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
        t('notifications.sync.listSessionFilesFailed', {
          detail: remoteList.error ?? remoteList.code ?? t('notifications.sync.unknownError')
        })
      )
    }
    const remoteMap = new Map(
      remoteList.data.sessions
        .filter((s) => isWriterKey(s.sessionId))
        .map((s) => [s.sessionId, s.version])
    )

    // (a) 本地上行删除：tracker 有记录 + 本地内容消失
    //     assets-manifest 用 localAssets 判存在；tracked 旧 writer-asset-* 已不再
    //     扫描进 localMap，远端无存量时走 remoteVersion===undefined → removeKey 清理
    for (const key of Object.keys(trackedKeys)) {
      const parsedKey = parseWriterKey(key)
      const exists =
        parsedKey?.kind === 'assets-manifest' ? localAssets.has(key) : localMap.has(key)
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
        result.errors.push({
          key,
          message: t('notifications.sync.remoteDeleteFailed', { detail: del.error ?? del.code })
        })
      }
    }

    // (b) 下行：远端有新版本
    const assetKeysFailedDownload = new Set<string>()
    for (const [key, remoteVersion] of remoteMap) {
      if (tracker.getTombstone(key)) continue // 本端已删，跳过复活
      const tracked = trackedKeys[key]
      const remoteAhead = !tracked || remoteVersion > tracked.version
      if (!remoteAhead) continue

      const parsed = parseWriterKey(key)
      if (!parsed) {
        result.errors.push({ key, message: t('notifications.sync.keyParseFailed') })
        continue
      }

      // assets-manifest：拉 manifest → 逐文件拉块重组落盘（manifest 用独立 AAD 密封，
      // 不经 openWriterFile 解密，须在此分流）
      if (parsed.kind === 'assets-manifest') {
        const ok = await this.downloadAssetBlocks(
          client,
          dek,
          parsed,
          key,
          remoteVersion,
          localAssets,
          result
        )
        if (!ok) assetKeysFailedDownload.add(key)
        continue
      }

      // 旧 writer-asset-* 整文件 key：服务端无存量（key 含点号从未上行成功），防御性跳过
      if (parsed.kind === 'asset') continue

      const dl = await client.getSessionFile(key)
      if (!dl.success || !dl.data) {
        if (dl.code !== 'session_file_not_found') {
          result.errors.push({
            key,
            message: t('notifications.sync.itemDownloadFailed', { detail: dl.error ?? dl.code })
          })
        }
        continue
      }

      let plainBytes: Uint8Array
      try {
        plainBytes = openWriterFile(dek, dl.data.bytes)
      } catch {
        result.errors.push({ key, message: t('notifications.sync.decryptFailed') })
        continue
      }

      // JSON 解析失败按 key 隔离记 error，不阻断后续 key；
      // 其余异常（如本地索引读取失败）上抛，整轮失败由 runOnce 统一记录
      let downloadResult: Awaited<ReturnType<typeof this.applyRemoteFile>>
      try {
        downloadResult = await this.applyRemoteFile(parsed, plainBytes)
      } catch (error) {
        if (error instanceof SyntaxError) {
          result.errors.push({ key, message: t('notifications.sync.jsonParseFailed') })
          continue
        }
        throw error
      }
      if (downloadResult === 'downloaded') {
        // 读回真实字节算 hash
        const reread = await this.rereadLocalFile(parsed)
        tracker.setKey(key, {
          version: dl.data.version ?? remoteVersion,
          contentHash: reread ?? sha256Hex(plainBytes)
        })
        result.downloaded++
      } else if (downloadResult === 'ignored') {
        // 本地更新，不更新 tracker.version（保留旧值），让上行阶段处理
      } else if ('failed' in downloadResult) {
        // 落盘失败：记 error 让用户感知，但不更新 tracker（下轮仍 remoteAhead 会重试）
        result.errors.push({ key, message: downloadResult.failed })
      }
    }

    // (c) 远端删除 → 下行删除
    for (const [key, tracked] of Object.entries(trackedKeys)) {
      if (remoteMap.has(key)) continue
      const local = localMap.get(key)
      if (!local) continue // 已在 (a) 处理
      if (local.hash !== tracked.contentHash) continue // 本地有未同步变更 → 保留

      const parsed = parseWriterKey(key)
      if (!parsed) continue
      // 仅处理文档删除；index 不删（永远存在），asset 由 collectGarbage 清理
      if (parsed.kind !== 'document') continue

      const del = await this.storage.applySyncedDeletedDocument(parsed.documentId)
      if (!del.success) {
        result.errors.push({
          key,
          message: t('notifications.sync.localDeleteFailed', {
            detail: del.error ?? t('notifications.sync.unknown')
          })
        })
        continue
      }
      tracker.removeKey(key)
      localMap.delete(key)
      result.deletedLocal++
    }

    // (d) 上行：dirty 文件（index/document 走 session-files CAS）
    for (const [key, local] of localMap) {
      const tracked = trackedKeys[key]
      const dirty = !tracked || local.hash !== tracked.contentHash
      if (!dirty) {
        result.skipped++
        continue
      }
      await this.uploadWriterFile(
        client,
        dek,
        key,
        local.bytes,
        tracked?.version ?? 0,
        result,
        local.hash
      )
    }

    // (d) 上行：dirty 资产（Manifest+blocks；本轮下载失败的 key 跳过，避免窄化远端清单）
    for (const [key, local] of localAssets) {
      if (assetKeysFailedDownload.has(key)) continue
      await this.uploadAssetBlocks(client, dek, key, local, result)
    }

    tracker.setLastSyncAt(new Date().toISOString())
    tracker.save()
    return result
  }

  /**
   * 按 key 类型分发下行落盘（仅 index/document；asset/assets-manifest 在
   * runSync 阶段 (b) 已分流到块通道）。
   * 返回 'downloaded'（已落盘）、'ignored'（本地更新或相同，无需改动）、
   * 或 { failed }（落盘失败，调用方记 error 但不更新 tracker，下轮仍会重试）。
   */
  private async applyRemoteFile(
    parsed: JsonParsedWriterKey,
    bytes: Uint8Array
  ): Promise<'downloaded' | 'ignored' | { failed: string }> {
    switch (parsed.kind) {
      case 'index': {
        const remoteIndex = JSON.parse(new TextDecoder().decode(bytes)) as WriterIndex
        const localResult = await this.storage.listDocuments()
        if (!localResult.success || !localResult.data) {
          // 本地索引不可读时无法安全合并，直接失败（不做空索引兜底，避免抹掉本地摘要）
          throw new Error(
            t('notifications.sync.readLocalWriterIndexFailed', {
              detail: localResult.error ?? t('notifications.sync.unknownError')
            })
          )
        }
        const merge = mergeWriterIndex({ local: localResult.data, remote: remoteIndex })
        if (merge.changed) {
          const applyResult = await this.storage.applySyncedIndex(merge.merged)
          if (!applyResult.success) {
            return {
              failed: t('notifications.sync.writerIndexApplyFailed', {
                detail: applyResult.error ?? t('notifications.sync.unknown')
              })
            }
          }
        }
        return 'downloaded'
      }
      case 'document': {
        const remoteDoc = JSON.parse(new TextDecoder().decode(bytes)) as WriterDocument
        const localResult = await this.storage.readDocumentForSync(parsed.documentId)
        const localDoc = localResult.success ? localResult.data : null
        if (localDoc && remoteDoc.revision <= localDoc.revision) {
          return 'ignored' // 本地更新或相同
        }
        const applyResult = await this.storage.applySyncedDocument(remoteDoc)
        if (!applyResult.success) {
          return {
            failed: t('notifications.sync.writerDocumentApplyFailed', {
              detail: applyResult.error ?? t('notifications.sync.unknown')
            })
          }
        }
        return 'downloaded'
      }
    }
  }

  /** 读回本地文件算 hash（落盘后调用；仅 index/document，资产走块通道不经此路径） */
  private async rereadLocalFile(parsed: JsonParsedWriterKey): Promise<string | null> {
    const root = this.writingRoot()
    let path: string | null = null
    switch (parsed.kind) {
      case 'index':
        path = join(root, 'index.json')
        break
      case 'document':
        path = getWriterDocumentPath(parsed.documentId, root)
        break
    }
    if (!path) return null
    try {
      const bytes = await readFile(path)
      return sha256Hex(new Uint8Array(bytes))
    } catch {
      return null
    }
  }

  /** 上行单文件（含 409 重试） */
  private async uploadWriterFile(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    key: string,
    bytes: Uint8Array,
    baseVersion: number,
    result: WriterSyncResult,
    contentHash: string
  ): Promise<void> {
    let currentBytes = bytes

    const outcome = await casPutWithMerge({
      initialBytes: bytes,
      initialBase: baseVersion,
      putFn: async (b, base) => client.putSessionFile(key, base, sealWriterFile(dek, b)),
      onConflict: async () => {
        // 409：拉最新 → 按 key 类型合并 → 重试
        const latest = await client.getSessionFile(key)
        if (!latest.success || !latest.data) {
          return { resolved: 'failed', error: t('notifications.sync.conflictFetchLatestFailed') }
        }
        let remoteBytes: Uint8Array
        try {
          remoteBytes = openWriterFile(dek, latest.data.bytes)
        } catch {
          return { resolved: 'failed', error: t('notifications.sync.conflictMergeDecryptFailed') }
        }
        const parsed = parseWriterKey(key)
        if (!parsed) {
          return { resolved: 'failed', error: t('notifications.sync.conflictMergeKeyParseFailed') }
        }
        // 合并
        if (parsed.kind === 'document') {
          let remoteDoc: WriterDocument
          let localDoc: WriterDocument
          try {
            remoteDoc = JSON.parse(new TextDecoder().decode(remoteBytes)) as WriterDocument
            localDoc = JSON.parse(new TextDecoder().decode(currentBytes)) as WriterDocument
          } catch {
            return {
              resolved: 'failed',
              error: t('notifications.sync.conflictMergeJsonParseFailed')
            }
          }
          if (localDoc.revision >= remoteDoc.revision) {
            // 本地胜出：用本地内容重试
            currentBytes = new TextEncoder().encode(JSON.stringify(localDoc, null, 2))
            return {
              resolved: 'rebased',
              bytes: currentBytes,
              nextBase: latest.data.version ?? 0
            }
          }
          // 远端 revision 更新：不上行，转下行落盘并对齐 tracker，避免双端分叉
          const applyResult = await this.storage.applySyncedDocument(remoteDoc)
          if (!applyResult.success) {
            return {
              resolved: 'failed',
              error: t('notifications.sync.conflictApplyRemoteFailed', {
                detail: applyResult.error ?? t('notifications.sync.unknown')
              })
            }
          }
          const reread = await this.rereadLocalFile(parsed)
          this.tracker.setKey(key, {
            version: latest.data.version ?? 0,
            contentHash: reread ?? sha256Hex(remoteBytes)
          })
          result.downloaded++
          return { resolved: 'resolved', resolvedVersion: latest.data.version ?? 0 }
        }
        // index：本地优先（整 JSON 无字段级合并意义），保留 currentBytes 重试
        return { resolved: 'rebased', bytes: currentBytes, nextBase: latest.data.version ?? 0 }
      }
    })

    if (outcome.ok) {
      // resolved（远端 revision 胜出转下行）已在 onConflict 内对齐 tracker + downloaded++，
      // 不再计 uploaded；仅 PUT 成功的路径才计 uploaded
      if (outcome.via === 'put') {
        this.tracker.setKey(key, { version: outcome.version, contentHash })
        result.uploaded++
      }
    } else {
      result.errors.push({ key, message: outcome.error })
    }
  }

  /**
   * 下行资产块：拉 manifest → 逐文件处理（本地已有且读回 sha256 匹配 → 跳过下载；
   * 缺失/不一致 → 逐块 getBlock（重试 2 次）→ openWriterAssetBlock → 重组 →
   * sha256 校验 → assetService.importBytes 落盘）→ 全部成功后对齐 tracker 并刷新
   * 本地扫描快照（让 phase (d) 用最新状态做指纹 diff，避免回推窄化清单）。
   *
   * manifest 拉取/解密/解析失败按 key 记 error 不中断其他 key。
   * 返回 false 表示本轮失败（调用方跳过该 key 的上行，下轮仍 remoteAhead 会重试）。
   */
  private async downloadAssetBlocks(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    parsed: Extract<ParsedWriterKey, { kind: 'assets-manifest' }>,
    key: string,
    remoteVersion: number,
    localAssets: Map<string, LocalAssetsEntry>,
    result: WriterSyncResult
  ): Promise<boolean> {
    const dl = await client.getSessionFile(key)
    if (!dl.success || !dl.data) {
      if (dl.code !== 'session_file_not_found') {
        result.errors.push({
          key,
          message: t('notifications.sync.writerAssetDownloadFailed', {
            detail: dl.error ?? dl.code
          })
        })
      }
      return false
    }
    let manifestBytes: Uint8Array
    try {
      manifestBytes = openWriterAssetManifest(dek, dl.data.bytes)
    } catch {
      result.errors.push({ key, message: t('notifications.sync.decryptFailed') })
      return false
    }
    const manifest = parseWriterAssetManifest(new TextDecoder().decode(manifestBytes))
    if (!manifest) {
      result.errors.push({ key, message: t('notifications.sync.writerAssetManifestParseFailed') })
      return false
    }

    const localEntry = localAssets.get(key)
    const fileBlocks: Record<string, TrackedWriterAssetFileBlocks> = {}
    let downloadedAny = false
    for (const file of manifest.files) {
      // 本地已有且内容一致：跳过下载；基线记远端 blockIds（与远端指纹对齐，避免上行回摆）
      const localFile = localEntry?.files.find((f) => f.fileName === file.fileName)
      if (localFile) {
        try {
          const bytes = new Uint8Array(await readFile(localFile.absPath))
          if (sha256Hex(bytes) === file.sha256) {
            fileBlocks[file.fileName] = {
              size: file.size,
              mtime: localFile.mtime,
              sha256: file.sha256,
              blockIds: file.blockIds
            }
            continue
          }
        } catch {
          // 读失败走下载覆盖
        }
      }

      // 缺失/不一致：逐块拉取解密（getBlock 重试 2 次）
      const blockBuffers: Buffer[] = []
      let blockFailed = false
      for (const blockId of file.blockIds) {
        let blockBytes: Uint8Array | null = null
        for (let retry = 0; retry < 2; retry++) {
          const blockDl = await client.getBlock(blockId)
          if (blockDl.success && blockDl.data) {
            try {
              blockBytes = openWriterAssetBlock(dek, blockId, blockDl.data.bytes)
              break
            } catch {
              // 解密/blockId 校验失败重试
            }
          }
        }
        if (!blockBytes) {
          result.errors.push({
            key,
            message: t('notifications.sync.blockDownloadFailed', { blockId })
          })
          blockFailed = true
          break
        }
        result.blocksDownloaded++
        blockBuffers.push(Buffer.from(blockBytes))
      }
      if (blockFailed) return false

      // 重组 + sha256 校验
      const reassembled = new Uint8Array(Buffer.concat(blockBuffers))
      if (sha256Hex(reassembled) !== file.sha256) {
        result.errors.push({ key, message: t('notifications.sync.fileDownloadSha256Invalid') })
        return false
      }

      // 落盘（文件名内容寻址，同 fileName 即同内容，覆盖幂等）
      const ext = file.fileName.split('.').pop() ?? ''
      const importResult = await this.assetService.importBytes(parsed.documentId, {
        fileName: file.fileName,
        declaredMimeType: extToMime(ext),
        bytes: reassembled
      })
      if (!importResult.success) {
        result.errors.push({
          key,
          message: t('notifications.sync.writerAssetApplyFailed', {
            detail: importResult.error ?? t('notifications.sync.unknown')
          })
        })
        return false
      }
      downloadedAny = true
      fileBlocks[file.fileName] = {
        size: file.size,
        mtime: await this.assetMtime(parsed.documentId, file.fileName),
        sha256: file.sha256,
        blockIds: file.blockIds
      }
    }

    // 全部文件处理成功：对齐 tracker（version + 指纹 + fileBlocks 基线）
    this.tracker.setKey(key, {
      version: dl.data.version ?? remoteVersion,
      contentHash: assetsFingerprint(manifest.files),
      fileBlocks
    })
    if (downloadedAny) result.downloaded++
    else result.skipped++
    // 落盘改写了本地资产，刷新扫描快照供 phase (d) 指纹 diff
    const refreshed = await this.scanAssetsDir(parsed.documentId)
    if (refreshed.files.length > 0) localAssets.set(key, refreshed)
    else localAssets.delete(key)
    return true
  }

  /**
   * 上行资产块：逐文件 diff（size+mtime 未变且已有基线 → 复用 blockIds 不重切块）
   * → 变更文件 chunkFile → sealWriterAssetBlock → blocksMissing → missing 才 putBlock
   * → 构建 manifest → session-files CAS 上行。
   * 任一块失败抛错中止该文档 manifest 上行（manifest 不得引用 relay 上不存在的块；
   * 已上传块内容寻址可复用，下轮重试），tracker 基线不更新。
   */
  private async uploadAssetBlocks(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    key: string,
    local: LocalAssetsEntry,
    result: WriterSyncResult
  ): Promise<void> {
    const tracked = this.tracker.getData().keys[key]
    const baseline = tracked?.fileBlocks ?? {}

    const manifestFiles: WriterAssetManifestFileEntry[] = []
    const nextBlocks: Record<string, TrackedWriterAssetFileBlocks> = {}
    try {
      for (const file of local.files) {
        const base = baseline[file.fileName]
        if (
          base &&
          base.size === file.size &&
          base.mtime === file.mtime &&
          base.blockIds.length > 0
        ) {
          manifestFiles.push({
            fileName: file.fileName,
            size: file.size,
            sha256: base.sha256,
            blockIds: base.blockIds
          })
          nextBlocks[file.fileName] = base
          continue
        }
        // 变更/新增：切块加密上传
        const blockIds: string[] = []
        const chunkResult = await chunkFile(file.absPath, async (chunk) => {
          const { blockId, ciphertext } = sealWriterAssetBlock(dek, chunk)
          const missing = await client.blocksMissing([blockId])
          if (!missing.success || !missing.data) {
            throw new Error(
              t('notifications.sync.blocksMissingQueryFailed', {
                detail: missing.error ?? missing.code ?? t('notifications.sync.unknownError')
              })
            )
          }
          if (missing.data.missing.includes(blockId)) {
            const putBlock = await client.putBlock(blockId, ciphertext)
            if (!putBlock.success) {
              throw new Error(
                t('notifications.sync.blockUploadFailed', {
                  detail: putBlock.error ?? putBlock.code ?? t('notifications.sync.unknownError')
                })
              )
            }
            if (putBlock.data?.created) result.blocksUploaded++
          }
          blockIds.push(blockId)
        })
        manifestFiles.push({
          fileName: file.fileName,
          size: chunkResult.size,
          sha256: chunkResult.sha256,
          blockIds
        })
        nextBlocks[file.fileName] = {
          size: chunkResult.size,
          mtime: file.mtime,
          sha256: chunkResult.sha256,
          blockIds
        }
      }
    } catch (error) {
      result.errors.push({
        key,
        message: t('notifications.sync.writerAssetChunkFailed', {
          detail: error instanceof Error ? error.message : String(error)
        })
      })
      return
    }

    // 指纹相等（size+mtime 均未变且清单内容一致）→ skip，不重推 manifest
    const fingerprint = assetsFingerprint(manifestFiles)
    if (tracked && tracked.contentHash === fingerprint) {
      result.skipped++
      return
    }
    await this.putAssetManifest(
      client,
      dek,
      key,
      local.documentId,
      manifestFiles,
      nextBlocks,
      fingerprint,
      tracked,
      result
    )
  }

  /**
   * 构建 manifest → session-files CAS 上行（≤2 stale rebase）→ 成功后更新 tracker。
   * stale 合并策略：内容寻址本地优先 re-base——拉最新仅取新 base 后整体重推本地清单，
   * 不做字段级合并。块通道内容寻址幂等（同 blockId 不重复存储），重推不丢块数据；
   * 若对端清单含本地没有的资产条目，对端本地文件仍在，会在其下一轮指纹 diff 中
   * 重新上行，最终收敛（代价是可能出现一轮清单回摆，不丢数据）。
   */
  private async putAssetManifest(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    key: string,
    documentId: string,
    files: WriterAssetManifestFileEntry[],
    fileBlocks: Record<string, TrackedWriterAssetFileBlocks>,
    fingerprint: string,
    tracked: TrackedWriterKeyEntry | undefined,
    result: WriterSyncResult
  ): Promise<void> {
    const manifest: WriterAssetManifest = {
      schemaVersion: 1,
      documentId,
      updatedAt: new Date().toISOString(),
      files
    }
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest))
    if (manifestBytes.length + CIPHER_OVERHEAD_BYTES > MAX_SESSION_FILE_BYTES) {
      result.errors.push({ key, message: t('notifications.sync.writerAssetManifestOverLimit') })
      return
    }

    let base = tracked?.version ?? 0
    let putOk = false
    let putVersion = 0
    for (let attempt = 0; attempt <= MANIFEST_CAS_RETRY_LIMIT; attempt++) {
      const ct = sealWriterAssetManifest(dek, manifestBytes)
      const put = await client.putSessionFile(key, base, ct)
      if (put.success && put.data) {
        putOk = true
        putVersion = put.data.version
        break
      }
      if (put.code !== 'stale_session_file') {
        result.errors.push({
          key,
          message: t('notifications.sync.writerAssetManifestUploadFailed', {
            detail: put.error ?? put.code ?? t('notifications.sync.unknownError')
          })
        })
        return
      }
      // stale：拉最新取新 base 重推（合并策略见方法头注释）
      const latest = await client.getSessionFile(key)
      base = latest.data?.version ?? 0
    }
    if (!putOk) {
      result.errors.push({
        key,
        message: t('notifications.sync.writerAssetManifestCasRetryExhausted')
      })
      return
    }

    this.tracker.setKey(key, { version: putVersion, contentHash: fingerprint, fileBlocks })
    result.uploaded++
  }

  /** 读资产文件当前 mtime（下载落盘后记基线用；读不到退化为当前时间） */
  private async assetMtime(documentId: string, fileName: string): Promise<string> {
    try {
      const st = await stat(join(getWriterAssetsDir(documentId, this.writingRoot()), fileName))
      return st.mtime.toISOString()
    } catch {
      return new Date().toISOString()
    }
  }
}
