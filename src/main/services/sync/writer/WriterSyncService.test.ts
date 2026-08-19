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
import { parseWriterAssetManifest } from '@shared/types/sync'
import type { SyncResult, SessionFileMeta } from '@shared/types/sync'
import type { RelayClient } from '../transport/RelayClient'
import type { SyncService } from '../SyncService'
import { sha256Hex } from '../crypto/hash'
import {
  sealWriterFile,
  sealWriterAssetBlock,
  sealWriterAssetManifest,
  openWriterAssetManifest
} from './writerSnapshotCrypto'
import { WriterSyncTracker } from './writerSyncTracker'
import { WriterSyncService } from './WriterSyncService'
import { makeIndexKey, makeDocKey, makeAssetKey, makeAssetsManifestKey } from './writerSyncKeys'

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
  /** getSessionFile(key) 持续失败，模拟 stale rebase 拉取最新失败 */
  readonly failGetSessionKeys = new Set<string>()
  /** listSessionFiles 返回的 version 覆盖，模拟 list→put 并发窗口中的过期快照 */
  readonly listVersionOverride = new Map<string, number>()
  /** 模拟 429：listSessionFiles 返回限流并携带 retryAfterMs */
  rateLimited = false
  /** blocks 通道：内容寻址块存储 */
  blocks = new Map<string, Uint8Array>()
  /** putBlock 全部失败（故障注入，测块失败中止语义） */
  failPutBlock = false

  async listSessionFiles(): Promise<SyncResult<{ sessions: SessionFileMeta[] }>> {
    if (this.rateLimited) {
      return {
        success: false,
        code: 'rate_limited',
        error: '请求被限流',
        extra: { retryAfterMs: 60_000 }
      }
    }
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
    if (this.failGetSessionKeys.has(key)) {
      return { success: false, code: 'network_error', error: '模拟拉取最新失败' }
    }
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

  async putBlock(
    blockId: string,
    ciphertext: Uint8Array
  ): Promise<SyncResult<{ created: boolean }>> {
    if (this.failPutBlock) {
      return { success: false, code: 'network_error', error: '模拟网络失败' }
    }
    const created = !this.blocks.has(blockId)
    this.blocks.set(blockId, ciphertext)
    return { success: true, data: { created } }
  }

  async getBlock(blockId: string): Promise<SyncResult<{ bytes: Uint8Array }>> {
    const bytes = this.blocks.get(blockId)
    if (!bytes) return { success: false, code: 'block_not_found', error: '不存在' }
    return { success: true, data: { bytes } }
  }

  async blocksMissing(ids: string[]): Promise<SyncResult<{ missing: string[] }>> {
    return { success: true, data: { missing: ids.filter((id) => !this.blocks.has(id)) } }
  }
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00])

/**
 * 构造远端资产清单并注入 relay（模拟对端经 manifest+blocks 通道上传）：
 * 逐文件 sealWriterAssetBlock 入 blocks map，manifest 密封后入 session-files。
 * 返回 manifest key。
 */
