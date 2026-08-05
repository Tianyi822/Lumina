/**
 * PaperSyncService 引擎单测：内存假 RelayClient（session-files CAS + blocks map）
 * + tmpdir 真实论文目录 + 假 PaperStorageLike。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { PaperDocument, PaperAnnotationStore } from '@shared/types/paper'
import type { SyncResult, SessionFileMeta } from '@shared/types/sync'
import type { RelayClient } from '../transport/RelayClient'
import type { SyncService } from '../SyncService'
import { sealPaperMeta } from './paperSnapshotCrypto'
import { PaperSyncTracker } from './paperSyncTracker'
import { PaperSyncService } from './PaperSyncService'
import { makePaperMetaKey, makePaperAnnotationsKey, makePaperPackKey } from './paperSyncKeys'

const DEK = new Uint8Array(randomBytes(32))

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type PaperStorageLike = {
  applySyncedMeta(
    paperId: string,
    meta: PaperDocument
  ): Promise<{ success: boolean; error?: string }>
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

/** 假 RelayClient：session-files CAS + blocks 内容寻址 */
class FakeRelayClient {
  files = new Map<string, { bytes: Uint8Array; version: number }>()
  blocks = new Map<string, Uint8Array>()

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
    if (current !== baseVersion)
      return { success: false, code: 'stale_session_file', error: '版本过期' }
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
    if (file.version !== baseVersion)
      return { success: false, code: 'stale_session_file', error: '版本过期' }
    this.files.delete(key)
    return { success: true, data: { deleted: true } }
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
  async blocksMissing(ids: string[]): Promise<SyncResult<{ missing: string[] }>> {
    return { success: true, data: { missing: ids.filter((id) => !this.blocks.has(id)) } }
  }
}

function makeMeta(
  id: string,
  title = '测试论文',
  updatedAt = '2026-08-05T00:00:00.000Z'
): PaperDocument {
  return {
    id,
    fileName: `${id}.pdf`,
    title,
    filePath: `/papers/${id}/source.pdf`,
    fileHash: 'a'.repeat(64),
    fileSize: 1000,
    pageCount: 1,
    status: 'completed',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt,
    lastOpenedAt: updatedAt,
    ocrProvider: 'glm',
    ocrModel: 'glm-4v',
    completedPageCount: 1
  } as PaperDocument
}

interface Harness {
  engine: PaperSyncService
  relay: FakeRelayClient
  tracker: PaperSyncTracker
  dir: string
  cleanup: () => void
}

function makeHarness(connected = true): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-paper-sync-engine-'))
  const papersDir = join(dir, 'papers')
  mkdirSync(papersDir, { recursive: true })

  const tracker = new PaperSyncTracker(join(dir, 'paper-sync.json'))
  const relay = new FakeRelayClient()

  const paperStorage: PaperStorageLike = {
    applySyncedMeta: async () => ({ success: true }),
    applySyncedAnnotations: async () => ({ success: true }),
    applySyncedPackFile: async (_paperId, relPath, stagingFilePath) => {
      const target = join(papersDir, 'test-paper', relPath)
      mkdirSync(join(dirname_safe(target)), { recursive: true })
      renameSync(stagingFilePath, target)
      return { success: true }
    },
    readMeta: async () => ({ success: false, data: null }),
    readAnnotationStore: async () => ({ success: false, data: null })
  }

  const paperService: PaperServiceLike = {
    applySyncedPaperDeletion: async () => ({ success: true })
  }

  const syncService: SyncServiceLike = {
    getStatus: () => ({ connected }) as ReturnType<SyncService['getStatus']>,
    getDataKey: () => DEK,
    getClient: () => relay as unknown as RelayClient
  }

  const engine = new PaperSyncService({
    syncService,
    paperStorage,
    paperService,
    tracker,
    broadcast: () => {},
    papersDirProvider: () => papersDir
  })

  return {
    engine,
    relay,
    tracker,
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

function dirname_safe(path: string): string {
  return path.substring(0, path.lastIndexOf('/'))
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

test('首次上行：meta + annotations + pack manifest', async () => {
  const h = makeHarness()
  try {
    const paperDir = join(h.dir, 'papers', 'test-paper')
    mkdirSync(paperDir, { recursive: true })
    // meta.json
    writeFileSync(join(paperDir, 'meta.json'), JSON.stringify(makeMeta('test-paper'), null, 2))
    // annotations.json
    writeFileSync(
      join(paperDir, 'annotations.json'),
      JSON.stringify(
        {
          version: 3,
          paperId: 'test-paper',
          annotations: [],
          updatedAt: '2026-08-05T00:00:00.000Z'
        } as PaperAnnotationStore,
        null,
        2
      )
    )
    // source.pdf（pack 文件）
    writeFileSync(join(paperDir, 'source.pdf'), Buffer.from('PDF content'))

    const result = await h.engine.syncNow()
    assert.ok(result.success)
    assert.ok(result.data)
    // 3 session-files key 上行（meta + annotations + pack manifest）
    assert.equal(result.data.uploaded, 3)
    assert.ok(h.relay.files.has(makePaperMetaKey('test-paper')))
    assert.ok(h.relay.files.has(makePaperAnnotationsKey('test-paper')))
    assert.ok(h.relay.files.has(makePaperPackKey('test-paper')))
    // source.pdf 被切块上行
    assert.ok(result.data.blocksUploaded > 0)
  } finally {
    h.cleanup()
  }
})

test('远端 meta 更新 → 下行合并', async () => {
  const h = makeHarness()
  try {
    // 先上行基线
    const paperDir = join(h.dir, 'papers', 'test-paper')
    mkdirSync(paperDir, { recursive: true })
    writeFileSync(
      join(paperDir, 'meta.json'),
      JSON.stringify(makeMeta('test-paper', '旧标题'), null, 2)
    )
    writeFileSync(join(paperDir, 'annotations.json'), '[]')
    await h.engine.syncNow()

    // 注入远端 meta 更新
    const remoteMeta = makeMeta('test-paper', '新标题', '2099-01-01T00:00:00.000Z')
    const ct = sealPaperMeta(DEK, new TextEncoder().encode(JSON.stringify(remoteMeta, null, 2)))
    h.relay.files.set(makePaperMetaKey('test-paper'), { bytes: ct, version: 2 })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.ok(result.data.downloaded >= 1)
  } finally {
    h.cleanup()
  }
})

test('无变更时 skipped', async () => {
  const h = makeHarness()
  try {
    const paperDir = join(h.dir, 'papers', 'test-paper')
    mkdirSync(paperDir, { recursive: true })
    writeFileSync(join(paperDir, 'meta.json'), JSON.stringify(makeMeta('test-paper'), null, 2))
    writeFileSync(join(paperDir, 'annotations.json'), '[]')
    await h.engine.syncNow()
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.uploaded, 0)
  } finally {
    h.cleanup()
  }
})

test('本地删除论文 → 上行删除 3 key', async () => {
  const h = makeHarness()
  try {
    const paperDir = join(h.dir, 'papers', 'test-paper')
    mkdirSync(paperDir, { recursive: true })
    writeFileSync(join(paperDir, 'meta.json'), JSON.stringify(makeMeta('test-paper'), null, 2))
    writeFileSync(join(paperDir, 'annotations.json'), '[]')
    await h.engine.syncNow()

    // 删除本地论文
    rmSync(paperDir, { recursive: true, force: true })
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.ok(result.data.deletedRemote >= 1)
  } finally {
    h.cleanup()
  }
})
