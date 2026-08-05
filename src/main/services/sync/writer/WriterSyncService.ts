/**
 * writing 同步编排引擎：定时/手动/事件触发，扫描本地 writing/ 目录，
 * 三向 diff（本地新改/远端新改/删除），下行按 key 类型分发，上行 CAS。
 *
 * 原则：引擎是旁观者——下行只走 WriterStorageService.applySynced* / WriterAssetService.importBytes，
 * 不直接写业务文件。DEK/RelayClient 经 SyncService 主进程内部接口获取。
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from '@main/services/logger'
import type { WriterDocument, WriterIndex } from '@shared/types/writer'
import type { WriterSyncResult, WriterSyncState, SyncResult } from '@shared/types/sync'
import type { SyncService } from '../SyncService'
import { sha256Hex } from '../crypto/hash'
import { sealWriterFile, openWriterFile } from './writerSnapshotCrypto'
import { WriterSyncTracker } from './writerSyncTracker'
import { mergeWriterIndex } from './writerMerge'
import {
  makeIndexKey,
  makeDocKey,
  makeAssetKey,
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

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_EVENT_DEBOUNCE_MS = 2_000
const CAS_RETRY_LIMIT = 2

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type WriterStorageLike = {
  listDocuments(): WriterIndex
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
  mtime: string
}

function emptyResult(): WriterSyncResult {
  return { uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, skipped: 0, errors: [] }
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
      return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    }
    this.kickoff()
    if (this.chain) await this.chain
    const last = this.state.lastResult
    if (this.state.phase === 'error') {
      return {
        success: false,
        code: 'unknown_error',
        error: this.state.lastError ?? '写作同步失败',
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
        lastError: failed ? `${result.errors.length} 项写作同步失败` : null
      })
      logger.info('写作同步完成', 'main', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
        deletedLocal: result.deletedLocal,
        deletedRemote: result.deletedRemote,
        skipped: result.skipped,
        errors: result.errors.length
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ phase: 'error', lastError: message })
      logger.error('写作同步整轮失败', 'main', { error: message })
    }
  }

  /** 扫描本地 writing/ 目录，返回 key → LocalFile 映射 */
  private async scanLocal(): Promise<Map<string, LocalFile>> {
    const files = new Map<string, LocalFile>()
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
      // assets
      const assetsDir = getWriterAssetsDir(docId, root)
      let assetFiles: string[] = []
      try {
        assetFiles = await readdir(assetsDir)
      } catch {
        continue
      }
      for (const assetFile of assetFiles) {
        if (!ASSET_FILE_PATTERN.test(assetFile)) continue
        await this.addFile(files, join(assetsDir, assetFile), makeAssetKey(docId, assetFile))
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
    tracker.pruneTombstones()
    const trackedKeys = tracker.getData().keys

    // 阶段 0：扫描本地
    const localMap = await this.scanLocal()

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
        `拉取 session-files 列表失败：${remoteList.error ?? remoteList.code ?? '未知错误'}`
      )
    }
    const remoteMap = new Map(
      remoteList.data.sessions
        .filter((s) => isWriterKey(s.sessionId))
        .map((s) => [s.sessionId, s.version])
    )

    // (a) 本地上行删除：tracker 有记录 + 本地文件消失
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

    // (b) 下行：远端有新版本
    for (const [key, remoteVersion] of remoteMap) {
      if (tracker.getTombstone(key)) continue // 本端已删，跳过复活
      const tracked = trackedKeys[key]
      const local = localMap.get(key)
      const remoteAhead = !tracked || remoteVersion > tracked.version
      if (!remoteAhead) continue

      const dl = await client.getSessionFile(key)
      if (!dl.success || !dl.data) {
        if (dl.code !== 'session_file_not_found') {
          result.errors.push({ key, message: `下载失败：${dl.error ?? dl.code}` })
        }
        continue
      }

      let plainBytes: Uint8Array
      try {
        plainBytes = openWriterFile(dek, dl.data.bytes)
      } catch {
        result.errors.push({ key, message: '解密失败' })
        continue
      }

      const parsed = parseWriterKey(key)
      if (!parsed) {
        result.errors.push({ key, message: 'key 解析失败' })
        continue
      }

      const downloadResult = await this.applyRemoteFile(parsed, plainBytes, local?.hash)
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
      if (parsed.kind === 'document') {
        const del = await this.storage.applySyncedDeletedDocument(parsed.documentId)
        if (!del.success) {
          result.errors.push({ key, message: `本地删除失败：${del.error ?? '未知'}` })
          continue
        }
      }
      // index 不删除；asset 随文档删除
      tracker.removeKey(key)
      localMap.delete(key)
      result.deletedLocal++
    }

    // (d) 上行：dirty 文件
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

    tracker.setLastSyncAt(new Date().toISOString())
    tracker.save()
    return result
  }

  /** 按 key 类型分发下行落盘；返回 'downloaded' | 'ignored' */
  private async applyRemoteFile(
    parsed: ParsedWriterKey,
    bytes: Uint8Array,
    _localHash: string | undefined
  ): Promise<'downloaded' | 'ignored'> {
    switch (parsed.kind) {
      case 'index': {
        const remoteIndex = JSON.parse(new TextDecoder().decode(bytes)) as WriterIndex
        const localIndex = this.storage.listDocuments()
        const merge = mergeWriterIndex({ local: localIndex, remote: remoteIndex })
        if (merge.changed) {
          await this.storage.applySyncedIndex(merge.merged)
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
        await this.storage.applySyncedDocument(remoteDoc)
        return 'downloaded'
      }
      case 'asset': {
        const ext = parsed.fileName.split('.').pop() ?? ''
        const mimeType = extToMime(ext)
        await this.assetService.importBytes(parsed.documentId, {
          fileName: parsed.fileName,
          declaredMimeType: mimeType,
          bytes
        })
        return 'downloaded'
      }
    }
  }

  /** 读回本地文件算 hash（落盘后调用） */
  private async rereadLocalFile(parsed: ParsedWriterKey): Promise<string | null> {
    const root = this.writingRoot()
    let path: string | null = null
    switch (parsed.kind) {
      case 'index':
        path = join(root, 'index.json')
        break
      case 'document':
        path = getWriterDocumentPath(parsed.documentId, root)
        break
      case 'asset':
        path = join(getWriterAssetsDir(parsed.documentId, root), parsed.fileName)
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
    let base = baseVersion
    for (let attempt = 0; attempt <= CAS_RETRY_LIMIT; attempt++) {
      const ct = sealWriterFile(dek, currentBytes)
      const put = await client.putSessionFile(key, base, ct)
      if (put.success && put.data) {
        this.tracker.setKey(key, { version: put.data.version, contentHash })
        result.uploaded++
        return
      }
      if (put.code !== 'stale_session_file') {
        result.errors.push({ key, message: `上传失败：${put.error ?? put.code}` })
        return
      }
      // 409：拉最新 → 按 key 类型合并 → 重试
      const latest = await client.getSessionFile(key)
      if (!latest.success || !latest.data) {
        result.errors.push({ key, message: '冲突后拉取最新版本失败' })
        return
      }
      let remoteBytes: Uint8Array
      try {
        remoteBytes = openWriterFile(dek, latest.data.bytes)
      } catch {
        result.errors.push({ key, message: '冲突合并解密失败' })
        return
      }
      const parsed = parseWriterKey(key)
      if (!parsed) {
        result.errors.push({ key, message: '冲突合并 key 解析失败' })
        return
      }
      // 合并
      if (parsed.kind === 'document') {
        const remoteDoc = JSON.parse(new TextDecoder().decode(remoteBytes)) as WriterDocument
        const localDoc = JSON.parse(new TextDecoder().decode(currentBytes)) as WriterDocument
        currentBytes = new TextEncoder().encode(
          JSON.stringify(localDoc.revision >= remoteDoc.revision ? localDoc : remoteDoc, null, 2)
        )
      }
      // index/asset：内容寻址或本地优先，保留 currentBytes
      base = latest.data.version ?? base + 1
    }
    result.errors.push({ key, message: '版本冲突重试耗尽' })
  }
}
