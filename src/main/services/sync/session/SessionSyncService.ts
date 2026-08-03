/**
 * 会话快照同步编排引擎：定时/手动/事件触发，串行推拉，行级合并，删除双向传播。
 *
 * 原则：引擎是旁观者——下行落盘只走 SessionStorageService（同一实例的写队列），
 * 不直接写业务文件；本地文件只读。DEK/RelayClient 经 SyncService 主进程内部接口获取。
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from '@main/services/logger'
import type { SessionStorageService } from '@main/services/session/SessionStorageService'
import {
  getDataDirPath,
  getSessionJsonlFileName,
  isValidSessionId
} from '@main/services/session/sessionPaths'
import type { SessionSyncResult, SessionSyncState, SyncResult } from '@shared/types/sync'
import type { SyncService } from '../SyncService'
import { sha256Hex } from '../crypto/hash'
import { mergeSessionJsonl, parseSessionJsonl } from './sessionSnapshotMerge'
import { openSessionSnapshot, sealSessionSnapshot } from './sessionSnapshotCrypto'
import { SessionSyncTracker } from './sessionSyncTracker'

/** Relay 会话快照密文上限（FRONTEND_INTEGRATION.md maxSessionFileBytes） */
const MAX_SESSION_FILE_BYTES = 4 * 1024 * 1024
/** nonce24 + tag16 的密文开销 */
const CIPHER_OVERHEAD_BYTES = 40
/** CAS 冲突合并重试上限 */
const CAS_RETRY_LIMIT = 2

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_EVENT_DEBOUNCE_MS = 2_000

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type SessionStorageLike = Pick<SessionStorageService, 'rewriteSession' | 'deleteSession'>

export interface SessionSyncServiceDeps {
  syncService: SyncServiceLike
  storage: SessionStorageLike
  tracker: SessionSyncTracker
  /** 状态广播（session/index.ts 装配为 webContents.send） */
  broadcast: (state: SessionSyncState) => void
  /** 会话目录解析（测试注入） */
  sessionsDirProvider?: () => string
  intervalMs?: number
  eventDebounceMs?: number
}

interface LocalSessionFile {
  bytes: Uint8Array
  hash: string
}

function emptyResult(): SessionSyncResult {
  return {
    uploaded: 0,
    downloaded: 0,
    merged: 0,
    deletedLocal: 0,
    deletedRemote: 0,
    skipped: 0,
    errors: []
  }
}

export class SessionSyncService {
  private readonly syncService: SyncServiceLike
  private readonly storage: SessionStorageLike
  private readonly tracker: SessionSyncTracker
  private readonly broadcast: (state: SessionSyncState) => void
  private readonly sessionsDirProvider: () => string
  private readonly intervalMs: number
  private readonly eventDebounceMs: number

  private state: SessionSyncState = {
    phase: 'idle',
    lastSyncAt: null,
    lastResult: null,
    lastError: null
  }
  private timer: ReturnType<typeof setInterval> | null = null
  private eventTimer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> | null = null
  private queued = false
  /** 429 限流后的恢复时间戳（毫秒）；在此之前 kickoff 直接忽略 */
  private rateLimitedUntil = 0

  constructor(deps: SessionSyncServiceDeps) {
    this.syncService = deps.syncService
    this.storage = deps.storage
    this.tracker = deps.tracker
    this.broadcast = deps.broadcast
    this.sessionsDirProvider = deps.sessionsDirProvider ?? getDataDirPath
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    this.eventDebounceMs = deps.eventDebounceMs ?? DEFAULT_EVENT_DEBOUNCE_MS
  }

  getState(): SessionSyncState {
    return this.state
  }

  /** 启动定时同步（幂等；未连接时不启动） */
  start(): void {
    if (this.timer || !this.isConnected()) return
    this.timer = setInterval(() => this.kickoff(), this.intervalMs)
    this.timer.unref()
    this.kickoff()
  }

  /** 停止定时器与事件去抖（断开/吊销时调用） */
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

  /** 触发一轮同步（去重合并：运行中只置标记，结束后补跑一轮）；限流期内忽略 */
  kickoff(): void {
    if (!this.isConnected()) return
    if (Date.now() < this.rateLimitedUntil) return
    this.queued = true
    if (!this.chain) {
      this.chain = this.drain()
    }
  }

  /** WebSocket session_file_* 事件入口（去抖后触发） */
  handleSessionFileEvent(): void {
    if (this.eventTimer) clearTimeout(this.eventTimer)
    this.eventTimer = setTimeout(() => {
      this.eventTimer = null
      this.kickoff()
    }, this.eventDebounceMs)
  }

