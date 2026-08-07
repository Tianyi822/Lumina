/**
 * WriterSyncService 引擎单测：内存假 RelayClient + tmpdir 真实 writing 目录。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  readdirSync,
  existsSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { WriterDocument, WriterIndex } from '@shared/types/writer'
import type { SyncResult, SessionFileMeta } from '@shared/types/sync'
import type { RelayClient } from '../transport/RelayClient'
import type { SyncService } from '../SyncService'
import { sealWriterFile } from './writerSnapshotCrypto'
import { WriterSyncTracker } from './writerSyncTracker'
import { WriterSyncService } from './WriterSyncService'
import { makeIndexKey, makeDocKey, makeAssetKey } from './writerSyncKeys'

const DEK = new Uint8Array(randomBytes(32))

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

/** 内存假 RelayClient：实现 session-files 的 CAS 语义 */
class FakeRelayClient {
  files = new Map<string, { bytes: Uint8Array; version: number }>()
  /** 下一次 putSessionFile(key) 强制返回一次 stale，模拟对端抢先写入触发 CAS 冲突 */
  private readonly forceStaleOnce = new Set<string>()
  /** listSessionFiles 返回的 version 覆盖，模拟 list→put 并发窗口中的过期快照 */
  readonly listVersionOverride = new Map<string, number>()

  async listSessionFiles(): Promise<SyncResult<{ sessions: SessionFileMeta[] }>> {
    return {
      success: true,
      data: {
        sessions: [...this.files.entries()].map(([sessionId, f]) => ({
          sessionId,
          version: this.listVersionOverride.get(sessionId) ?? f.version,
          size: f.bytes.length,
          updatedAt: 0
        }))
      }
    }
  }

  async getSessionFile(
    key: string
  ): Promise<SyncResult<{ bytes: Uint8Array; version: number | null }>> {
    const file = this.files.get(key)
    if (!file) return { success: false, code: 'session_file_not_found', error: '不存在' }
    return { success: true, data: { bytes: file.bytes, version: file.version } }
  }

  /** 标记下一次该 key 的 put 强制返回 stale_session_file */
  forceStaleOnNextPut(key: string): void {
    this.forceStaleOnce.add(key)
  }

  async putSessionFile(
    key: string,
    baseVersion: number,
    bytes: Uint8Array
  ): Promise<SyncResult<{ version: number; size: number }>> {
    if (this.forceStaleOnce.delete(key)) {
      return { success: false, code: 'stale_session_file', error: '版本过期' }
    }
    const current = this.files.get(key)?.version ?? 0
    if (current !== baseVersion) {
      return { success: false, code: 'stale_session_file', error: '版本过期' }
    }
    const version = current + 1
    this.files.set(key, { bytes, version })
    return { success: true, data: { version, size: bytes.length } }
  }

  async deleteSessionFile(
    key: string,
    baseVersion: number
  ): Promise<SyncResult<{ deleted: boolean }>> {
    const file = this.files.get(key)
    if (!file) return { success: true, data: { deleted: false } }
    if (file.version !== baseVersion) {
      return { success: false, code: 'stale_session_file', error: '版本过期' }
    }
    this.files.delete(key)
    return { success: true, data: { deleted: true } }
  }
}

function makeDoc(id: string, revision: number, title = '测试'): WriterDocument {
  return {
    schemaVersion: 1,
    id,
    revision,
    title,
    content: { type: 'doc', content: [] },
    favorite: false,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z'
  } as WriterDocument
}

function makeEmptyIndex(): WriterIndex {
  return { schemaVersion: 1, folders: [], documents: [], recentDocumentIds: [] }
}

interface Harness {
  engine: WriterSyncService
  relay: FakeRelayClient
  tracker: WriterSyncTracker
  storage: WriterStorageLike
  asset: WriterAssetLike & { failImport: boolean }
  dir: string
  cleanup: () => void
}

