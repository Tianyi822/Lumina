/**
 * SessionSyncService 引擎单测：内存假 RelayClient + tmpdir 真实存储层。
 * 覆盖：未连接跳过、上传新建、下行落盘、双端合并、删除双向、解密失败、4MiB 上限。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { SyncResult } from '@shared/types/sync'
import type { RelayClient } from '../transport/RelayClient'
import type { SyncService } from '../SyncService'
import { SessionStorageService } from '@main/services/session/SessionStorageService'
import { openSessionSnapshot, sealSessionSnapshot } from './sessionSnapshotCrypto'
import { SessionSyncService } from './SessionSyncService'
import { SessionSyncTracker } from './sessionSyncTracker'

const DEK = new Uint8Array(randomBytes(32))

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>

/** 内存假 RelayClient：实现 session-files 的 CAS 语义 */
class FakeRelayClient {
  files = new Map<string, { bytes: Uint8Array; version: number }>()

  async listSessionFiles(): Promise<
    SyncResult<{
      sessions: { sessionId: string; version: number; size: number; updatedAt: number }[]
    }>
  > {
    return {
      success: true,
      data: {
        sessions: [...this.files.entries()].map(([sessionId, f]) => ({
          sessionId,
          version: f.version,
          size: f.bytes.length,
          updatedAt: 0
        }))
      }
    }
  }

  async getSessionFile(
    sessionId: string
  ): Promise<SyncResult<{ bytes: Uint8Array; version: number | null }>> {
    const file = this.files.get(sessionId)
    if (!file) return { success: false, code: 'session_file_not_found', error: '不存在' }
    return { success: true, data: { bytes: file.bytes, version: file.version } }
  }

  async putSessionFile(
    sessionId: string,
    baseVersion: number,
    bytes: Uint8Array
  ): Promise<SyncResult<{ version: number; size: number }>> {
    const current = this.files.get(sessionId)?.version ?? 0
    if (current !== baseVersion) {
      return {
        success: false,
        code: 'stale_session_file',
        error: '版本过期',
        extra: { currentVersion: current }
      }
    }
    const version = current + 1
    this.files.set(sessionId, { bytes, version })
    return { success: true, data: { version, size: bytes.length } }
  }

  async deleteSessionFile(
    sessionId: string,
    baseVersion: number
  ): Promise<SyncResult<{ deleted: boolean }>> {
    const file = this.files.get(sessionId)
    if (!file) return { success: true, data: { deleted: false } }
    if (file.version !== baseVersion) {
      return {
        success: false,
        code: 'stale_session_file',
        error: '版本过期',
        extra: { currentVersion: file.version }
      }
    }
    this.files.delete(sessionId)
    return { success: true, data: { deleted: true } }
  }
}

interface Harness {
  engine: SessionSyncService
  relay: FakeRelayClient
  storage: SessionStorageService
  tracker: SessionSyncTracker
  dir: string
  cleanup: () => void
}

