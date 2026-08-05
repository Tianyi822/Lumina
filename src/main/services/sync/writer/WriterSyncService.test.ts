/**
 * WriterSyncService 引擎单测：内存假 RelayClient + tmpdir 真实 writing 目录。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs'
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
import { makeIndexKey, makeDocKey } from './writerSyncKeys'

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

  async listSessionFiles(): Promise<SyncResult<{ sessions: SessionFileMeta[] }>> {
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
    key: string
  ): Promise<SyncResult<{ bytes: Uint8Array; version: number | null }>> {
    const file = this.files.get(key)
    if (!file) return { success: false, code: 'session_file_not_found', error: '不存在' }
    return { success: true, data: { bytes: file.bytes, version: file.version } }
  }

  async putSessionFile(
    key: string,
    baseVersion: number,
    bytes: Uint8Array
  ): Promise<SyncResult<{ version: number; size: number }>> {
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

  const assetService: WriterAssetLike = {
    importBytes: async (docId, input) => {
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