function makeHarness(connected = true): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-writer-sync-engine-'))
  // 建目录结构
  const writingRoot = dir
  const documentsDir = join(writingRoot, 'documents')
  mkdirSync(documentsDir, { recursive: true })
  // 写 index.json
  writeFileSync(join(writingRoot, 'index.json'), JSON.stringify(makeEmptyIndex(), null, 2), 'utf-8')

  const tracker = new WriterSyncTracker(join(dir, 'writer-sync.json'))
  const relay = new FakeRelayClient()

  const storage: WriterStorageLike = {
    listDocuments: async () => ({
      success: true,
      data: JSON.parse(readFileSync(join(writingRoot, 'index.json'), 'utf-8'))
    }),
    applySyncedIndex: async (merged) => {
      writeFileSync(join(writingRoot, 'index.json'), JSON.stringify(merged, null, 2), 'utf-8')
      return { success: true }
    },
    applySyncedDocument: async (doc) => {
      const docDir = join(documentsDir, doc.id)
      mkdirSync(docDir, { recursive: true })
      writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
      return { success: true }
    },
    applySyncedDeletedDocument: async (id) => {
      rmSync(join(documentsDir, id), { recursive: true, force: true })
      return { success: true }
    },
    readDocumentForSync: async (id) => {
      try {
        const doc = JSON.parse(readFileSync(join(documentsDir, id, 'document.json'), 'utf-8'))
        return { success: true, data: doc }
      } catch {
        return { success: false, data: null }
      }
    }
  }

  const assetService: WriterAssetLike & { failImport: boolean } = {
    failImport: false,
    importBytes: async (docId, input) => {
      if (assetService.failImport) return { success: false, error: '模拟落盘失败' }
      const assetsDir = join(documentsDir, docId, 'assets')
      mkdirSync(assetsDir, { recursive: true })
      writeFileSync(join(assetsDir, input.fileName), input.bytes)
      return { success: true }
    }
  }

  const syncService: SyncServiceLike = {
    getStatus: () => ({ connected }) as ReturnType<SyncService['getStatus']>,
    getDataKey: () => DEK,
    getClient: () => relay as unknown as RelayClient
  }

  const engine = new WriterSyncService({
    syncService,
    storage,
    assetService,
    tracker,
    broadcast: () => {},
    writingRootProvider: () => writingRoot
  })

  return {
    engine,
    relay,
    tracker,
    storage,
    asset: assetService,
    dir,
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

test('首次上行：index + 文档 + assets 全部 key', async () => {
  const h = makeHarness()
  try {
    // 准备本地文件
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    // asset（PNG magic bytes）
    const assetBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    mkdirSync(join(docDir, 'assets'), { recursive: true })
    writeFileSync(join(docDir, 'assets', 'a1b2c3d4.png'), assetBytes)

    const result = await h.engine.syncNow()
    assert.ok(result.success)
    assert.ok(result.data)
    // index + 1 doc + 1 asset = 3 uploaded
    assert.equal(result.data.uploaded, 3)
    assert.ok(h.relay.files.has(makeIndexKey()))
    assert.ok(h.relay.files.has(makeDocKey('writer-abc12345')))
  } finally {
    h.cleanup()
  }
})

test('远端文档 revision 更新 → 下行', async () => {
  const h = makeHarness()
  try {
    // 先上行基线
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    await h.engine.syncNow()

    // 注入远端更新（revision 2）
    const remoteDoc = makeDoc('writer-abc12345', 2, '远端更新标题')
    const remoteBytes = new TextEncoder().encode(JSON.stringify(remoteDoc, null, 2))
    const ct = sealWriterFile(DEK, remoteBytes)
    h.relay.files.set(makeDocKey('writer-abc12345'), { bytes: ct, version: 2 })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.downloaded, 1)
    // 本地文档已更新
    const diskDoc = JSON.parse(readFileSync(join(docDir, 'document.json'), 'utf-8'))
    assert.equal(diskDoc.revision, 2)
    assert.equal(diskDoc.title, '远端更新标题')
  } finally {
    h.cleanup()
  }
})

test('远端文档 revision 落后 → 忽略（本地更新待上行）', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 3) // 本地 revision=3
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    await h.engine.syncNow()

    // 注入远端 revision=2（落后）
    const remoteDoc = makeDoc('writer-abc12345', 2, '旧标题')
    const remoteBytes = new TextEncoder().encode(JSON.stringify(remoteDoc, null, 2))
    const ct = sealWriterFile(DEK, remoteBytes)
    h.relay.files.set(makeDocKey('writer-abc12345'), { bytes: ct, version: 2 })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    // 本地 revision=3 > 远端 revision=2 → 不采纳远端，本地 dirty → 上行
    const diskDoc = JSON.parse(readFileSync(join(docDir, 'document.json'), 'utf-8'))
    assert.equal(diskDoc.revision, 3) // 未被远端覆盖
  } finally {
    h.cleanup()
  }
})

