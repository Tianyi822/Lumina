/**
 * 会话快照同步双设备集成测试：真实 SyncService + SessionSyncService 直连运行中的 Relay。
 *
 * 运行前提：Relay 已启动（默认 http://localhost:8443，LUMINA_RELAY_URL 可覆盖）；
 * 服务不可用时整组跳过。两个 SyncService 实例 = 两台设备，各自注入独立的
 * 会话目录 / tracker / SessionStorageService，模拟双设备数据根。
 */
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { SessionStorageService } from '@main/services/session/SessionStorageService'
import type { SessionMessage } from '@shared/types/session'
import { SyncService } from '../SyncService'
import { RelayClient } from '../transport/RelayClient'
import { SessionSyncService } from './SessionSyncService'
import { SessionSyncTracker } from './sessionSyncTracker'

const RELAY_URL = process.env.LUMINA_RELAY_URL ?? 'http://localhost:8443'
let serverUp = false

before(async () => {
  try {
    const response = await fetch(`${RELAY_URL}/.well-known/lumina-relay`)
    serverUp = response.ok
  } catch {
    serverUp = false
  }
  if (!serverUp) console.error(`[联调] Relay 不可达（${RELAY_URL}），全部用例跳过`)
})

function skipIfDown(t: { skip: (msg?: string) => void }): boolean {
  if (!serverUp) {
    t.skip('Relay 未运行')
    return true
  }
  return false
}

/** 一台"设备"：真实 SyncService（连接/密钥）+ 独立数据根的同步引擎 */
interface DeviceSide {
  sync: SyncService
  engine: SessionSyncService
  storage: SessionStorageService
  tracker: SessionSyncTracker
  dir: string
}

async function makeDevice(): Promise<DeviceSide> {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-sync-device-'))
  const storage = new SessionStorageService(() => dir)
  await storage.initialize()
  const sync = new SyncService({
    createClient: (baseUrl) => new RelayClient(baseUrl, (url, init) => fetch(url, init))
  })
  const tracker = new SessionSyncTracker(join(dir, 'tracker.json'))
  const engine = new SessionSyncService({
    syncService: sync,
    storage,
    tracker,
    broadcast: () => {},
    sessionsDirProvider: () => dir
  })
  return { sync, engine, storage, tracker, dir }
}

function message(id: string, timestamp: string): SessionMessage {
  return { id, role: 'user', content: `内容-${id}`, timestamp }
}

async function createSessionFile(
  storage: SessionStorageService,
  sessionId: string,
  messageIds: string[]
): Promise<void> {
  await storage.rewriteSession({
    sessionId,
    title: '联调会话',
    sessionType: 'default',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T01:00:00.000Z',
    messages: messageIds.map((id, index) => message(id, `2026-08-01T01:0${index + 1}:00.000Z`))
  })
}

function readLocal(dir: string, sessionId: string): string | null {
  const path = join(dir, `${sessionId}.jsonl`)
  return existsSync(path) ? readFileSync(path, 'utf-8') : null
}

