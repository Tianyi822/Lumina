/**
 * paper 同步编排引擎：meta/annotations 走 session-files CAS 合并；
 * 大二进制走 manifest + blocks 内容寻址（懒下载）。
 *
 * 原则：旁观者——下行只走 PaperStorageService/PaperService 的 applySynced* 方法。
 */
import { readFile, stat, readdir } from 'node:fs/promises'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { logger } from '@main/services/logger'
import type { PaperDocument, PaperAnnotationStore } from '@shared/types/paper'
import type { PaperSyncResult, PaperSyncState, SyncResult } from '@shared/types/sync'
import type { SyncService } from '../SyncService'
import { casPutWithMerge } from '../casRetry'
import { sha256Hex } from '../crypto/hash'
import {
  sealPaperMeta,
  openPaperMeta,
  sealPaperAnnotations,
  openPaperAnnotations,
  sealPaperBlock,
  openPaperBlock,
  sealPaperPack,
  openPaperPack
} from './paperSnapshotCrypto'
import { PaperSyncTracker } from './paperSyncTracker'
import type { TrackedPaperPack, TrackedPaperPackFile } from './paperSyncTracker'
import { mergePaperMeta, mergePaperAnnotations } from './paperMerge'
import {
  chunkFile,
  parsePaperPackManifest,
  type PaperPackManifest,
  type PaperPackFileEntry
} from './paperPack'
import {
  makePaperMetaKey,
  makePaperAnnotationsKey,
  makePaperPackKey,
  isPaperKey,
  parsePaperKey
} from './paperSyncKeys'
import { getPapersDirPath } from '@main/services/paper/paperPaths'

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_EVENT_DEBOUNCE_MS = 2_000
/** pack manifest CAS 重试上限（meta/annotations 已改用 casPutWithMerge） */
const CAS_RETRY_LIMIT = 2
const MAX_SESSION_FILE_BYTES = 4 * 1024 * 1024

/** pack allowlist 文件正则（相对论文目录，正斜杠） */
const PACK_ALLOWLIST =
  /^(source\.pdf|translation\.json|merged\.md|pages\/[^/]+\.jpg|assets\/.+|ocr\/normalized\/[^/]+\.json)$/

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type PaperStorageLike = {
  /** data 为实际落盘字节（路径归一化后），供引擎以其 hash 作为 tracker 基线 */
  applySyncedMeta(
    paperId: string,
    meta: PaperDocument
  ): Promise<{ success: boolean; error?: string; data?: Uint8Array }>
  applySyncedAnnotations(
    paperId: string,
    store: PaperAnnotationStore
  ): Promise<{ success: boolean; error?: string }>
  applySyncedPackFile(
    paperId: string,
    relPath: string,
    stagingFilePath: string
  ): Promise<{ success: boolean; error?: string }>
  readMeta(paperId: string): Promise<{ success: boolean; data?: PaperDocument | null }>
  readAnnotationStore(
    paperId: string
  ): Promise<{ success: boolean; data?: PaperAnnotationStore | null }>
}
type PaperServiceLike = {
  applySyncedPaperDeletion(paperId: string): Promise<{ success: boolean; error?: string }>
}

/** RelayClient 子集（仅引擎用到的 session-files + blocks 方法） */
type RelayClientLike = {
  listSessionFiles(): Promise<SyncResult<{ sessions: { sessionId: string; version: number }[] }>>
  getSessionFile(key: string): Promise<SyncResult<{ bytes: Uint8Array; version: number | null }>>
  putSessionFile(
    key: string,
    baseVersion: number,
    bytes: Uint8Array
  ): Promise<SyncResult<{ version: number; size: number }>>
  deleteSessionFile(key: string, baseVersion: number): Promise<SyncResult<{ deleted: boolean }>>
  putBlock(blockId: string, ciphertext: Uint8Array): Promise<SyncResult<{ created: boolean }>>
  getBlock(blockId: string): Promise<SyncResult<{ bytes: Uint8Array }>>
  blocksMissing(ids: string[]): Promise<SyncResult<{ missing: string[] }>>
}

export interface PaperSyncServiceDeps {
  syncService: SyncServiceLike
  paperStorage: PaperStorageLike
  paperService: PaperServiceLike
  tracker: PaperSyncTracker
  broadcast: (state: PaperSyncState) => void
  papersDirProvider?: () => string
  intervalMs?: number
  eventDebounceMs?: number
}