test('本地删除文档 → 上行删除远端 + tombstone', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    await h.engine.syncNow()

    // 本地删除
    rmSync(docDir, { recursive: true, force: true })
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.deletedRemote, 1)
    // tombstone 已设
    assert.ok(h.tracker.getTombstone(makeDocKey('writer-abc12345')))
  } finally {
    h.cleanup()
  }
})

test('远端删除文档 → 下行删除本地', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    await h.engine.syncNow()

    // 远端删除
    h.relay.files.delete(makeDocKey('writer-abc12345'))
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.deletedLocal, 1)
    // 本地文档已删
    assert.ok(!existsSyncDoc(docDir))
  } finally {
    h.cleanup()
  }
})

function existsSyncDoc(path: string): boolean {
  try {
    readdirSync(path)
    return true
  } catch {
    return false
  }
}

test('无变更时 skipped', async () => {
  const h = makeHarness()
  try {
    writeFileSync(join(h.dir, 'index.json'), JSON.stringify(makeEmptyIndex(), null, 2), 'utf-8')
    await h.engine.syncNow()
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.skipped, 1)
    assert.equal(result.data.uploaded, 0)
  } finally {
    h.cleanup()
  }
})

test('上行 CAS 冲突（stale_session_file）→ 拉取最新合并后重试成功', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    // 先基线上行：doc 落到远端，tracker 记录 version=1
    await h.engine.syncNow()

    // 模拟对端已把远端 doc 推到 version=2（revision=2）
    const remoteDoc = makeDoc('writer-abc12345', 2, '对端更新')
    const remoteBytes = new TextEncoder().encode(JSON.stringify(remoteDoc, null, 2))
    const ct = sealWriterFile(DEK, remoteBytes)
    h.relay.files.set(makeDocKey('writer-abc12345'), { bytes: ct, version: 2 })

    // 本地再做一次修改（revision=3），dirty 待上行；tracker.version 仍是 1
    const localDoc = makeDoc('writer-abc12345', 3, '本地修改')
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(localDoc, null, 2), 'utf-8')

    // 下一次该 key 的 put 强制返回一次 stale_session_file，触发 CAS 重试
    h.relay.forceStaleOnNextPut(makeDocKey('writer-abc12345'))

    const result = await h.engine.syncNow()
    assert.ok(result.success)
    assert.ok(result.data)
    // 重试后上传成功，无错误
    assert.equal(result.data.uploaded, 1)
    assert.equal(result.data.errors.length, 0)
    // 远端已被本地版本覆盖（version 推到 3，revision=3）
    const put = h.relay.files.get(makeDocKey('writer-abc12345'))
    assert.ok(put)
    assert.equal(put.version, 3)
    // tracker 已对齐到最新远端版本
    const tracked = h.tracker.getData().keys[makeDocKey('writer-abc12345')]
    assert.ok(tracked)
    assert.equal(tracked.version, 3)
  } finally {
    h.cleanup()
  }
})

test('tombstone 阻止远端复活：本地已删文档，远端同 key 不被重新下行', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    await h.engine.syncNow()

    // 本地删除 → 上行删除 + 设 tombstone
    rmSync(docDir, { recursive: true, force: true })
    await h.engine.syncNow()
    assert.ok(h.tracker.getTombstone(makeDocKey('writer-abc12345')))
    assert.equal(h.relay.files.has(makeDocKey('writer-abc12345')), false)

    // 远端再次出现同 key（对端“复活”），version 高于本地任何已知值
    const remoteDoc = makeDoc('writer-abc12345', 5, '远端复活')
    const remoteBytes = new TextEncoder().encode(JSON.stringify(remoteDoc, null, 2))
    const ct = sealWriterFile(DEK, remoteBytes)
    h.relay.files.set(makeDocKey('writer-abc12345'), { bytes: ct, version: 5 })

    const result = await h.engine.syncNow()
    assert.ok(result.success)
    assert.ok(result.data)
    // 不应下载复活文档
    assert.equal(result.data.downloaded, 0)
    assert.ok(!existsSyncDoc(docDir), '本地文档不应被重新写入')
    // tombstone 仍在
    assert.ok(h.tracker.getTombstone(makeDocKey('writer-abc12345')))
  } finally {
    h.cleanup()
  }
})