test('双设备会话同步闭环：上传 → 下载 → 双向追加合并 → 删除传播 → 复活', async (t) => {
  if (skipIfDown(t)) return
  const username = `isync-${randomBytes(4).toString('hex')}`
  const password = `pw-${randomBytes(6).toString('hex')}`

  const deviceA = await makeDevice()
  const deviceB = await makeDevice()
  try {
    // A 注册；B 登录同账号；A 生成六位码，B 兑换合并同步组
    const connectA = await deviceA.sync.connect(RELAY_URL, username, password)
    assert.equal(connectA.success, true, connectA.error)
    const connectB = await deviceB.sync.connect(RELAY_URL, username, password)
    assert.equal(connectB.success, true, connectB.error)
    assert.equal(connectB.data?.accountExists, true)
    const code = await deviceA.sync.generateSyncCode()
    assert.equal(code.success, true)
    const redeemed = await deviceB.sync.redeemSyncCode(code.data?.code ?? '')
    assert.equal(redeemed.success, true)

    // 1) A 上传新会话 → B 下行落盘
    await createSessionFile(deviceA.storage, 'session-900001-aaa01', ['m1'])
    const syncA1 = await deviceA.engine.syncNow()
    assert.equal(syncA1.success, true, syncA1.error)
    assert.equal(syncA1.data?.uploaded, 1)
    const syncB1 = await deviceB.engine.syncNow()
    assert.equal(syncB1.data?.downloaded, 1)
    const bText = readLocal(deviceB.dir, 'session-900001-aaa01')
    assert.ok(bText?.includes('m1'), 'B 端应落盘 A 的会话')

    // 2) B 追加 m2 上传 → A 下行
    await deviceB.storage.appendMessages('session-900001-aaa01', [
      message('m2', '2026-08-01T01:02:00.000Z')
    ])
    await deviceB.engine.syncNow()
    const syncA2 = await deviceA.engine.syncNow()
    assert.equal(syncA2.data?.downloaded, 1)
    assert.ok(readLocal(deviceA.dir, 'session-900001-aaa01')?.includes('m2'))

    // 3) 并发：A 追加 mA、B 追加 mB（都基于版本 2）→ 合并后两端都有
    await deviceA.storage.appendMessages('session-900001-aaa01', [
      message('mA', '2026-08-01T01:03:00.000Z')
    ])
    await deviceB.storage.appendMessages('session-900001-aaa01', [
      message('mB', '2026-08-01T01:04:00.000Z')
    ])
    await deviceA.engine.syncNow() // A 先推（base=2 → v3）
    const syncB3 = await deviceB.engine.syncNow() // B 拉 v3 合并（含 mA+mB）后回传（v4）
    assert.equal(syncB3.data?.merged, 1)
    await deviceA.engine.syncNow() // A 再拉 v4
    const finalA = readLocal(deviceA.dir, 'session-900001-aaa01') ?? ''
    const finalB = readLocal(deviceB.dir, 'session-900001-aaa01') ?? ''
    for (const id of ['m1', 'm2', 'mA', 'mB']) {
      assert.ok(finalA.includes(id), `A 端应包含 ${id}`)
      assert.ok(finalB.includes(id), `B 端应包含 ${id}`)
    }

    // 4) A 删除会话 → 远端删除 → B 下行删除
    await deviceA.storage.deleteSession('session-900001-aaa01')
    const syncA4 = await deviceA.engine.syncNow()
    assert.equal(syncA4.data?.deletedRemote, 1)
    const syncB4 = await deviceB.engine.syncNow()
    assert.equal(syncB4.data?.deletedLocal, 1)
    assert.equal(readLocal(deviceB.dir, 'session-900001-aaa01'), null)

    // 5) tombstone 语义：A 删除的会话被 B 复活 → A tombstone 期内补删不下载，最终两端一致删除
    await createSessionFile(deviceA.storage, 'session-900002-bbb02', ['x1'])
    await deviceA.engine.syncNow()
    await deviceB.engine.syncNow() // B 拿到 x1（双方 tracker 对齐 v1）
    await deviceB.storage.appendMessages('session-900002-bbb02', [
      message('x2', '2026-08-01T02:02:00.000Z')
    ]) // B 产生未同步变更
    await deviceA.storage.deleteSession('session-900002-bbb02')
    const syncA5 = await deviceA.engine.syncNow() // A 删除远端并记录 tombstone
    assert.equal(syncA5.data?.deletedRemote, 1)
    const syncB5 = await deviceB.engine.syncNow() // B：本地有变更 → 保留并重新上传（复活）
    assert.equal(readLocal(deviceB.dir, 'session-900002-bbb02')?.includes('x2'), true)
    assert.ok((syncB5.data?.uploaded ?? 0) >= 1, 'B 应重新上传该会话')
    const syncA6 = await deviceA.engine.syncNow() // A：tombstone 拦截复活 → 补删不下载
    assert.equal(syncA6.data?.deletedRemote, 1)
    assert.equal(readLocal(deviceA.dir, 'session-900002-bbb02'), null, 'A 端不得下载复活内容')
    const syncB6 = await deviceB.engine.syncNow() // B：远端被删且本地已无未同步变更 → 删除本地
    assert.equal(syncB6.data?.deletedLocal, 1)
    assert.equal(readLocal(deviceB.dir, 'session-900002-bbb02'), null, '最终两端一致删除')
  } finally {
    deviceA.engine.stop()
    deviceB.engine.stop()
    rmSync(deviceA.dir, { recursive: true, force: true })
    rmSync(deviceB.dir, { recursive: true, force: true })
  }
})