function emptyResult(): PaperSyncResult {
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

/**
 * 计算 manifest 的稳定内容指纹（仅 files 部分，忽略 updatedAt 时间戳）。
 * 用于判断是否需要重新上行 manifest——文件集与块引用不变则视为未 dirty。
 */
function computeManifestFingerprint(paperId: string, files: PaperPackFileEntry[]): string {
  const stable = JSON.stringify({ schemaVersion: 1, paperId, files })
  return sha256Hex(new TextEncoder().encode(stable))
}

interface LocalPaperEntry {
  metaBytes?: Uint8Array
  metaHash?: string
  annotationsBytes?: Uint8Array
  annotationsHash?: string
  packFiles: Map<string, { absPath: string; size: number; mtime: string }>
}

export class PaperSyncService {
  private readonly deps: PaperSyncServiceDeps
  private readonly papersDir: () => string
  private readonly intervalMs: number
  private readonly eventDebounceMs: number

  private state: PaperSyncState = {
    phase: 'idle',
    lastSyncAt: null,
    lastResult: null,
    lastError: null,
    downloads: {}
  }
  private timer: ReturnType<typeof setInterval> | null = null
  private eventTimer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> | null = null
  private queued = false
  private rateLimitedUntil = 0
  /** 待执行的 pack 下载请求（paperId 队列，drain 内串行处理） */
  private pendingDownloads = new Set<string>()

  constructor(deps: PaperSyncServiceDeps) {
    this.deps = deps
    this.papersDir = deps.papersDirProvider ?? getPapersDirPath
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    this.eventDebounceMs = deps.eventDebounceMs ?? DEFAULT_EVENT_DEBOUNCE_MS
  }

  getState(): PaperSyncState {
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

  handlePaperEvent(): void {
    if (this.eventTimer) clearTimeout(this.eventTimer)
    this.eventTimer = setTimeout(() => {
      this.eventTimer = null
      this.kickoff()
    }, this.eventDebounceMs)
  }

  async syncNow(): Promise<SyncResult<PaperSyncResult>> {
    if (!this.isConnected())
      return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    // 限流窗口内明确返回 rate_limited，不拿上一轮陈旧结果冒充成功
    if (Date.now() < this.rateLimitedUntil) {
      return { success: false, code: 'rate_limited', error: '同步请求被限流，请稍后重试' }
    }
    this.kickoff()
    if (this.chain) await this.chain
    const last = this.state.lastResult
    if (this.state.phase === 'error') {
      return {
        success: false,
        code: 'unknown_error',
        error: this.state.lastError ?? '论文同步失败',
        data: last ?? undefined
      }
    }
    return { success: true, data: last ?? emptyResult() }
  }

  /** 触发懒下载（用户打开未下载论文时调用） */
  requestPaperPackDownload(paperId: string): void {
    this.pendingDownloads.add(paperId)
    this.kickoff()
  }

  private isConnected(): boolean {
    return this.deps.syncService.getStatus().connected
  }

  private setState(patch: Partial<PaperSyncState>): void {
    this.state = { ...this.state, ...patch }
    this.deps.broadcast(this.state)
  }

  private async drain(): Promise<void> {
    // 批次级下载块数汇总：下载在 runOnce 之后执行，且 syncNow/handlePaperEvent 的
    // 额外 kickoff 可能让 drain 多跑一轮空闲 runOnce 覆盖 lastResult——故在 drain
    // 结束时统一写回，保证 syncNow 拿到的 lastResult 含本批次全部下载块数
    let blocksDownloaded = 0
    try {
      while (this.queued || this.pendingDownloads.size > 0) {
        this.queued = false
        await this.runOnce()
        // drain 内处理待下载
        const toDownload = [...this.pendingDownloads]
        this.pendingDownloads.clear()
        for (const paperId of toDownload) {
          blocksDownloaded += await this.runPackDownload(paperId)
        }
      }
      if (blocksDownloaded > 0 && this.state.lastResult) {
        this.state.lastResult.blocksDownloaded += blocksDownloaded
        this.deps.broadcast(this.state)
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
        lastError: failed ? `${result.errors.length} 项论文同步失败` : null
      })
      logger.info('论文同步完成', 'main', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
        deletedLocal: result.deletedLocal,
        deletedRemote: result.deletedRemote,
        blocksUploaded: result.blocksUploaded,
        skipped: result.skipped,
        errors: result.errors.length
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ phase: 'error', lastError: message })
      logger.error('论文同步整轮失败', 'main', { error: message })
    }
  }

  /** 扫描本地论文目录，返回 paperId → { meta?, annotations?, packFiles } */
  private async scanLocal(): Promise<Map<string, LocalPaperEntry>> {
    const papers = new Map<string, LocalPaperEntry>()

    const dir = this.papersDir()
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      /* 目录不存在 */
    }

    for (const paperId of entries) {
      const paperDir = join(dir, paperId)
      try {
        const st = await stat(paperDir)
        if (!st.isDirectory()) continue
      } catch {
        continue
      }

      const entry: LocalPaperEntry = {
        packFiles: new Map<string, { absPath: string; size: number; mtime: string }>()
      }

      // meta.json（用注入的 papersDir 拼接，避免依赖全局 config 路径）
      try {
        const metaPath = join(paperDir, 'meta.json')
        const bytes = new Uint8Array(await readFile(metaPath))
        entry.metaBytes = bytes
        entry.metaHash = sha256Hex(bytes)
      } catch {
        /* 无 meta 跳过 */
      }

      // annotations.json
      try {
        const annPath = join(paperDir, 'annotations.json')
        const bytes = new Uint8Array(await readFile(annPath))
        entry.annotationsBytes = bytes
        entry.annotationsHash = sha256Hex(bytes)
      } catch {
        /* 无批注跳过（annotations.json 可能不存在） */
      }

      // pack allowlist 文件：递归扫描论文目录
      await this.scanPackFiles(paperDir, paperDir, entry.packFiles)

      papers.set(paperId, entry)
    }
    return papers
  }

  /** 递归扫描论文目录下符合 allowlist 的文件 */
  private async scanPackFiles(
    baseDir: string,
    currentDir: string,
    result: Map<string, { absPath: string; size: number; mtime: string }>
  ): Promise<void> {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(currentDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        // ocr 目录只取 normalized 子目录，不递归 raw
        if (entry.name === 'ocr' && currentDir === baseDir) {
          await this.scanPackFiles(baseDir, join(currentDir, 'normalized'), result)
          continue
        }
        if (entry.name === '.sync-staging') continue
        await this.scanPackFiles(baseDir, fullPath, result)
      } else if (entry.isFile()) {
        const relPath = fullPath.slice(baseDir.length + 1).replace(/\\/g, '/')
        if (!PACK_ALLOWLIST.test(relPath)) continue
        try {
          const st = await stat(fullPath)
          result.set(relPath, {
            absPath: fullPath,
            size: st.size,
            mtime: st.mtime.toISOString()
          })
        } catch {
          /* 跳过 */
        }
      }
    }
  }

  private async runSync(): Promise<PaperSyncResult> {
    const result = emptyResult()
    if (!this.isConnected()) return result
    const dek = this.deps.syncService.getDataKey()
    const client = this.deps.syncService.getClient() as unknown as RelayClientLike | null
    if (!dek || !client) return result

    const tracker = this.deps.tracker
    tracker.pruneTombstones()
    const trackedKeys = tracker.getData().keys

    // 阶段 0:扫描
    const localPapers = await this.scanLocal()
    // 构建 localKeyMap: key → { bytes, hash }（仅 meta/annotations，pack 单独走）
    const localKeyMap = new Map<string, { bytes: Uint8Array; hash: string }>()
    const localPaperIds = new Set<string>()
    for (const [paperId, entry] of localPapers) {
      localPaperIds.add(paperId)
      if (entry.metaHash) {
        localKeyMap.set(makePaperMetaKey(paperId), {
          bytes: entry.metaBytes!,
          hash: entry.metaHash
        })
      }
      if (entry.annotationsHash) {
        localKeyMap.set(makePaperAnnotationsKey(paperId), {
          bytes: entry.annotationsBytes!,
          hash: entry.annotationsHash
        })
      }
    }

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
        .filter((s) => isPaperKey(s.sessionId))
        .map((s) => [s.sessionId, s.version])
    )

    // (a) 本地上行删除：tracker 持有但本地已不存在的 key。
    // 论文以 paperId 为单位存在——meta/annotations/pack key 三者绑定：
    // 只要 paperId 对应的论文目录还在，三条 key 都视为本地存在（pack key 不
    // 进 localKeyMap，但论文目录存在即不应删除）；论文目录消失才删除全部 key。
    for (const key of Object.keys(trackedKeys)) {
      if (localKeyMap.has(key)) continue
      const parsed = parsePaperKey(key)
      if (parsed && localPaperIds.has(parsed.paperId)) {
        // 论文目录仍存在——pack key 不在 localKeyMap 是正常的，跳过删除
        continue
      }
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

      const parsed = parsePaperKey(key)
      if (!parsed) {
        result.errors.push({ key, message: 'key 解析失败' })
        continue
      }

      let plainBytes: Uint8Array
      try {
        if (parsed.kind === 'meta') plainBytes = openPaperMeta(dek, dl.data.bytes)
        else if (parsed.kind === 'annotations')
          plainBytes = openPaperAnnotations(dek, dl.data.bytes)
        else plainBytes = openPaperPack(dek, dl.data.bytes)
      } catch {
        result.errors.push({ key, message: '解密失败' })
        continue
      }

      if (parsed.kind === 'meta') {
        let remoteMeta: PaperDocument
        try {
          remoteMeta = JSON.parse(new TextDecoder().decode(plainBytes)) as PaperDocument
        } catch {
          result.errors.push({ key, message: 'meta JSON 解析失败' })
          continue
        }
        const localResult = await this.deps.paperStorage.readMeta(parsed.paperId)
        const localMeta = localResult.success ? (localResult.data ?? null) : null
        const merge = mergePaperMeta({ local: localMeta, remote: remoteMeta })
        if (!merge.changed) {
          // 本地更新胜（updatedAt 更新）：不采纳远端、不更新 tracker，让上行阶段把本地 dirty 推上去。
          // 若在此记远端版本/远端明文 hash，下一轮本地实际字节 ≠ tracked hash 会误判 dirty，
          // 且本地 updatedAt >= 远端 → 对端也下行 → 两机 meta 无限乒乓
          result.skipped++
          continue
        }
        const applyResult = await this.deps.paperStorage.applySyncedMeta(
          parsed.paperId,
          merge.merged
        )
        if (!applyResult.success) {
          result.errors.push({ key, message: `落盘失败：${applyResult.error}` })
          continue
        }
        // 已落盘则用实际落盘字节 hash：路径归一化会改写 filePath 等机器相关字段，
        // 若记远端明文 hash，下一轮扫描必判 dirty
        const contentHash = applyResult.data ? sha256Hex(applyResult.data) : sha256Hex(plainBytes)
        tracker.setKey(key, {
          version: dl.data.version ?? remoteVersion,
          contentHash
        })
        result.downloaded++
      } else if (parsed.kind === 'annotations') {
        let remoteStore: PaperAnnotationStore
        try {
          remoteStore = JSON.parse(new TextDecoder().decode(plainBytes)) as PaperAnnotationStore
        } catch {
          result.errors.push({ key, message: 'annotations JSON 解析失败' })
          continue
        }
        const localResult = await this.deps.paperStorage.readAnnotationStore(parsed.paperId)
        const localStore = localResult.success ? (localResult.data ?? null) : null
        const merge = mergePaperAnnotations({ local: localStore, remote: remoteStore })
        if (!merge.changed) {
          // 本地已含远端全部标注（并集无新增）：不采纳、不更新 tracker，避免记远端明文 hash 诱发乒乓
          result.skipped++
          continue
        }
        const applyResult = await this.deps.paperStorage.applySyncedAnnotations(
          parsed.paperId,
          merge.merged
        )
        if (!applyResult.success) {
          result.errors.push({ key, message: `落盘失败：${applyResult.error}` })
          continue
        }
        tracker.setKey(key, {
          version: dl.data.version ?? remoteVersion,
          contentHash: sha256Hex(plainBytes)
        })
        result.downloaded++
      } else {
        // pack manifest：解密存入 tracker.remoteManifest，不拉块（懒下载）
        const manifestJson = new TextDecoder().decode(plainBytes)
        const manifest = parsePaperPackManifest(manifestJson)
        if (!manifest) {
          result.errors.push({ key, message: 'pack manifest 解析失败' })
          continue
        }
        const pack = tracker.getPack(parsed.paperId)
        if (pack) {
          pack.remoteManifest = manifest
          pack.downloadState = 'remote'
        } else {
          tracker.setPack(parsed.paperId, {
            files: {},
            remoteManifest: manifest,
            downloadState: 'remote'
          })
        }
        tracker.setKey(key, {
          version: dl.data.version ?? remoteVersion,
          contentHash: computeManifestFingerprint(parsed.paperId, manifest.files)
        })
        result.downloaded++
      }
    }

    // (c) 远端删除 → 本地删除：以 meta key 为论文存在标记
    for (const [key, tracked] of Object.entries(trackedKeys)) {
      if (remoteMap.has(key)) continue
      const parsed = parsePaperKey(key)
      if (!parsed || parsed.kind !== 'meta') continue
      // 本地论文目录仍在？
      if (!localPaperIds.has(parsed.paperId)) continue
      // 有未同步修改？用 meta hash 判
      const localEntry = localPapers.get(parsed.paperId)
      if (localEntry?.metaHash && localEntry.metaHash !== tracked.contentHash) {
        // 本地有未同步修改 → 跳过防丢
        continue
      }
      const del = await this.deps.paperService.applySyncedPaperDeletion(parsed.paperId)
      if (!del.success) {
        result.errors.push({ key, message: `本地删除失败：${del.error ?? '未知'}` })
        continue
      }
      // 清理该论文所有 tracker keys + pack
      tracker.removeKey(makePaperMetaKey(parsed.paperId))
      tracker.removeKey(makePaperAnnotationsKey(parsed.paperId))
      tracker.removeKey(makePaperPackKey(parsed.paperId))
      tracker.removePack(parsed.paperId)
      result.deletedLocal++
    }

    // (d) 上行 dirty
    for (const [paperId, entry] of localPapers) {
      // meta
      if (entry.metaHash) {
        const key = makePaperMetaKey(paperId)
        const tracked = trackedKeys[key]
        if (!tracked || entry.metaHash !== tracked.contentHash) {
          await this.uploadSessionKey(
            client,
            dek,
            key,
            entry.metaBytes!,
            tracked?.version ?? 0,
            result,
            entry.metaHash
          )
        } else {
          result.skipped++
        }
      }
      // annotations
      if (entry.annotationsHash) {
        const key = makePaperAnnotationsKey(paperId)
        const tracked = trackedKeys[key]
        if (!tracked || entry.annotationsHash !== tracked.contentHash) {
          await this.uploadSessionKey(
            client,
            dek,
            key,
            entry.annotationsBytes!,
            tracked?.version ?? 0,
            result,
            entry.annotationsHash
          )
        } else {
          result.skipped++
        }
      }
      // pack
      await this.uploadPack(client, dek, paperId, entry.packFiles, result)
    }

    tracker.setLastSyncAt(new Date().toISOString())
    tracker.save()
    return result
  }

  /** 上行 session-files key（meta/annotations） */
  private async uploadSessionKey(
    client: RelayClientLike,
    dek: Uint8Array,
    key: string,
    bytes: Uint8Array,
    baseVersion: number,
    result: PaperSyncResult,
    contentHash: string
  ): Promise<void> {
    if (bytes.length + 40 > MAX_SESSION_FILE_BYTES) {
      result.errors.push({ key, message: '密文超过 4MiB 上限' })
      return
    }
    const parsed = parsePaperKey(key)
    const seal = parsed?.kind === 'meta' ? sealPaperMeta : sealPaperAnnotations
    const open = parsed?.kind === 'meta' ? openPaperMeta : openPaperAnnotations
    let currentBytes = bytes

    const outcome = await casPutWithMerge({
      initialBytes: bytes,
      initialBase: baseVersion,
      putFn: async (b, base) => client.putSessionFile(key, base, seal(dek, b)),
      onConflict: async () => {
        // 409：拉最新 → 解密 → merge → 落盘 → 重读
        const latest = await client.getSessionFile(key)
        if (!latest.success || !latest.data) {
          return { resolved: 'failed', error: '冲突后拉取失败' }
        }
        const nextBase = latest.data.version ?? 0
        let remoteBytes: Uint8Array
        try {
          remoteBytes = open(dek, latest.data.bytes)
        } catch {
          return { resolved: 'failed', error: '冲突合并解密失败' }
        }
        if (!parsed) {
          return { resolved: 'failed', error: '冲突合并 key 解析失败' }
        }
        try {
          if (parsed.kind === 'meta') {
            const remoteMeta = JSON.parse(new TextDecoder().decode(remoteBytes)) as PaperDocument
            const localResult = await this.deps.paperStorage.readMeta(parsed.paperId)
            const localMeta = localResult.success ? (localResult.data ?? null) : null
            const merge = mergePaperMeta({ local: localMeta, remote: remoteMeta })
            if (merge.changed) {
              const applyResult = await this.deps.paperStorage.applySyncedMeta(
                parsed.paperId,
                merge.merged
              )
              if (!applyResult.success) {
                return { resolved: 'failed', error: `冲突合并落盘失败：${applyResult.error}` }
              }
              if (applyResult.data) {
                currentBytes = applyResult.data
                return { resolved: 'rebased', bytes: applyResult.data, nextBase }
              }
            }
          } else {
            const remoteStore = JSON.parse(
              new TextDecoder().decode(remoteBytes)
            ) as PaperAnnotationStore
            const localResult = await this.deps.paperStorage.readAnnotationStore(parsed.paperId)
            const localStore = localResult.success ? (localResult.data ?? null) : null
            const merge = mergePaperAnnotations({ local: localStore, remote: remoteStore })
            if (merge.changed) {
              const applyResult = await this.deps.paperStorage.applySyncedAnnotations(
                parsed.paperId,
                merge.merged
              )
              if (!applyResult.success) {
                return { resolved: 'failed', error: `冲突合并落盘失败：${applyResult.error}` }
              }
            }
          }
        } catch {
          return { resolved: 'failed', error: '冲突合并 JSON 解析失败' }
        }
        // merge.changed===false（本地已是最新或更优）：保留本地字节重试
        return { resolved: 'rebased', bytes: currentBytes, nextBase }
      }
    })

    if (outcome.ok) {
      // meta 合并后落盘字节可能因路径归一化变化，用实际字节 hash 校正
      const finalHash = parsed?.kind === 'meta' ? sha256Hex(currentBytes) : contentHash
      this.deps.tracker.setKey(key, { version: outcome.version, contentHash: finalHash })
      result.uploaded++
    } else {
      result.errors.push({ key, message: outcome.error })
    }
  }

  /** 上行 pack：diff → 切块 → putBlock → manifest CAS */
  private async uploadPack(
    client: RelayClientLike,
    dek: Uint8Array,
    paperId: string,
    localPackFiles: Map<string, { absPath: string; size: number; mtime: string }>,
    result: PaperSyncResult
  ): Promise<void> {
    const tracker = this.deps.tracker
    const existing = tracker.getPack(paperId)
    const pack: TrackedPaperPack = existing ?? {
      files: {},
      remoteManifest: null,
      downloadState: 'local'
    }
    const trackedFiles = pack.files

    // diff：size+mtime 快判 → 变了才重算 sha256
    const manifestFiles: PaperPackFileEntry[] = []
    let hasChunkFailure = false
    for (const [relPath, localFile] of localPackFiles) {
      const tracked = trackedFiles[relPath]
      if (tracked && tracked.size === localFile.size && tracked.mtime === localFile.mtime) {
        // 未变：复用 blockIds
        manifestFiles.push({
          path: relPath,
          size: tracked.size,
          sha256: tracked.sha256,
          blockIds: tracked.blockIds
        })
        continue
      }
      // 变了：切块加密上传
      const blockIds: string[] = []
      try {
        const chunkResult = await chunkFile(localFile.absPath, async (chunk) => {
          const { blockId, ciphertext } = sealPaperBlock(dek, chunk)
          const missing = await client.blocksMissing([blockId])
          if (!missing.success || !missing.data) {
            throw new Error(`查询块缺失失败：${missing.error ?? missing.code ?? '未知错误'}`)
          }
          if (missing.data.missing.includes(blockId)) {
            const putBlock = await client.putBlock(blockId, ciphertext)
            // 失败必须抛错中止：否则 manifest 会引用 relay 上不存在的块，
            // 对端下载永远失败，且本地基线已复用该块引用而无法自愈
            if (!putBlock.success) {
              throw new Error(`块上传失败：${putBlock.error ?? putBlock.code ?? '未知错误'}`)
            }
            if (putBlock.data?.created) result.blocksUploaded++
          }
          blockIds.push(blockId)
        })
        manifestFiles.push({
          path: relPath,
          size: chunkResult.size,
          sha256: chunkResult.sha256,
          blockIds
        })
        // 更新 tracker files 基线
        trackedFiles[relPath] = {
          size: chunkResult.size,
          mtime: localFile.mtime,
          sha256: chunkResult.sha256,
          blockIds
        }
      } catch (error) {
        hasChunkFailure = true
        result.errors.push({
          key: makePaperPackKey(paperId),
          message: `文件切块失败 ${relPath}：${error instanceof Error ? error.message : String(error)}`
        })
      }
    }

    // 清理 tracker 中已不存在的文件
    for (const trackedPath of Object.keys(trackedFiles)) {
      if (!localPackFiles.has(trackedPath)) delete trackedFiles[trackedPath]
    }

    // 有文件切块/上传失败：本轮不上行 manifest（缺文件的 manifest 会让对端下载到
    // 不完整内容）。已上传的块内容寻址可复用，失败文件下轮重试
    if (hasChunkFailure) return

    // 懒下载场景：本地无 pack 文件但远端有 manifest 待下载 → 不上行空 manifest（防覆盖远端）
    if (manifestFiles.length === 0 && pack.remoteManifest) {
      return // 保留 remoteManifest，等待 requestPaperPackDownload 拉取
    }

    // 构建并上传 manifest
    const manifest: PaperPackManifest = {
      schemaVersion: 1,
      paperId,
      updatedAt: new Date().toISOString(),
      files: manifestFiles
    }
    const manifestJson = JSON.stringify(manifest)
    const manifestBytes = new TextEncoder().encode(manifestJson)
    if (manifestBytes.length + 40 > MAX_SESSION_FILE_BYTES) {
      result.errors.push({
        key: makePaperPackKey(paperId),
        message: 'pack manifest 超过 4MiB 上限'
      })
      return
    }
    const key = makePaperPackKey(paperId)
    const trackedKey = tracker.getData().keys[key]
    // 检查 manifest 是否 dirty：用稳定内容指纹（files 部分，忽略 updatedAt 时间戳）
    const lastManifestHash = trackedKey?.contentHash
    const currentManifestHash = computeManifestFingerprint(paperId, manifestFiles)
    if (trackedKey && lastManifestHash === currentManifestHash) {
      result.skipped++
      pack.downloadState = 'local'
      pack.remoteManifest = null
      tracker.setPack(paperId, pack)
      return
    }
    // CAS 上行
    let base = trackedKey?.version ?? 0
    for (let attempt = 0; attempt <= CAS_RETRY_LIMIT; attempt++) {
      const ct = sealPaperPack(dek, manifestBytes)
      const put = await client.putSessionFile(key, base, ct)
      if (put.success && put.data) {
        tracker.setKey(key, { version: put.data.version, contentHash: currentManifestHash })
        pack.downloadState = 'local'
        pack.remoteManifest = null
        tracker.setPack(paperId, pack)
        result.uploaded++
        return
      }
      if (put.code !== 'stale_session_file') {
        result.errors.push({
          key,
          message: `pack manifest 上传失败：${put.error ?? put.code}`
        })
        return
      }
      // pack manifest 是内容指纹 CAS（manifest 内为 blockId 列表，block 内容寻址且 PUT 幂等），
      // 冲突重推不会丢失对端数据：本设备 manifest 链只描述自己的文件→块映射，与对端 manifest 独立。
      // 故此处无需字段级 merge，拉最新版本号 re-base 重推即可。
      const latest = await client.getSessionFile(key)
      base = latest.data?.version ?? 0
    }
    result.errors.push({ key, message: 'pack manifest 版本冲突重试耗尽' })
  }

  /** 懒下载：拉缺失块 → 重组 → 校验 → 落盘；返回本轮下载的块数（供 drain 汇总） */
  private async runPackDownload(paperId: string): Promise<number> {
    const tracker = this.deps.tracker
    const pack = tracker.getPack(paperId)
    if (!pack?.remoteManifest) {
      logger.warn('pack 下载无远端 manifest', 'main', { paperId })
      return 0
    }
    const dek = this.deps.syncService.getDataKey()
    const client = this.deps.syncService.getClient() as unknown as RelayClientLike | null
    if (!dek || !client) return 0

    const remoteManifest = pack.remoteManifest
    let blocksDownloaded = 0
    try {
      const totalFiles = remoteManifest.files.length

      pack.downloadState = 'downloading'
      tracker.setPack(paperId, pack)
      this.updateDownloadProgress(paperId, 'downloading', 0, totalFiles)

      const paperDir = join(this.papersDir(), paperId)
      const stagingDir = join(paperDir, '.sync-staging')
      mkdirSync(stagingDir, { recursive: true })

      let doneFiles = 0
      let allOk = true
      for (const fileEntry of remoteManifest.files) {
        // 逐块拉取 → staging（路径安全性由 manifest 解析期校验与 applySyncedPackFile 保证）
        const blockBuffers: Buffer[] = []
        let allBlocksOk = true
        for (const blockId of fileEntry.blockIds) {
          const stagingBlockPath = join(stagingDir, blockId)
          if (existsSync(stagingBlockPath)) {
            blockBuffers.push(await readFile(stagingBlockPath))
            continue
          }
          // 拉取（重试 1 次）
          let blockBytes: Uint8Array | null = null
          for (let retry = 0; retry < 2; retry++) {
            const dl = await client.getBlock(blockId)
            if (dl.success && dl.data) {
              try {
                blockBytes = openPaperBlock(dek, dl.data.bytes)
                break
              } catch {
                /* 解密失败重试 */
              }
            }
          }
          if (!blockBytes) {
            allBlocksOk = false
            allOk = false
            break
          }
          writeFileSync(stagingBlockPath, blockBytes)
          blocksDownloaded++
          blockBuffers.push(Buffer.from(blockBytes))
        }
        if (!allBlocksOk) continue

        // 重组 + sha256 校验
        const reassembled = Buffer.concat(blockBuffers)
        const hash = createHash('sha256').update(reassembled).digest('hex')
        if (hash !== fileEntry.sha256) {
          logger.error('pack 下载 sha256 校验失败', 'main', { paperId, path: fileEntry.path })
          // 清掉该文件的 staging 块（可能是上次崩溃残留的半截写入），下轮重新拉取
          for (const blockId of fileEntry.blockIds) {
            try {
              rmSync(join(stagingDir, blockId), { force: true })
            } catch {
              /* 忽略清理失败 */
            }
          }
          allOk = false
          continue
        }

        // 落盘（写 staging 文件 → applySyncedPackFile 原子 rename）
        const stagingFilePath = join(stagingDir, `reassembled-${fileEntry.sha256}`)
        writeFileSync(stagingFilePath, reassembled)
        const applyResult = await this.deps.paperStorage.applySyncedPackFile(
          paperId,
          fileEntry.path,
          stagingFilePath
        )
        if (!applyResult.success) {
          allOk = false
          continue
        }

        // 清该文件的 staging 块
        for (const blockId of fileEntry.blockIds) {
          try {
            rmSync(join(stagingDir, blockId), { force: true })
          } catch {
            /* ignore */
          }
        }
        // 更新本地上行基线，避免下一轮把刚下行的文件再切一遍块
        const newBaseline: TrackedPaperPackFile = {
          size: fileEntry.size,
          mtime: new Date().toISOString(),
          sha256: fileEntry.sha256,
          blockIds: fileEntry.blockIds
        }
        pack.files[fileEntry.path] = newBaseline
        doneFiles++
        this.updateDownloadProgress(paperId, 'downloading', doneFiles, totalFiles)
      }

      if (allOk) {
        pack.downloadState = 'local'
        pack.remoteManifest = null
        rmSync(stagingDir, { recursive: true, force: true })
        this.updateDownloadProgress(paperId, 'local', totalFiles, totalFiles)
      } else {
        pack.downloadState = 'error'
        this.updateDownloadProgress(paperId, 'error', doneFiles, totalFiles)
      }
      tracker.setPack(paperId, pack)
      tracker.save()
      return blocksDownloaded
    } catch (error) {
      // 磁盘异常（ENOSPC/EACCES 等）不向上逃逸 drain：置 error 态，保留 staging 待重试
      pack.downloadState = 'error'
      tracker.setPack(paperId, pack)
      tracker.save()
      this.updateDownloadProgress(paperId, 'error', 0, remoteManifest.files.length)
      logger.error('pack 下载异常', 'main', {
        paperId,
        error: error instanceof Error ? error.message : String(error)
      })
      return blocksDownloaded
    }
  }

  private updateDownloadProgress(
    paperId: string,
    state: 'remote' | 'downloading' | 'local' | 'error',
    done: number,
    total: number
  ): void {
    this.state.downloads[paperId] = { state, doneBlocks: done, totalBlocks: total }
    this.deps.broadcast(this.state)
  }
}