test('asset 下行落盘失败 → 不记 tracker 不删远端，恢复后可重试', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    await h.engine.syncNow()

    // 对端上传一个 asset（本地没有）
    const assetBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const assetKey = makeAssetKey('writer-abc12345', 'a1b2c3d4.png')
    h.relay.files.set(assetKey, { bytes: sealWriterFile(DEK, assetBytes), version: 1 })

    // 第一轮：importBytes 失败 → 返回 ignored，tracker 不记录
    h.asset.failImport = true
    const r1 = await h.engine.syncNow()
    assert.ok(r1.data)
    assert.equal(r1.data.downloaded, 0)
    assert.equal(h.tracker.getData().keys[assetKey], undefined)

    // 第二轮（仍失败）：远端 asset 不应被当作本地删除而删掉，也不应立 tombstone
    await h.engine.syncNow()
    assert.equal(h.relay.files.has(assetKey), true)
    assert.equal(h.tracker.getTombstone(assetKey), null)

    // 恢复后可成功下行
    h.asset.failImport = false
    const r3 = await h.engine.syncNow()
    assert.ok(r3.data)
    assert.equal(r3.data.downloaded, 1)
    assert.ok(existsSync(join(docDir, 'assets', 'a1b2c3d4.png')))
  } finally {
    h.cleanup()
  }
})

test('远端 index JSON 损坏 → 按 key 记 error，不阻塞后续文档下行', async () => {
  const h = makeHarness()
  try {
    await h.engine.syncNow() // 基线

    // 注入合法密文、非法 JSON 的远端 index
    h.relay.files.set(makeIndexKey(), {
      bytes: sealWriterFile(DEK, new TextEncoder().encode('not-json{{{')),
      version: 99
    })
    // 同轮还有一个待下行的新文档
    const remoteDoc = makeDoc('writer-abc12345', 1, '远端文档')
    h.relay.files.set(makeDocKey('writer-abc12345'), {
      bytes: sealWriterFile(DEK, new TextEncoder().encode(JSON.stringify(remoteDoc, null, 2))),
      version: 1
    })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.ok(result.data.errors.some((e) => e.key === makeIndexKey()))
    // 后续文档未被阻断，已正常落盘
    const diskDoc = JSON.parse(
      readFileSync(join(h.dir, 'documents', 'writer-abc12345', 'document.json'), 'utf-8')
    )
    assert.equal(diskDoc.title, '远端文档')
  } finally {
    h.cleanup()
  }
})

test('CAS 冲突远端 revision 胜出 → 转下行落盘并对齐 tracker，不上行', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    await h.engine.syncNow() // 基线：tracker version=1

    // 对端已把远端推到 version=2（revision=5），但 list 快照仍是 version=1（模拟 list→put 并发窗口）
    const remoteDoc = makeDoc('writer-abc12345', 5, '对端胜出')
    h.relay.files.set(makeDocKey('writer-abc12345'), {
      bytes: sealWriterFile(DEK, new TextEncoder().encode(JSON.stringify(remoteDoc, null, 2))),
      version: 2
    })
    h.relay.listVersionOverride.set(makeDocKey('writer-abc12345'), 1)

    // 本地修改（revision=2）→ dirty，tracker.version 仍为 1
    const localDoc = makeDoc('writer-abc12345', 2, '本地修改')
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(localDoc, null, 2), 'utf-8')

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.errors.length, 0)
    assert.equal(result.data.uploaded, 0, '远端胜出不应上行')
    assert.equal(result.data.downloaded, 1)
    // 本地已落远端版本
    const diskDoc = JSON.parse(readFileSync(join(docDir, 'document.json'), 'utf-8'))
    assert.equal(diskDoc.revision, 5)
    assert.equal(diskDoc.title, '对端胜出')
    // tracker 对齐远端 version=2，远端内容未被本地覆盖
    assert.equal(h.tracker.getData().keys[makeDocKey('writer-abc12345')]?.version, 2)
    assert.equal(h.relay.files.get(makeDocKey('writer-abc12345'))?.version, 2)

    // 下一轮：无分叉（既不重复下行也不上行）
    h.relay.listVersionOverride.clear()
    const r2 = await h.engine.syncNow()
    assert.ok(r2.data)
    assert.equal(r2.data.downloaded, 0)
    assert.equal(r2.data.uploaded, 0)
  } finally {
    h.cleanup()
  }
})
