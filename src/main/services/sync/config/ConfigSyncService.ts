/**
 * config 同步编排引擎：定时/手动/事件触发，拉取组内最新 manifest head，
 * 整文件 LWW + 本机优先合并，下行走 ConfigManager.saveConfig，上行走 block + manifest CAS。
 *
 * 原则：引擎是旁观者——下行只走 ConfigManager.saveConfig（不直接写 config.json），
 * 本地文件只读。DEK/RelayClient 经 SyncService 主进程内部接口获取。
 * 收敛保证：内容一致的远端 head 记录为 appliedRemoteHead，未变整轮 skipped；
 * 合并结果与远端/本地一致时不落盘、不上行，避免双设备交替推拉相同内容（ping-pong）。
 */
import { readFile, stat } from 'node:fs/promises'
import { logger } from '@main/services/logger'
import type { AppConfig } from '@shared/types/config'
import type { ConfigSyncResult, ConfigSyncState, SyncResult } from '@shared/types/sync'
import type { SyncService } from '../SyncService'
import { sha256Hex } from '../crypto/hash'
import { mergeConfig, collectMachineLocalKeys } from './configMerge'
import { serializeManifest, parseManifest, createConfigManifestEntry } from './configManifest'
import {
  openConfigBlock,
  sealConfigBlock,
  openManifest,
  sealManifest
} from './configSnapshotCrypto'
import { ConfigSyncTracker } from './configSyncTracker'

const DEFAULT_INTERVAL_MS = 60_000
const DEFAULT_EVENT_DEBOUNCE_MS = 2_000
const CAS_RETRY_LIMIT = 2

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type ConfigManagerLike = {
  getConfig(): AppConfig | null
  saveConfig(config: AppConfig): { success: boolean; error?: string }
}

export interface ConfigSyncServiceDeps {
  syncService: SyncServiceLike
  configManager: ConfigManagerLike
  tracker: ConfigSyncTracker
  /** 状态广播（session/index.ts 装配为 webContents.send） */
  broadcast: (state: ConfigSyncState) => void
  /** config.json 路径解析（测试注入） */
  configPathProvider?: () => string
  intervalMs?: number
  eventDebounceMs?: number
}

function emptyResult(): ConfigSyncResult {
  return { uploaded: 0, downloaded: 0, merged: 0, skipped: 0, errors: [] }
}

export class ConfigSyncService {
  private readonly syncService: SyncServiceLike
  private readonly configManager: ConfigManagerLike
  private readonly tracker: ConfigSyncTracker
  private readonly broadcast: (state: ConfigSyncState) => void
  private readonly configPath: () => string
  private readonly intervalMs: number
  private readonly eventDebounceMs: number

  private state: ConfigSyncState = {
    phase: 'idle',
    lastSyncAt: null,
    lastResult: null,
    lastError: null
  }
  private timer: ReturnType<typeof setInterval> | null = null
  private eventTimer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> | null = null
  private queued = false
  /** 429 限流恢复时间戳（毫秒）；运行时内存态，不持久化 */
  private rateLimitedUntil = 0

  constructor(deps: ConfigSyncServiceDeps) {
    this.syncService = deps.syncService
    this.configManager = deps.configManager
    this.tracker = deps.tracker
    this.broadcast = deps.broadcast
    this.configPath = deps.configPathProvider ?? (() => '')
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    this.eventDebounceMs = deps.eventDebounceMs ?? DEFAULT_EVENT_DEBOUNCE_MS
  }

  getState(): ConfigSyncState {
    return this.state
  }

  /** 启动定时同步（幂等；未连接不启动） */
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

  /** 触发一轮同步（去重合并）；限流期内忽略 */
  kickoff(): void {
    if (!this.isConnected()) return
    if (Date.now() < this.rateLimitedUntil) return
    this.queued = true
    if (!this.chain) {
      this.chain = this.drain()
    }
  }

  /** WebSocket manifest_updated 事件入口（去抖后触发） */
  handleConfigManifestEvent(): void {
    if (this.eventTimer) clearTimeout(this.eventTimer)
    this.eventTimer = setTimeout(() => {
      this.eventTimer = null
      this.kickoff()
    }, this.eventDebounceMs)
  }