function makeHarness(connected = true): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-sync-engine-test-'))
  const storage = new SessionStorageService(() => dir)
  const tracker = new SessionSyncTracker(join(dir, 'tracker.json'))
  const relay = new FakeRelayClient()
  const noopBroadcast = (): void => {}
  const syncService: SyncServiceLike = {
    getStatus: () => ({ connected }) as ReturnType<SyncService['getStatus']>,
    getDataKey: () => DEK,
    getClient: () => relay as unknown as RelayClient
  }
  const engine = new SessionSyncService({
    syncService,
    storage,
    tracker,
    broadcast: noopBroadcast,
    sessionsDirProvider: () => dir
  })
  return {
    engine,
    relay,
    storage,
    tracker,
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

function sessionFileText(
  sessionId: string,
  messageIds: string[],
  updatedAt = '2026-08-01T01:00:00.000Z'
): string {
  const meta = JSON.stringify({
    kind: 'meta',
    v: 1,
    data: {
      sessionId,
      title: '测试',
      sessionType: 'default',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt
    }
  })
  const messages = messageIds.map((id, index) =>
    JSON.stringify({
      kind: 'message',
      data: {
        id,
        role: 'user',
        content: `内容-${id}`,
        timestamp: `2026-08-01T01:0${index + 1}:00.000Z`
      }
    })
  )
  return [meta, ...messages].join('\n') + '\n'
}

function writeLocal(dir: string, sessionId: string, content: string): void {
  writeFileSync(join(dir, `${sessionId}.jsonl`), content, 'utf-8')
}

function readFileSyncSafe(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
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

test('本地新会话上传：PUT base 0 并记录 tracker', async () => {
  const h = makeHarness()
  try {
    await h.storage.initialize()
    writeLocal(h.dir, 'session-100-aaa', sessionFileText('session-100-aaa', ['m1']))
    const result = await h.engine.syncNow()
    assert.equal(result.success, true)
    assert.equal(result.data?.uploaded, 1)
    assert.equal(h.relay.files.get('session-100-aaa')?.version, 1)
    assert.equal(h.tracker.getData().sessions['session-100-aaa']?.version, 1)
  } finally {
    h.cleanup()
  }
})

test('远端新会话下行落盘', async () => {
  const h = makeHarness()
  try {
    await h.storage.initialize()
    const text = sessionFileText('session-200-bbb', ['m1', 'm2'])
    h.relay.files.set('session-200-bbb', {
      bytes: sealSessionSnapshot(DEK, 'session-200-bbb', new TextEncoder().encode(text)),
      version: 1
    })
    const result = await h.engine.syncNow()
    assert.equal(result.data?.downloaded, 1)
    assert.equal(readFileSync(join(h.dir, 'session-200-bbb.jsonl'), 'utf-8'), text)
  } finally {
    h.cleanup()
  }
})

test('双端各追加消息：行级合并两端都不丢', async () => {
  const h = makeHarness()
  try {
    await h.storage.initialize()
    // 第一轮：共同基线 m1 同步
    writeLocal(h.dir, 'session-300-ccc', sessionFileText('session-300-ccc', ['m1']))
    await h.engine.syncNow()
    // 对端追加 m2（版本推进到 2）；本地追加 m3 未上传
    const remoteText = sessionFileText('session-300-ccc', ['m1', 'm2'], '2026-08-01T02:00:00.000Z')
    h.relay.files.set('session-300-ccc', {
      bytes: sealSessionSnapshot(DEK, 'session-300-ccc', new TextEncoder().encode(remoteText)),
      version: 2
    })
    writeLocal(
      h.dir,
      'session-300-ccc',
      sessionFileText('session-300-ccc', ['m1', 'm3'], '2026-08-01T01:30:00.000Z')
    )
    const result = await h.engine.syncNow()
    assert.equal(result.data?.merged, 1)
    const remoteFinal = h.relay.files.get('session-300-ccc')
    assert.ok(remoteFinal)
    const remotePlain = new TextDecoder().decode(
      openSessionSnapshot(DEK, 'session-300-ccc', remoteFinal.bytes)
    )
    assert.ok(remotePlain.includes('m2') && remotePlain.includes('m3'), '远端应包含双方消息')
    const localFinal = readFileSync(join(h.dir, 'session-300-ccc.jsonl'), 'utf-8')
    assert.ok(localFinal.includes('m2') && localFinal.includes('m3'), '本地应包含双方消息')
  } finally {
    h.cleanup()
  }
})

test('本地删除传播到远端并记录 tombstone', async () => {
  const h = makeHarness()
  try {
    await h.storage.initialize()
    writeLocal(h.dir, 'session-400-ddd', sessionFileText('session-400-ddd', ['m1']))
    await h.engine.syncNow()
    rmSync(join(h.dir, 'session-400-ddd.jsonl'))
    const result = await h.engine.syncNow()
    assert.equal(result.data?.deletedRemote, 1)
    assert.equal(h.relay.files.has('session-400-ddd'), false)
    assert.notEqual(h.tracker.getTombstone('session-400-ddd'), null)
  } finally {
    h.cleanup()
  }
})

test('远端删除传播到本地', async () => {
  const h = makeHarness()
  try {
    await h.storage.initialize()
    writeLocal(h.dir, 'session-500-eee', sessionFileText('session-500-eee', ['m1']))
    await h.engine.syncNow()
    h.relay.files.delete('session-500-eee')
    const result = await h.engine.syncNow()
    assert.equal(result.data?.deletedLocal, 1)
    assert.equal(readFileSyncSafe(join(h.dir, 'session-500-eee.jsonl')), null)
  } finally {
    h.cleanup()
  }
})

test('远端密文损坏：记 error 跳过，不影响其他会话', async () => {
  const h = makeHarness()
  try {
    await h.storage.initialize()
    h.relay.files.set('session-600-fff', { bytes: new Uint8Array(randomBytes(64)), version: 1 })
    writeLocal(h.dir, 'session-601-ggg', sessionFileText('session-601-ggg', ['m1']))
    const result = await h.engine.syncNow()
    assert.equal(result.success, false, '有 error 时整体标记失败')
    assert.equal(result.data?.errors.length, 1)
    assert.equal(result.data?.errors[0]?.sessionId, 'session-600-fff')
    assert.equal(result.data?.uploaded, 1, '正常会话不受影响')
  } finally {
    h.cleanup()
  }
})

test('超过 4MiB 上限的会话跳过并记 error', async () => {
  const h = makeHarness()
  try {
    await h.storage.initialize()
    const big = 'x'.repeat(4 * 1024 * 1024)
    writeLocal(h.dir, 'session-700-hhh', sessionFileText('session-700-hhh', ['m1']) + big)
    const result = await h.engine.syncNow()
    assert.equal(result.data?.uploaded ?? 0, 0)
    assert.equal(result.data?.errors[0]?.sessionId, 'session-700-hhh')
  } finally {
    h.cleanup()
  }
})

test('并发 syncNow 串行执行且都成功', async () => {
  const h = makeHarness()
  try {
    await h.storage.initialize()
    writeLocal(h.dir, 'session-800-iii', sessionFileText('session-800-iii', ['m1']))
    const [r1, r2] = await Promise.all([h.engine.syncNow(), h.engine.syncNow()])
    assert.equal(r1.success, true)
    assert.equal(r2.success, true)
    assert.equal(h.relay.files.get('session-800-iii')?.version, 1)
  } finally {
    h.cleanup()
  }
})
