/**
 * ConfigSyncService 引擎单测：内存假 RelayClient + tmpdir 真实 config 文件。
 * 覆盖：未连接跳过、组内首次上行、远端更新下行、本机优先合并、CAS 重试、
 * 双设备稳态收敛（ping-pong 回归）、限流期 syncNow 拒绝。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import type { AppConfig } from '@shared/types/config'
import type { SyncResult, ManifestHead, ManifestListResult } from '@shared/types/sync'
import type { RelayClient } from '../transport/RelayClient'
import type { SyncService } from '../SyncService'
import { sealConfigBlock, sealManifest } from './configSnapshotCrypto'
import { serializeManifest, createConfigManifestEntry } from './configManifest'
import { ConfigSyncTracker } from './configSyncTracker'
import { ConfigSyncService } from './ConfigSyncService'

const DEK = new Uint8Array(randomBytes(32))
const DEVICE_ID = 'device-self-001'

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type ConfigManagerLike = {
  getConfig(): AppConfig | null
  saveConfig(config: AppConfig): { success: boolean; error?: string }
}

/** 内存假 RelayClient：实现 manifest/block 的 CAS 语义 */
class FakeRelayClient {
  /** per-device manifest 存储：deviceId → { bytes, version } */
  manifests = new Map<string, { bytes: Uint8Array; version: number; updatedAt: number }>()
  /** 内容寻址块存储：blockId → bytes */
  blocks = new Map<string, Uint8Array>()
  /** 下次 putSelfManifest 强制返回 stale（模拟 CAS 冲突） */
  forceStaleNext = false
  /** 持续 stale：每次 PUT 永远 stale 且版本 +1 */
  alwaysStale = false
  /** 已知 listManifests 返回（用于注入多设备 head） */
  injectedHeads: ManifestHead[] | null = null
  /** putSelfManifest 的"当前认证设备"（多设备测试时按调用方切换） */
  activeDeviceId = DEVICE_ID
  /** listManifests 恒返回 429（模拟限流） */
  rateLimitList = false

  async listManifests(): Promise<SyncResult<ManifestListResult>> {
    if (this.rateLimitList) {
      return {
        success: false,
        code: 'rate_limited',
        error: '请求过于频繁',
        extra: { retryAfterMs: 60_000 }
      }
    }
    if (this.injectedHeads) {
      return { success: true, data: { groupRevision: 1, heads: this.injectedHeads } }
    }
    const heads: ManifestHead[] = [...this.manifests.entries()].map(([deviceId, m]) => ({
      deviceId,
      currentVersion: m.version,
      updatedAt: m.updatedAt
    }))
    return { success: true, data: { groupRevision: 1, heads } }
  }

  async getManifest(
    deviceId: string,
    version: number
  ): Promise<SyncResult<{ bytes: Uint8Array; etag: string | null }>> {
    const m = this.manifests.get(deviceId)
    if (!m || m.version !== version) {
      return { success: false, code: 'manifest_not_found', error: '不存在' }
    }
    return { success: true, data: { bytes: m.bytes, etag: null } }
  }

  async putSelfManifest(
    baseVersion: number,
    ciphertext: Uint8Array
  ): Promise<SyncResult<{ version: number; idempotent: boolean }>> {
    const selfId = this.activeDeviceId
    if (this.alwaysStale) {
      const current = this.manifests.get(selfId)
      const newVersion = (current?.version ?? 0) + 1
      this.manifests.set(selfId, {
        bytes: current?.bytes ?? ciphertext,
        version: newVersion,
        updatedAt: Date.now()
      })
      return { success: false, code: 'stale_manifest', error: '版本过期' }
    }
    const current = this.manifests.get(selfId)
    const currentVersion = current?.version ?? 0
    if (this.forceStaleNext || currentVersion !== baseVersion) {
      this.forceStaleNext = false
      return { success: false, code: 'stale_manifest', error: '版本过期' }
    }
    const version = currentVersion + 1
    this.manifests.set(selfId, {
      bytes: ciphertext,
      version,
      updatedAt: Date.now()
    })
    return { success: true, data: { version, idempotent: false } }
  }