  /** 手动触发并等待完成；限流期内直接返回 rate_limited（不拿上轮结果冒充成功） */
  async syncNow(): Promise<SyncResult<ConfigSyncResult>> {
    if (!this.isConnected()) {
      return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    }
    if (Date.now() < this.rateLimitedUntil) {
      return { success: false, code: 'rate_limited', error: '同步限流中，请稍后重试' }
    }
    this.kickoff()
    if (this.chain) await this.chain
    const last = this.state.lastResult
    if (this.state.phase === 'error') {
      return {
        success: false,
        code: 'unknown_error',
        error: this.state.lastError ?? '配置同步失败',
        data: last ?? undefined
      }
    }
    return { success: true, data: last ?? emptyResult() }
  }

  private isConnected(): boolean {
    return this.syncService.getStatus().connected
  }

  private getDeviceId(): string {
    return this.syncService.getStatus().deviceId ?? ''
  }

  private setState(patch: Partial<ConfigSyncState>): void {
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
        lastError: failed ? `${result.errors.length} 项配置同步失败` : null
      })
      logger.info('配置同步完成', 'main', {
        uploaded: result.uploaded,
        downloaded: result.downloaded,
        merged: result.merged,
        skipped: result.skipped,
        errors: result.errors.length
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.setState({ phase: 'error', lastError: message })
      logger.error('配置同步整轮失败', 'main', { error: message })
    }
  }

  private async runSync(): Promise<ConfigSyncResult> {
    const result = emptyResult()
    if (!this.isConnected()) return result
    const dek = this.syncService.getDataKey()
    const client = this.syncService.getClient()
    if (!dek || !client) return result

    const configPath = this.configPath()
    const deviceId = this.getDeviceId()

    // —— 阶段 0:读本地 config(只读) ——
    let localBytes: Buffer
    let localMtime: string
    try {
      localBytes = await readFile(configPath)
      const st = await stat(configPath)
      localMtime = st.mtime.toISOString()
    } catch (error) {
      throw new Error(
        `读取本地 config 失败：${error instanceof Error ? error.message : String(error)}`
      )
    }
    const localConfig = JSON.parse(localBytes.toString('utf-8')) as AppConfig
    const localHash = sha256Hex(new Uint8Array(localBytes))
    // dirty 判定：纯 hash 比较。config 仅 KB 级，内容不变即无需上行。
    // 注：sealConfigBlock 随机 nonce 使同明文密文不同，块级 dedup 不可达，故不做 mtime 触发的多余上行。
    const tracked = this.tracker.getData()
    const dirty = localHash !== tracked.syncedConfigHash
    const machineLocalKeys = collectMachineLocalKeys(localConfig)

    // —— 阶段 1:拉组内所有 manifest head,选 updatedAt 最新 ——
    const remoteList = await client.listManifests()
    if (!remoteList.success || !remoteList.data) {
      if (remoteList.code === 'rate_limited') {
        const retryAfterMs =
          typeof remoteList.extra?.retryAfterMs === 'number'
            ? remoteList.extra.retryAfterMs
            : this.intervalMs
        this.rateLimitedUntil = Date.now() + retryAfterMs
      }
      throw new Error(
        `拉取 manifest 列表失败：${remoteList.error ?? remoteList.code ?? '未知错误'}`
      )
    }
    const heads = remoteList.data.heads

    if (heads.length === 0) {
      // 组内首次:本设备是首推者
      if (dirty || this.tracker.getData().selfManifestVersion === 0) {
        await this.upload(client, dek, deviceId, configPath, result)
      } else {
        result.skipped++
      }
      this.finish(result)
      return result
    }

    // 按 updatedAt 降序取最新 head
    const latestHead = [...heads].sort((a, b) => b.updatedAt - a.updatedAt)[0]
    const isSelfHead = latestHead.deviceId === deviceId

    // —— 阶段 2:判断是否需要下行 ——
    if (isSelfHead && latestHead.currentVersion <= this.tracker.getData().selfManifestVersion) {
      // 远端最新就是我自己推的
      if (!dirty) {
        result.skipped++
        this.finish(result)
        return result
      }
      // 本地 dirty → 上行新版本
      await this.upload(client, dek, deviceId, configPath, result)
      this.finish(result)
      return result
    }

    // 远端 head 与上次应用的一致（已收敛）：本地干净 → 整轮 skipped（不再重复下载 manifest+块）；
    // 本地在已应用状态之上有新改动 → 直接上行（远端快照未变，无需重新下载合并）
    const applied = this.tracker.getData().appliedRemoteHead
    if (
      applied &&
      applied.deviceId === latestHead.deviceId &&
      applied.version === latestHead.currentVersion
    ) {
      if (!dirty) {
        result.skipped++
        this.finish(result)
        return result
      }
      await this.upload(client, dek, deviceId, configPath, result)
      this.finish(result)
      return result
    }

    // —— 阶段 3:下行(远端有新快照) ——
    const manifestResp = await client.getManifest(latestHead.deviceId, latestHead.currentVersion)
    if (!manifestResp.success || !manifestResp.data) {
      if (manifestResp.code !== 'manifest_not_found') {
        result.errors.push({
          message: `下载 manifest 失败：${manifestResp.error ?? manifestResp.code}`
        })
      }
      this.finish(result)
      return result
    }
    let manifest
    try {
      const manifestPlain = openManifest(dek, latestHead.deviceId, manifestResp.data.bytes)
      manifest = parseManifest(manifestPlain)
    } catch (error) {
      result.errors.push({
        message: `manifest 解密/解析失败：${error instanceof Error ? error.message : String(error)}`
      })
      this.finish(result)
      return result
    }
    const entry = manifest.files[0]

    const blockResp = await client.getBlock(entry.blockId)
    if (!blockResp.success || !blockResp.data) {
      result.errors.push({ message: `下载 config 块失败：${blockResp.error ?? blockResp.code}` })
      this.finish(result)
      return result
    }
    let remoteConfig: AppConfig
    try {
      const remoteBytes = openConfigBlock(dek, blockResp.data.bytes)
      remoteConfig = JSON.parse(new TextDecoder().decode(remoteBytes)) as AppConfig
    } catch (error) {
      result.errors.push({
        message: `config 块解密失败：${error instanceof Error ? error.message : String(error)}`
      })
      this.finish(result)
      return result
    }

    const merge = mergeConfig({
      local: localConfig,
      localMtime,
      remote: remoteConfig,
      remoteMtime: entry.mtime,
      machineLocalKeys
    })

    if (merge.winner === 'remote') {
      // 采纳远端：内容确与本地不同才落盘——相同字节重写会 bump mtime，诱发对端假性上行
      if (merge.changed) {
        const save = this.configManager.saveConfig(merge.merged)
        if (!save.success) {
          result.errors.push({ message: `落盘失败：${save.error ?? '未知错误'}` })
          this.finish(result)
          return result
        }
        result.downloaded++
      } else {
        result.skipped++
      }
      // 读回真实字节重算 hash（saveConfig 可能刚格式化过，磁盘字节 ≠ 合并对象序列化）
      const rereadHash = await this.rereadConfigHash(configPath)
      this.tracker.setSyncedConfig(rereadHash)
      this.tracker.setAppliedRemoteHead(latestHead.deviceId, latestHead.currentVersion)
      this.finish(result)
      return result // 采纳远端,不推 manifest
    }

    // winner === 'local' 或 'merged'：可能落盘合并结果后上行
    if (merge.changed) {
      const save = this.configManager.saveConfig(merge.merged)
      if (!save.success) {
        result.errors.push({ message: `落盘失败：${save.error ?? '未知错误'}` })
        this.finish(result)
        return result
      }
      if (merge.winner === 'merged') result.merged++
    }
    // 合并结果与远端一致：组内状态已收敛，记录 appliedRemoteHead 后整轮 skipped，
    // 不再上行相同内容（否则双设备会交替下载/上行，manifest 版本与孤儿块无限膨胀）
    if (JSON.stringify(merge.merged) === JSON.stringify(remoteConfig)) {
      const rereadHash = await this.rereadConfigHash(configPath)
      this.tracker.setSyncedConfig(rereadHash)
      this.tracker.setAppliedRemoteHead(latestHead.deviceId, latestHead.currentVersion)
      result.skipped++
      this.finish(result)
      return result
    }
    await this.upload(client, dek, deviceId, configPath, result)
    this.finish(result)
    return result
  }

  /** 读回 config.json 真实字节 hash（落盘后调用，保证 tracker 与磁盘一致） */
  private async rereadConfigHash(configPath: string): Promise<string> {
    const bytes = await readFile(configPath)
    return sha256Hex(new Uint8Array(bytes))
  }

  /** 阶段 4:上行（推 block + 新 manifest，CAS 重试） */
  private async upload(
    client: NonNullable<ReturnType<SyncServiceLike['getClient']>>,
    dek: Uint8Array,
    deviceId: string,
    configPath: string,
    result: ConfigSyncResult
  ): Promise<void> {
    for (let attempt = 0; attempt <= CAS_RETRY_LIMIT; attempt++) {
      // 重新读盘：下行 saveConfig 可能刚改了文件
      let bytes: Buffer
      let mtime: string
      try {
        bytes = await readFile(configPath)
        const st = await stat(configPath)
        mtime = st.mtime.toISOString()
      } catch (error) {
        result.errors.push({
          message: `读取本地 config 失败：${error instanceof Error ? error.message : String(error)}`
        })
        return
      }
      const plainBytes = new Uint8Array(bytes)
      const ct = sealConfigBlock(dek, plainBytes)
      // blockId 为密文 sha256，遵循 Relay 服务端契约：PUT /blocks/:blockId 要求 sha256(body)==blockId，
      // body 即密文 octet-stream。sealConfigBlock 随机 nonce 导致同明文密文不同，
      // 因此无法做内容级 dedup（config 仅 KB 级，可接受）。
      const blockId = sha256Hex(ct)

      // 块内容寻址、幂等：先查重，缺才传
      const missing = await client.blocksMissing([blockId])
      if (!missing.success || !missing.data) {
        result.errors.push({ message: `块查重失败：${missing.error ?? missing.code}` })
        return
      }
      if (missing.data.missing.includes(blockId)) {
        const putBlock = await client.putBlock(blockId, ct)
        if (!putBlock.success) {
          result.errors.push({ message: `块上传失败：${putBlock.error ?? putBlock.code}` })
          return
        }
      }

      const entry = createConfigManifestEntry(mtime, plainBytes.length, blockId)
      const manifestVersion = this.tracker.getData().selfManifestVersion + 1
      const manifest = { schemaVersion: 1 as const, version: manifestVersion, files: [entry] }
      const manifestCt = sealManifest(dek, deviceId, serializeManifest(manifest))

      const put = await client.putSelfManifest(
        this.tracker.getData().selfManifestVersion,
        manifestCt
      )
      if (put.success && put.data) {
        this.tracker.setSelfManifest(put.data.version)
        // 读回 config.json 真实字节算 hash（saveConfig 可能刚格式化过，磁盘字节 ≠ plainBytes）
        const rereadHash = await this.rereadConfigHash(configPath)
        this.tracker.setSyncedConfig(rereadHash)
        result.uploaded++
        return
      }
      if (put.code !== 'stale_manifest') {
        result.errors.push({ message: `manifest 上传失败：${put.error ?? put.code}` })
        return
      }
      // stale_manifest：本设备 manifest 链的 base 过时。config 是「每设备一条 manifest 行」，
      // 与对端 manifest 独立；本地 config 已在下行阶段（mergeConfig）合并为最新态，
      // 故此处无需重新合并，拉自己最新 head 重算 base 重推即可。
      const selfList = await client.listManifests()
      if (selfList.success && selfList.data) {
        const selfHead = selfList.data.heads.find((h) => h.deviceId === deviceId)
        this.tracker.setSelfManifest(selfHead?.currentVersion ?? 0)
      }
      // 继续重试
    }
    result.errors.push({ message: '版本冲突重试耗尽' })
  }

  private finish(_result: ConfigSyncResult): void {
    this.tracker.setLastSyncAt(new Date().toISOString())
    this.tracker.save()
  }
}