  /** 手动触发并等待完成 */
  async syncNow(): Promise<SyncResult<SessionSyncResult>> {
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
        error: this.state.lastError ?? '会话同步失败',
        data: last ?? undefined
      }
    }
    return { success: true, data: last ?? emptyResult() }
  }

  private isConnected(): boolean {
    return this.syncService.getStatus().connected
  }

  private setState(patch: Partial<SessionSyncState>): void {
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
        lastError: failed ? `${result.errors.length} 个会话同步失败` : null
      })
      logger.info('会话同步完成', 'main', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
        merged: result.merged,
        deletedLocal: result.deletedLocal,
        deletedRemote: result.deletedRemote,
        skipped: result.skipped,
        errors: result.errors.length
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ phase: 'error', lastError: message })
      logger.error('会话同步整轮失败', 'main', { error: message })
    }
  }

  /** 读取本地会话文件字节与 hash；失败返回 null */
  private async readLocal(dir: string, sessionId: string): Promise<LocalSessionFile | null> {
    try {
      const bytes = new Uint8Array(await readFile(join(dir, getSessionJsonlFileName(sessionId))))
      return { bytes, hash: sha256Hex(bytes) }
    } catch {
      return null
    }
  }

  private async runSync(): Promise<SessionSyncResult> {
    const result = emptyResult()
    if (!this.isConnected()) return result
    const dek = this.syncService.getDataKey()
    const client = this.syncService.getClient()
    if (!dek || !client) return result

    const tracker = this.tracker
    tracker.pruneTombstones()
    const data = tracker.getData()

    const remoteList = await client.listSessionFiles()
    if (!remoteList.success || !remoteList.data) {
      if (remoteList.code === 'rate_limited') {
        const retryAfterMs =
          typeof remoteList.extra?.retryAfterMs === 'number'
            ? remoteList.extra.retryAfterMs
            : this.intervalMs
        this.rateLimitedUntil = Date.now() + retryAfterMs
      }
      throw new Error(`拉取会话列表失败：${remoteList.error ?? remoteList.code ?? '未知错误'}`)
    }
    const remote = new Map(remoteList.data.sessions.map((s) => [s.sessionId, s.version]))

    // 扫描本地会话文件（忽略非 .jsonl 与非法命名）
    const dir = this.sessionsDirProvider()
    const localMap = new Map<string, LocalSessionFile>()
    let files: string[] = []
    try {
      files = await readdir(dir)
    } catch {
      // 目录不存在视为空
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const sessionId = file.slice(0, -'.jsonl'.length)
      if (!isValidSessionId(sessionId)) continue
      const local = await this.readLocal(dir, sessionId)
      if (local) localMap.set(sessionId, local)
    }

    // 1) 本地上行删除：tracker 有记录 + 本地文件消失
    for (const sessionId of Object.keys(data.sessions)) {
      if (localMap.has(sessionId)) continue
      const remoteVersion = remote.get(sessionId)
      if (remoteVersion === undefined) {
        tracker.removeSession(sessionId)
        continue
      }
      const del = await client.deleteSessionFile(sessionId, remoteVersion)
      if (del.success || del.code === 'session_file_not_found') {
        tracker.removeSession(sessionId)
        tracker.setTombstone(sessionId, new Date().toISOString())
        if (del.success && del.data?.deleted) result.deletedRemote++
      } else {
        result.errors.push({ sessionId, message: `删除远端失败：${del.error ?? del.code}` })
      }
    }

    // 2) 下行：远端版本领先则下载；本地有未同步变更则行级合并
    const pendingUpload = new Set<string>()
    for (const [sessionId, remoteVersion] of remote) {
      if (tracker.getTombstone(sessionId)) {
        // 本端已删除、对端复活 → 补删不下载
        const del = await client.deleteSessionFile(sessionId, remoteVersion)
        if (del.success && del.data?.deleted) result.deletedRemote++
        continue
      }
      const tracked = data.sessions[sessionId]
      const local = localMap.get(sessionId)
      const localDirty = local !== undefined && (!tracked || local.hash !== tracked.contentHash)
      const remoteAhead = !tracked || remoteVersion > tracked.version
      if (!remoteAhead) continue

      const dl = await client.getSessionFile(sessionId)
      if (!dl.success || !dl.data) {
        if (dl.code !== 'session_file_not_found') {
          result.errors.push({ sessionId, message: `下载失败：${dl.error ?? dl.code}` })
        }
        continue
      }
      const confirmedVersion = dl.data.version ?? remoteVersion
      let remoteText: string
      try {
        remoteText = Buffer.from(openSessionSnapshot(dek, sessionId, dl.data.bytes)).toString(
          'utf-8'
        )
      } catch {
        result.errors.push({ sessionId, message: '解密失败' })
        continue
      }

      if (local === undefined || !localDirty) {
        const parsed = parseSessionJsonl(remoteText)
        if (!parsed.meta) {
          result.errors.push({ sessionId, message: '远端内容无法解析' })
          continue
        }
        await this.storage.rewriteSession({ ...parsed.meta, messages: parsed.messages })
        const disk = await this.readLocal(dir, sessionId)
        if (disk) localMap.set(sessionId, disk)
        tracker.setSession(sessionId, {
          version: confirmedVersion,
          contentHash: disk?.hash ?? sha256Hex(new Uint8Array(0))
        })
        result.downloaded++
        continue
      }

      const merged = mergeSessionJsonl(Buffer.from(local.bytes).toString('utf-8'), remoteText)
      if (!merged.meta) {
        result.errors.push({ sessionId, message: '合并失败：meta 不可用' })
        continue
      }
      await this.storage.rewriteSession({ ...merged.meta, messages: merged.messages })
      const disk = await this.readLocal(dir, sessionId)
      if (disk) localMap.set(sessionId, disk)
      tracker.setSession(sessionId, {
        version: confirmedVersion,
        contentHash: disk?.hash ?? local.hash
      })
      result.merged++
      if (merged.content !== remoteText) pendingUpload.add(sessionId)
    }

    // 3) 远端删除 → 下行删除：tracker 有记录 + 本地存在 + 远端消失
    for (const [sessionId, tracked] of Object.entries(data.sessions)) {
      if (remote.has(sessionId)) continue
      const local = localMap.get(sessionId)
      if (!local) continue // 已在 (1) 处理
      if (local.hash !== tracked.contentHash) continue // 本地有未同步变更 → 保留，上行阶段复活
      await this.storage.deleteSession(sessionId)
      tracker.removeSession(sessionId)
      localMap.delete(sessionId)
      result.deletedLocal++
    }

    // 4) 上行：dirty 会话 + 合并回传集合
    for (const sessionId of new Set([...localMap.keys(), ...pendingUpload])) {
      const local = localMap.get(sessionId)
      if (!local) continue
      const tracked = tracker.getData().sessions[sessionId]
      const dirty = !tracked || local.hash !== tracked.contentHash
      if (!dirty && !pendingUpload.has(sessionId)) {
        result.skipped++
        continue
      }
      if (result.errors.some((e) => e.sessionId === sessionId)) continue // 本轮出错的跳过，防覆盖未合并内容
      await this.uploadSession(
        client,
        dek,
        sessionId,
        dir,
        remote.get(sessionId) ?? 0,
        result,
        localMap
      )
    }

    tracker.setLastSyncAt(new Date().toISOString())
    tracker.save()
    return result
  }

  /** 单会话上行（含 409 合并重试） */
  private async uploadSession(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    sessionId: string,
    dir: string,
    baseVersion: number,
    result: SessionSyncResult,
    localMap: Map<string, LocalSessionFile>
  ): Promise<void> {
    let current = await this.readLocal(dir, sessionId)
    if (!current) return
    let base = baseVersion
    for (let attempt = 0; attempt <= CAS_RETRY_LIMIT; attempt++) {
      if (current.bytes.byteLength + CIPHER_OVERHEAD_BYTES > MAX_SESSION_FILE_BYTES) {
        result.errors.push({ sessionId, message: '密文超过 4MiB 上限，已跳过' })
        return
      }
      const put = await client.putSessionFile(
        sessionId,
        base,
        sealSessionSnapshot(dek, sessionId, current.bytes)
      )
      if (put.success && put.data) {
        this.tracker.setSession(sessionId, { version: put.data.version, contentHash: current.hash })
        result.uploaded++
        return
      }
      if (put.code !== 'stale_session_file') {
        result.errors.push({ sessionId, message: `上传失败：${put.error ?? put.code}` })
        return
      }
      // 409：拉最新 → 合并落盘 → 以最新版本重试
      const latest = await client.getSessionFile(sessionId)
      if (!latest.success || !latest.data) {
        result.errors.push({ sessionId, message: '冲突后拉取最新版本失败' })
        return
      }
      let remoteText: string
      try {
        remoteText = Buffer.from(openSessionSnapshot(dek, sessionId, latest.data.bytes)).toString(
          'utf-8'
        )
      } catch {
        result.errors.push({ sessionId, message: '冲突合并解密失败' })
        return
      }
      const merged = mergeSessionJsonl(Buffer.from(current.bytes).toString('utf-8'), remoteText)
      if (!merged.meta) {
        result.errors.push({ sessionId, message: '冲突合并失败：meta 不可用' })
        return
      }
      await this.storage.rewriteSession({ ...merged.meta, messages: merged.messages })
      const disk = await this.readLocal(dir, sessionId)
      if (!disk) {
        result.errors.push({ sessionId, message: '合并落盘后读取失败' })
        return
      }
      localMap.set(sessionId, disk)
      current = disk
      base = latest.data.version ?? base + 1
      result.merged++
    }
    result.errors.push({ sessionId, message: '版本冲突重试耗尽' })
  }
}