  async blocksMissing(ids: string[]): Promise<SyncResult<{ missing: string[] }>> {
    const missing = ids.filter((id) => !this.blocks.has(id))
    return { success: true, data: { missing } }
  }

  async putBlock(
    blockId: string,
    ciphertext: Uint8Array
  ): Promise<SyncResult<{ created: boolean }>> {
    const created = !this.blocks.has(blockId)
    this.blocks.set(blockId, ciphertext)
    return { success: true, data: { created } }
  }

  async getBlock(blockId: string): Promise<SyncResult<{ bytes: Uint8Array }>> {
    const bytes = this.blocks.get(blockId)
    if (!bytes) return { success: false, code: 'block_not_found', error: '不存在' }
    return { success: true, data: { bytes } }
  }

  /** 工具：用给定 config 文本上传一个其他设备的 manifest（模拟远端 head） */
  injectRemoteManifest(
    deviceId: string,
    configJson: string,
    mtime: string,
    version = 1,
    updatedAt = Date.now()
  ): void {
    const blockBytes = new TextEncoder().encode(configJson)
    const ct = sealConfigBlock(DEK, blockBytes)
    // blockId 为密文 sha256，与引擎 upload 的 sha256Hex(ct) 一致（遵循 Relay 服务端契约）
    const blockId = createHash('sha256').update(ct).digest('hex')
    this.blocks.set(blockId, ct)
    const entry = createConfigManifestEntry(mtime, blockBytes.length, blockId)
    const manifest = { schemaVersion: 1 as const, version, files: [entry] }
    const manifestCt = sealManifest(DEK, deviceId, serializeManifest(manifest))
    this.manifests.set(deviceId, { bytes: manifestCt, version, updatedAt })
  }
}

interface Harness {
  engine: ConfigSyncService
  relay: FakeRelayClient
  tracker: ConfigSyncTracker
  configManager: ConfigManagerLike
  dir: string
  configPath: string
  cleanup: () => void
}

function makeConfigJson(overrides: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify(
    {
      theme: { name: 'lumina-dark' },
      llm_config: {
        default_model: 'm1',
        compression_threshold: 10,
        enable_auto_compression: false,
        models: [{ base_url: 'http://x', api_key: 'k', model_name: 'm1' }]
      },
      mcpServers: {},
      ...overrides
    },
    null,
    2
  )
}