function injectRemoteManifest(
  relay: FakeRelayClient,
  documentId: string,
  files: Array<{ fileName: string; bytes: Uint8Array }>,
  version = 1
): string {
  const key = makeAssetsManifestKey(documentId)
  const entries = files.map((f) => {
    const { blockId, ciphertext } = sealWriterAssetBlock(DEK, f.bytes)
    relay.blocks.set(blockId, ciphertext)
    return {
      fileName: f.fileName,
      size: f.bytes.length,
      sha256: sha256Hex(f.bytes),
      blockIds: [blockId]
    }
  })
  const manifest = {
    schemaVersion: 1 as const,
    documentId,
    updatedAt: '2026-08-17T00:00:00.000Z',
    files: entries
  }
  relay.files.set(key, {
    bytes: sealWriterAssetManifest(DEK, new TextEncoder().encode(JSON.stringify(manifest))),
    version
  })
  return key
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

/** 构造引用指定资产（image 节点 assetPath/src）的文档，模拟真实 Tiptap 内容 */
function makeDocWithAssets(id: string, revision: number, assetFileNames: string[]): WriterDocument {
  const doc = makeDoc(id, revision)
  doc.content = {
    type: 'doc',
    content: assetFileNames.map((fileName) => ({
      type: 'image',
      attrs: {
        assetPath: `assets/${fileName}`,
        src: `lumina://writing/${id}/assets/${fileName}`
      }
    }))
  }
  return doc
}

/** 解密并解析 relay 上的 manifest，返回文件名列表（断言远端清单内容用） */
function parseRemoteManifestFiles(relay: FakeRelayClient, key: string): string[] {
  const stored = relay.files.get(key)
  assert.ok(stored)
  const manifest = parseWriterAssetManifest(
    new TextDecoder().decode(openWriterAssetManifest(DEK, stored.bytes))
  )
  assert.ok(manifest)
  return manifest.files.map((f) => f.fileName)
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

  // 模拟 WriterService.collectDocumentGarbage：读已落盘文档 JSON 的 image 引用，
  // 清理该文档 assets 目录下未被引用的文件（与真实单文档 GC 行为一致）
  const collectDocumentGarbage = async (
    documentId: string
  ): Promise<{ success: boolean; data?: number; error?: string }> => {
    try {
      const doc = JSON.parse(
        readFileSync(join(documentsDir, documentId, 'document.json'), 'utf-8')
      ) as unknown
      const referenced = new Set<string>()
      const visit = (node: unknown): void => {
        if (!node || typeof node !== 'object') return
        const n = node as { type?: unknown; attrs?: unknown; content?: unknown }
        if (n.type === 'image') {
          const assetPath = (n.attrs as { assetPath?: unknown } | undefined)?.assetPath
          if (typeof assetPath === 'string') referenced.add(assetPath)
        }
        if (Array.isArray(n.content)) n.content.forEach(visit)
      }
      visit(doc)
      const assetsDir = join(documentsDir, documentId, 'assets')
      let removed = 0
      for (const name of readdirSync(assetsDir)) {
        if (!referenced.has(`assets/${name}`)) {
          rmSync(join(assetsDir, name))
          removed += 1
        }
      }
      return { success: true, data: removed }
    } catch (error) {
      // 与真实 WriterAssetService.collectGarbage 一致：目录不存在视为无垃圾
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: true, data: 0 }
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  const engine = new WriterSyncService({
    syncService,
    storage,
    assetService,
    tracker,
    broadcast: () => {},
    writingRootProvider: () => writingRoot,
    collectDocumentGarbage
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

test('首次上行：index + 文档走 session-files，资产走 manifest + 块通道', async () => {
  const h = makeHarness()
  try {
    // 准备本地文件
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    // asset（PNG magic bytes）
    mkdirSync(join(docDir, 'assets'), { recursive: true })
    writeFileSync(join(docDir, 'assets', 'a1b2c3d4.png'), PNG_BYTES)

    const result = await h.engine.syncNow()
    assert.ok(result.success)
    assert.ok(result.data)
    // index + 1 doc + 1 assets-manifest = 3 uploaded；资产内容切块 1 块
    assert.equal(result.data.uploaded, 3)
    assert.equal(result.data.blocksUploaded, 1)
    assert.ok(h.relay.files.has(makeIndexKey()))
    assert.ok(h.relay.files.has(makeDocKey('writer-abc12345')))
    const manifestKey = makeAssetsManifestKey('writer-abc12345')
    assert.ok(h.relay.files.has(manifestKey), 'manifest 应入 session-files')
    assert.equal(h.relay.blocks.size, 1, '资产块应入 blocks map')
    // 旧整文件 asset key 不再上行
    assert.equal(h.relay.files.has(makeAssetKey('writer-abc12345', 'a1b2c3d4.png')), false)
    // manifest 可解密且字段与本地资产一致
    const stored = h.relay.files.get(manifestKey)
    assert.ok(stored)
    const manifest = parseWriterAssetManifest(
      new TextDecoder().decode(openWriterAssetManifest(DEK, stored.bytes))
    )
    assert.ok(manifest)
    assert.equal(manifest.documentId, 'writer-abc12345')
    assert.equal(manifest.files.length, 1)
    assert.equal(manifest.files[0].fileName, 'a1b2c3d4.png')
    assert.equal(manifest.files[0].sha256, sha256Hex(PNG_BYTES))
    assert.equal(manifest.files[0].size, PNG_BYTES.length)
    assert.deepEqual(manifest.files[0].blockIds, [...h.relay.blocks.keys()])
    // tracker 记录 manifest key 与 fileBlocks 基线
    const tracked = h.tracker.getData().keys[manifestKey]
    assert.ok(tracked)
    assert.ok(tracked.fileBlocks?.['a1b2c3d4.png'])
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

test('本地删除文档 → 上行删除远端 doc key + manifest key + tombstone', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    mkdirSync(join(docDir, 'assets'), { recursive: true })
    writeFileSync(join(docDir, 'assets', 'a1b2c3d4.png'), PNG_BYTES)
    await h.engine.syncNow()

    // 本地删除（doc 目录连同 assets 消失）
    rmSync(docDir, { recursive: true, force: true })
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    // 文档 key 与资产 manifest key 都上行删除
    assert.equal(result.data.deletedRemote, 2)
    assert.ok(h.tracker.getTombstone(makeDocKey('writer-abc12345')))
    assert.ok(h.tracker.getTombstone(makeAssetsManifestKey('writer-abc12345')))
    assert.equal(h.relay.files.has(makeAssetsManifestKey('writer-abc12345')), false)
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

test('asset 下行落盘失败 → 不记 tracker 不删远端，恢复后可重试（manifest 通道）', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    await h.engine.syncNow()

    // 对端经 manifest+blocks 上传一个资产（本地没有）
    const manifestKey = injectRemoteManifest(h.relay, 'writer-abc12345', [
      { fileName: 'a1b2c3d4.png', bytes: PNG_BYTES }
    ])

    // 第一轮：importBytes 失败 → 记 error，tracker 不记录，远端 manifest 不被窄化/删除
    h.asset.failImport = true
    const r1 = await h.engine.syncNow()
    assert.ok(r1.data)
    assert.equal(r1.data.downloaded, 0)
    assert.ok(
      r1.data.errors.some((e) => e.key === manifestKey && e.message.includes('asset 落盘失败')),
      '落盘失败应记 error 让用户感知'
    )
    assert.equal(h.tracker.getData().keys[manifestKey], undefined)

    // 第二轮（仍失败）：远端 manifest 不应被当作本地删除而删掉，也不应立 tombstone
    await h.engine.syncNow()
    assert.equal(h.relay.files.has(manifestKey), true)
    assert.equal(h.tracker.getTombstone(manifestKey), null)

    // 恢复后可成功下行：拉块重组校验落盘
    h.asset.failImport = false
    const r3 = await h.engine.syncNow()
    assert.ok(r3.data)
    assert.equal(r3.data.downloaded, 1)
    assert.equal(r3.data.blocksDownloaded, 1)
    const disk = readFileSync(join(docDir, 'assets', 'a1b2c3d4.png'))
    assert.deepEqual(new Uint8Array(disk), PNG_BYTES)
  } finally {
    h.cleanup()
  }
})

test('块上传失败 → manifest 不上行、基线不更新，恢复后重试成功且指纹 skip', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    mkdirSync(join(docDir, 'assets'), { recursive: true })
    writeFileSync(join(docDir, 'assets', 'a1b2c3d4.png'), PNG_BYTES)

    // 第一轮：putBlock 全部失败
    h.relay.failPutBlock = true
    const manifestKey = makeAssetsManifestKey('writer-abc12345')
    const r1 = await h.engine.syncNow()
    assert.ok(r1.data)
    // 失败按 key 隔离：manifest 记 error，但 index/doc 仍正常上行
    assert.ok(r1.data.errors.some((e) => e.key === manifestKey))
    assert.ok(h.relay.files.has(makeDocKey('writer-abc12345')))
    // manifest 不上行（不能引用 relay 上不存在的块）、tracker 基线不更新
    assert.equal(h.relay.files.has(manifestKey), false)
    assert.equal(h.tracker.getData().keys[manifestKey], undefined)
    assert.equal(r1.data.blocksUploaded, 0)

    // 第二轮：恢复后重试成功
    h.relay.failPutBlock = false
    const r2 = await h.engine.syncNow()
    assert.ok(r2.data)
    assert.ok(h.relay.files.has(manifestKey))
    assert.equal(r2.data.blocksUploaded, 1)
    const tracked = h.tracker.getData().keys[manifestKey]
    assert.ok(tracked?.fileBlocks?.['a1b2c3d4.png'], '成功后应记录 fileBlocks 基线')

    // 第三轮：无变更 → 指纹相等 skip，不重切块不重传块
    const blocksBefore = h.relay.blocks.size
    const r3 = await h.engine.syncNow()
    assert.ok(r3.data)
    assert.equal(r3.data.blocksUploaded, 0)
    assert.equal(r3.data.uploaded, 0)
    assert.equal(h.relay.blocks.size, blocksBefore)
    assert.ok(r3.data.skipped >= 1)
    assert.equal(h.relay.files.get(manifestKey)?.version, 1, 'skip 轮不应再推 manifest')
  } finally {
    h.cleanup()
  }
})

test('远端 manifest → 拉块重组校验落盘；本地已有且 sha 一致的文件跳过下载', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    mkdirSync(join(docDir, 'assets'), { recursive: true })
    writeFileSync(join(docDir, 'assets', 'a1b2c3d4.png'), PNG_BYTES)
    await h.engine.syncNow() // 基线：本地已有 a1b2c3d4.png

    // 对端推 manifest v2：含本地已有的 a1b2c3d4.png 与新增 b2c3d4e5.gif
    const manifestKey = injectRemoteManifest(
      h.relay,
      'writer-abc12345',
      [
        { fileName: 'a1b2c3d4.png', bytes: PNG_BYTES },
        { fileName: 'b2c3d4e5.gif', bytes: GIF_BYTES }
      ],
      2
    )

    const r = await h.engine.syncNow()
    assert.ok(r.data)
    assert.equal(r.data.errors.length, 0)
    assert.equal(r.data.downloaded, 1)
    // 本地已有的文件不拉块，只下载缺失文件的块
    assert.equal(r.data.blocksDownloaded, 1)
    // 新资产已重组落盘且字节一致
    const disk = readFileSync(join(docDir, 'assets', 'b2c3d4e5.gif'))
    assert.deepEqual(new Uint8Array(disk), GIF_BYTES)
    // tracker 对齐远端指纹，本轮不再回推本地 manifest
    const tracked = h.tracker.getData().keys[manifestKey]
    assert.ok(tracked)
    assert.equal(tracked.version, 2)
    assert.equal(h.relay.files.get(manifestKey)?.version, 2)
    assert.equal(r.data.blocksUploaded, 0)
  } finally {
    h.cleanup()
  }
})

test('manifest 上行 CAS stale → rebase 后重试成功', async () => {
  const h = makeHarness()
  try {
    const doc = makeDoc('writer-abc12345', 1)
    const docDir = join(h.dir, 'documents', 'writer-abc12345')
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, 'document.json'), JSON.stringify(doc, null, 2), 'utf-8')
    mkdirSync(join(docDir, 'assets'), { recursive: true })
    writeFileSync(join(docDir, 'assets', 'a1b2c3d4.png'), PNG_BYTES)
    await h.engine.syncNow() // 基线：manifest v1

    // 本地新增资产 → manifest dirty；下一次 put 注入一次 stale
    writeFileSync(join(docDir, 'assets', 'b2c3d4e5.gif'), GIF_BYTES)
    const manifestKey = makeAssetsManifestKey('writer-abc12345')
    h.relay.forceStaleOnNextPut(manifestKey)

    const r = await h.engine.syncNow()
    assert.ok(r.data)
    assert.equal(r.data.errors.length, 0)
    // 旧块复用不重传，只传新资产的 1 块；manifest rebase 后重推成功
    assert.equal(r.data.blocksUploaded, 1)
    assert.equal(r.data.uploaded, 1)
    const stored = h.relay.files.get(manifestKey)
    assert.ok(stored)
    assert.equal(stored.version, 2)
    const manifest = parseWriterAssetManifest(
      new TextDecoder().decode(openWriterAssetManifest(DEK, stored.bytes))
    )
    assert.ok(manifest)
    assert.equal(manifest.files.length, 2)
    // tracker 对齐 rebase 后版本
    assert.equal(h.tracker.getData().keys[manifestKey]?.version, 2)
  } finally {
    h.cleanup()
  }
})

test('tracked 旧 writer-asset-* key：远端无存量 → removeKey 清理，不删远端不报错', async () => {
  const h = makeHarness()
  try {
    await h.engine.syncNow() // 基线：仅 index
    const legacyKey = makeAssetKey('writer-abc12345', 'a1b2c3d4.png')
    h.tracker.setKey(legacyKey, { version: 3, contentHash: 'deadbeef' })

    const r = await h.engine.syncNow()
    assert.ok(r.data)
    assert.equal(r.data.errors.length, 0)
    assert.equal(r.data.deletedRemote, 0)
    assert.equal(h.tracker.getData().keys[legacyKey], undefined)
    assert.equal(h.tracker.getTombstone(legacyKey), null)
  } finally {
    h.cleanup()
  }
})

test('远端 manifest JSON 非法 → 按 key 记 error，不阻塞同轮文档下行', async () => {
  const h = makeHarness()
  try {
    await h.engine.syncNow() // 基线

    // 注入合法密文、非法 JSON 的远端 manifest
    const manifestKey = makeAssetsManifestKey('writer-abc12345')
    h.relay.files.set(manifestKey, {
      bytes: sealWriterAssetManifest(DEK, new TextEncoder().encode('not-json{{{')),
      version: 1
    })
    // 同轮还有一个待下行的新文档
    const remoteDoc = makeDoc('writer-def67890', 1, '远端文档')
    h.relay.files.set(makeDocKey('writer-def67890'), {
      bytes: sealWriterFile(DEK, new TextEncoder().encode(JSON.stringify(remoteDoc, null, 2))),
      version: 1
    })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.ok(
      result.data.errors.some((e) => e.key === manifestKey && e.message.includes('解析失败'))
    )
    assert.equal(h.tracker.getData().keys[manifestKey], undefined)
    // 后续文档未被阻断，已正常落盘
    const diskDoc = JSON.parse(
      readFileSync(join(h.dir, 'documents', 'writer-def67890', 'document.json'), 'utf-8')
    )
    assert.equal(diskDoc.title, '远端文档')
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

test('限流窗口内 syncNow 返回 rate_limited 而非陈旧成功结果', async () => {
  const h = makeHarness()
  try {
    // 先正常跑一轮建立基线（确保 lastResult 是成功态）
    await h.engine.syncNow()
    assert.ok(h.engine['state'].lastResult, '首轮应有结果')

    // 第二轮 listSessionFiles 返回限流 → 引擎记录 rateLimitedUntil
    h.relay.rateLimited = true
    const limited = await h.engine.syncNow()
    assert.equal(limited.success, false, '限流期应失败')
    assert.equal(limited.code, 'rate_limited', '限流期应返回 rate_limited 而非陈旧成功')

    // 第三轮仍在限流窗口内 → syncNow 入口直接拦截（不触发 kickoff）
    h.relay.rateLimited = false
    const stillLimited = await h.engine.syncNow()
    assert.equal(stillLimited.success, false)
    assert.equal(stillLimited.code, 'rate_limited', '限流窗口内入口前置检查应拦截')
  } finally {
    h.cleanup()
  }
})

test('远端文档应用后单文档 GC：对端删除的资产不因本地磁盘残留复活', async () => {
  const h = makeHarness()
  try {
    // 基线：B 端文档引用 a1/b2 两资产，首轮上行 manifest 含 2 文件
    const docId = 'writer-abc12345'
    const docDir = join(h.dir, 'documents', docId)
    mkdirSync(join(docDir, 'assets'), { recursive: true })
    writeFileSync(join(docDir, 'assets', 'a1b2c3d4.png'), PNG_BYTES)
    writeFileSync(join(docDir, 'assets', 'b2c3d4e5.gif'), GIF_BYTES)
    writeFileSync(
      join(docDir, 'document.json'),
      JSON.stringify(makeDocWithAssets(docId, 1, ['a1b2c3d4.png', 'b2c3d4e5.gif']), null, 2),
      'utf-8'
    )
    await h.engine.syncNow()
    const manifestKey = makeAssetsManifestKey(docId)
    assert.equal(parseRemoteManifestFiles(h.relay, manifestKey).length, 2)

    // 模拟 A 端删除 b2：文档收窄引用（revision 2）+ manifest 只剩 a1（version 2）
    const remoteDoc = makeDocWithAssets(docId, 2, ['a1b2c3d4.png'])
    h.relay.files.set(makeDocKey(docId), {
      bytes: sealWriterFile(DEK, new TextEncoder().encode(JSON.stringify(remoteDoc, null, 2))),
      version: 2
    })
    injectRemoteManifest(h.relay, docId, [{ fileName: 'a1b2c3d4.png', bytes: PNG_BYTES }], 2)

    // B 端同步：应用收窄文档后立即 GC 未引用的 b2
    const r2 = await h.engine.syncNow()
    assert.ok(r2.data)
    assert.equal(r2.data.errors.length, 0)
    assert.deepEqual(
      readdirSync(join(docDir, 'assets')).sort(),
      ['a1b2c3d4.png'],
      '未引用资产应在文档应用后被清理'
    )
    // 本轮 phase (d) 不得以磁盘残留为源回推加宽远端 manifest
    assert.deepEqual(parseRemoteManifestFiles(h.relay, manifestKey), ['a1b2c3d4.png'])

    // 下一轮：manifest 不复活（条目不回宽、版本不抬升）
    const r3 = await h.engine.syncNow()
    assert.ok(r3.data)
    assert.equal(r3.data.errors.length, 0)
    assert.deepEqual(parseRemoteManifestFiles(h.relay, manifestKey), ['a1b2c3d4.png'])
    assert.equal(h.relay.files.get(manifestKey)?.version, 2)
    assert.deepEqual(readdirSync(join(docDir, 'assets')).sort(), ['a1b2c3d4.png'])
  } finally {
    h.cleanup()
  }
})

test('manifest stale rebase 拉取最新失败 → 记拉取失败错误，不以 base=0 盲试至重试耗尽', async () => {
  const h = makeHarness()
  try {
    const docId = 'writer-abc12345'
    const docDir = join(h.dir, 'documents', docId)
    mkdirSync(join(docDir, 'assets'), { recursive: true })
    writeFileSync(join(docDir, 'assets', 'a1b2c3d4.png'), PNG_BYTES)
    await h.engine.syncNow() // 基线：manifest v1
    const manifestKey = makeAssetsManifestKey(docId)

    // 本地新增资产 → manifest dirty；put 注入 stale 且 rebase 拉取最新持续失败
    writeFileSync(join(docDir, 'assets', 'b2c3d4e5.gif'), GIF_BYTES)
    h.relay.forceStaleOnNextPut(manifestKey)
    h.relay.failGetSessionKeys.add(manifestKey)

    const r = await h.engine.syncNow()
    assert.ok(r.data)
    assert.equal(r.data.errors.length, 1)
    assert.ok(
      r.data.errors.some((e) => e.key === manifestKey && e.message.includes('拉取最新')),
      '应如实记“拉取最新失败”而非误导性的“重试耗尽”'
    )
    assert.ok(!r.data.errors.some((e) => e.message.includes('重试耗尽')))
    // tracker 基线不更新，远端 manifest 未被 base=0 误传
    assert.equal(h.tracker.getData().keys[manifestKey]?.version, 1)
    assert.equal(h.relay.files.get(manifestKey)?.version, 1)

    // 恢复后下一轮可正常重试成功
    h.relay.failGetSessionKeys.delete(manifestKey)
    const r2 = await h.engine.syncNow()
    assert.ok(r2.data)
    assert.equal(r2.data.errors.length, 0)
    assert.equal(h.relay.files.get(manifestKey)?.version, 2)
    assert.deepEqual(parseRemoteManifestFiles(h.relay, manifestKey).sort(), [
      'a1b2c3d4.png',
      'b2c3d4e5.gif'
    ])
  } finally {
    h.cleanup()
  }
})