function makeHarness(
  connected = true,
  deviceId: string = DEVICE_ID,
  relay: FakeRelayClient = new FakeRelayClient()
): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-config-sync-engine-'))
  const configPath = join(dir, 'config.json')
  writeFileSync(configPath, makeConfigJson(), 'utf-8')
  const tracker = new ConfigSyncTracker(join(dir, 'config-sync.json'))
  const saveCalls: AppConfig[] = []
  let currentConfig: AppConfig | null = JSON.parse(readFileSync(configPath, 'utf-8'))
  const configManager: ConfigManagerLike = {
    getConfig: () => currentConfig,
    saveConfig: (config) => {
      saveCalls.push(config)
      // 模拟 ConfigManager：写盘 + 更新内存（经 migrateConfig 格式化）
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      currentConfig = JSON.parse(readFileSync(configPath, 'utf-8'))
      return { success: true }
    }
  }
  const syncService: SyncServiceLike = {
    getStatus: () =>
      ({
        connected,
        deviceId
      }) as ReturnType<SyncService['getStatus']>,
    getDataKey: () => DEK,
    getClient: () => relay as unknown as RelayClient
  }
  const engine = new ConfigSyncService({
    syncService,
    configManager,
    tracker,
    broadcast: () => {},
    configPathProvider: () => configPath
  })
  return {
    engine,
    relay,
    tracker,
    configManager,
    dir,
    configPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

test('未连接时 syncNow 返回 not_connected', async () => {
  const h = makeHarness(false)
  try {
    const result = await h.engine.syncNow()
    assert.equal(result.success, false)
    assert.equal(result.code, 'not_connected')
  } finally {
    h.cleanup()
  }
})

test('组内首次 + 本地 dirty → 上行新 manifest', async () => {
  const h = makeHarness()
  try {
    const result = await h.engine.syncNow()
    assert.equal(result.success, true)
    assert.ok(result.data)
    assert.equal(result.data.uploaded, 1)
    // relay 有了自己的 manifest head
    assert.ok(h.relay.manifests.has(DEVICE_ID))
    // tracker 记录了版本
    assert.ok(h.tracker.getData().selfManifestVersion > 0)
    assert.notEqual(h.tracker.getData().syncedConfigHash, '')
  } finally {
    h.cleanup()
  }
})

test('远端 head updatedAt 更新 + 本地干净 → 下行采纳', async () => {
  const h = makeHarness()
  try {
    // 先上行一次，建立基线
    await h.engine.syncNow()
    // 注入远端 head（其他设备，updatedAt 更新）
    const remoteConfig = makeConfigJson({ theme: { name: 'lumina-light' } })
    h.relay.injectRemoteManifest(
      'device-other',
      remoteConfig,
      '2099-01-01T00:00:00.000Z',
      1,
      Date.now() + 1000
    )
    // 重置本地 mtime 为更早（模拟本地干净但未变）
    // 注意：tracker.syncedConfigHash 已记录上行时的 hash，本地文件未变 → dirty=false
    const result = await h.engine.syncNow()
    assert.equal(result.success, true)
    assert.ok(result.data)
    assert.equal(result.data.downloaded, 1)
    // 落盘后 theme 变为远端
    const disk = JSON.parse(readFileSync(h.configPath, 'utf-8'))
    assert.equal(disk.theme.name, 'lumina-light')
    // 记录已应用远端 head，下一轮整轮 skipped（不再重复下载）
    assert.deepEqual(h.tracker.getData().appliedRemoteHead, {
      deviceId: 'device-other',
      version: 1
    })
    const again = await h.engine.syncNow()
    assert.equal(again.data?.skipped, 1)
    assert.equal(again.data?.downloaded, 0)
  } finally {
    h.cleanup()
  }
})

test('本机有同名 mcpServer + 远端改 theme → merged，保留本机 mcpServer', async () => {
  const h = makeHarness()
  try {
    // 本地有 mcpServer.local
    writeFileSync(
      h.configPath,
      makeConfigJson({
        mcpServers: { local: { name: 'local', transport: 'stdio', command: '/usr/local/bin/x' } }
      }),
      'utf-8'
    )
    await h.engine.syncNow() // 上行基线
    // 注入远端：改了 theme + 同名 mcpServer.command 不同
    h.relay.injectRemoteManifest(
      'device-other',
      makeConfigJson({
        theme: { name: 'lumina-light' },
        mcpServers: {
          local: { name: 'local', transport: 'stdio', command: '/remote/path/x' },
          remote: { name: 'remote', transport: 'sse', url: 'http://remote' }
        }
      }),
      '2099-01-01T00:00:00.000Z',
      1,
      Date.now() + 1000
    )
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.merged, 1)
    // 落盘：theme=远端，mcpServer.local.command=本机，mcpServer.remote=远端新增
    const disk = JSON.parse(readFileSync(h.configPath, 'utf-8'))
    assert.equal(disk.theme.name, 'lumina-light')
    assert.equal(disk.mcpServers.local.command, '/usr/local/bin/x')
    assert.ok(disk.mcpServers.remote)
  } finally {
    h.cleanup()
  }
})

test('远端最新即本设备 head + 本地干净 → skipped', async () => {
  const h = makeHarness()
  try {
    await h.engine.syncNow() // 上行
    const result = await h.engine.syncNow() // 再跑一轮：无变更
    assert.ok(result.data)
    assert.equal(result.data.skipped, 1)
    assert.equal(result.data.uploaded, 0)
  } finally {
    h.cleanup()
  }
})

test('config 内容未变（仅 mtime 变）→ dirty 为 false，整轮 skipped', async () => {
  const h = makeHarness()
  try {
    await h.engine.syncNow() // 上行基线
    // touch：内容不变，仅 mtime 变
    const content = readFileSync(h.configPath, 'utf-8')
    writeFileSync(h.configPath, content, 'utf-8')
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    // hash 未变 → dirty=false → skipped
    assert.equal(result.data.skipped, 1)
    assert.equal(result.data.uploaded, 0)
  } finally {
    h.cleanup()
  }
})

test('stale_manifest CAS 冲突重试成功', async () => {
  const h = makeHarness()
  try {
    await h.engine.syncNow()
    // 改本地 config 制造 dirty
    writeFileSync(h.configPath, makeConfigJson({ theme: { name: 'new-theme' } }), 'utf-8')
    // 第一次 PUT 强制 stale，第二次成功
    h.relay.forceStaleNext = true
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.uploaded, 1)
  } finally {
    h.cleanup()
  }
})

test('stale_manifest 重试耗尽 → errors', async () => {
  const h = makeHarness()
  try {
    await h.engine.syncNow()
    writeFileSync(h.configPath, makeConfigJson({ theme: { name: 'new' } }), 'utf-8')
    h.relay.alwaysStale = true
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.uploaded, 0)
    assert.ok(result.data.errors.length > 0)
  } finally {
    h.cleanup()
  }
})

test('限流期内 syncNow 返回 rate_limited（不拿陈旧结果冒充成功）', async () => {
  const h = makeHarness()
  try {
    h.relay.rateLimitList = true
    // 首轮：listManifests 被 429 → 整轮失败并记录限流恢复时间
    const first = await h.engine.syncNow()
    assert.equal(first.success, false)
    // 限流期内第二轮：直接返回 rate_limited
    const second = await h.engine.syncNow()
    assert.equal(second.success, false)
    assert.equal(second.code, 'rate_limited')
  } finally {
    h.cleanup()
  }
})

test('双设备收敛后进入稳态：后续轮次全 skipped，块数与 manifest 版本不膨胀', async () => {
  const relay = new FakeRelayClient()
  const a = makeHarness(true, 'device-A', relay)
  const b = makeHarness(true, 'device-B', relay)
  try {
    // A 的 config 内容不同且 mtime 更新（后写）→ B 首轮 winner=remote 下行采纳
    writeFileSync(a.configPath, makeConfigJson({ theme: { name: 'lumina-light' } }), 'utf-8')
    utimesSync(b.configPath, new Date('2026-08-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))

    // A 首次上行
    relay.activeDeviceId = 'device-A'
    const a1 = await a.engine.syncNow()
    assert.equal(a1.data?.uploaded, 1)

    // B 首轮：远端更新 → 下行采纳，theme 变 light
    relay.activeDeviceId = 'device-B'
    const b1 = await b.engine.syncNow()
    assert.equal(b1.data?.downloaded, 1)
    assert.equal(JSON.parse(readFileSync(b.configPath, 'utf-8')).theme.name, 'lumina-light')

    // 收敛后连跑数轮：不应再有上传/下载，块数与版本不增长（ping-pong 回归断言）
    const blockCount = relay.blocks.size
    for (let round = 0; round < 3; round++) {
      relay.activeDeviceId = 'device-B'
      const rb = await b.engine.syncNow()
      assert.equal(rb.data?.uploaded, 0, `B 第 ${round + 2} 轮不应上行`)
      assert.equal(rb.data?.downloaded, 0, `B 第 ${round + 2} 轮不应下行`)
      assert.equal(rb.data?.skipped, 1)
      relay.activeDeviceId = 'device-A'
      const ra = await a.engine.syncNow()
      assert.equal(ra.data?.uploaded, 0, `A 第 ${round + 2} 轮不应上行`)
      assert.equal(ra.data?.downloaded, 0, `A 第 ${round + 2} 轮不应下行`)
      assert.equal(ra.data?.skipped, 1)
    }
    assert.equal(relay.blocks.size, blockCount, '稳态不应产生新块')
    assert.equal(relay.manifests.get('device-A')?.version, 1, 'A manifest 版本不应膨胀')
    assert.equal(relay.manifests.has('device-B'), false, 'B 不应产生 manifest')
  } finally {
    a.cleanup()
    b.cleanup()
  }
})
