/**
 * KnowledgeSyncService 引擎单测：内存假 RelayClient + tmpdir 真实 knowledge 目录。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { KnowledgeBase, FileItem } from '@shared/types/knowledge'
import type { SyncResult, SessionFileMeta } from '@shared/types/sync'
import type { RelayClient } from '../transport/RelayClient'
import type { SyncService } from '../SyncService'
import { sealKnowledgeFile } from './knowledgeSnapshotCrypto'
import { KnowledgeSyncTracker } from './knowledgeSyncTracker'
import { KnowledgeSyncService } from './KnowledgeSyncService'
import { makeBasesKey, makeMetadataKey, makeFileKey } from './knowledgeSyncKeys'

const DEK = new Uint8Array(randomBytes(32))

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type KnowledgeStorageLike = {
  readKnowledgeBasesForSync(): Promise<KnowledgeBase[]>
  applySyncedKnowledgeBases(merged: KnowledgeBase[]): Promise<{ success: boolean; error?: string }>
}
type FileStorageLike = {
  readFilesMetadataForSync(): FileItem[]
  applySyncedFilesMetadata(merged: FileItem[]): Promise<{ success: boolean; error?: string }>
  applySyncedFileDeletion(fileId: string): Promise<{ success: boolean; error?: string }>
  applySyncedFileContent(
    fileId: string,
    bytes: Uint8Array
  ): Promise<{ success: boolean; error?: string }>
}
type KnowledgeManagerLike = {
  reindexKnowledgeBase(kbId: string): Promise<void>
  vectorDBExists(kbId: string): boolean
}

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
}

function makeKB(id: string, name = '测试库'): KnowledgeBase {
  return {
    id,
    name,
    embeddingConfig: { baseUrl: 'http://x', model: 'm', dimensions: 768 },
    embeddingDimension: 768,
    chunkSize: 500,
    chunkOverlap: 50,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    linkedFileIds: []
  } as KnowledgeBase
}

function makeFile(id: string, filePath: string, absolutePath: string): FileItem {
  return {
    id,
    name: `${id}.txt`,
    filePath,
    absolutePath,
    fileType: 'text/plain',
    size: 100,
    uploadedAt: '2026-08-05T00:00:00.000Z',
    usedByKBIds: [],
    sourceKind: 'uploaded'
  } as FileItem
}

interface Harness {
  engine: KnowledgeSyncService
  relay: FakeRelayClient
  tracker: KnowledgeSyncTracker
  dir: string
  reindexCalls: string[]
  cleanup: () => void
}

function makeHarness(connected = true): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-knowledge-sync-engine-'))
  const filesDir = join(dir, 'data', 'files')
  mkdirSync(filesDir, { recursive: true })

  let memKB: KnowledgeBase[] = []
  let memFiles: FileItem[] = []
  const reindexCalls: string[] = []

  const knowledgeStorage: KnowledgeStorageLike = {
    readKnowledgeBasesForSync: async () => [...memKB],
    applySyncedKnowledgeBases: async (merged) => {
      memKB = merged
      return { success: true }
    }
  }

  const fileStorage: FileStorageLike = {
    readFilesMetadataForSync: () => [...memFiles],
    applySyncedFilesMetadata: async (merged) => {
      memFiles = merged
      return { success: true }
    },
    applySyncedFileDeletion: async (fileId) => {
      memFiles = memFiles.filter((f) => f.id !== fileId)
      return { success: true }
    },
    applySyncedFileContent: async (fileId, bytes) => {
      const file = memFiles.find((f) => f.id === fileId)
      if (!file) return { success: false, error: 'not found' }
      writeFileSync(join(filesDir, file.filePath), bytes)
      return { success: true }
    }
  }

  const knowledgeManager: KnowledgeManagerLike = {
    reindexKnowledgeBase: async (kbId) => {
      reindexCalls.push(kbId)
    },
    vectorDBExists: () => false // 总是返回 false，触发 reindex
  }

  const tracker = new KnowledgeSyncTracker(join(dir, 'knowledge-sync.json'))
  const relay = new FakeRelayClient()

  const syncService: SyncServiceLike = {
    getStatus: () => ({ connected }) as ReturnType<SyncService['getStatus']>,
    getDataKey: () => DEK,
    getClient: () => relay as unknown as RelayClient
  }

  const engine = new KnowledgeSyncService({
    syncService,
    knowledgeStorage,
    fileStorage,
    knowledgeManager,
    tracker,
    broadcast: () => {},
    knowledgeDirProvider: () => dir
  })

  return {
    engine,
    relay,
    tracker,
    dir,
    reindexCalls,
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

test('首次上行：bases + metadata + uploaded 文件', async () => {
  const h = makeHarness()
  try {
    // 准备本地数据
    const kb = makeKB('kb-1')
    const file = makeFile('file-1', '123-abc.txt', join(h.dir, 'data', 'files', '123-abc.txt'))
    writeFileSync(file.absolutePath, '文件内容')

    // 测试通过预置磁盘 JSON 让引擎 scanLocal 读到 bases/metadata，
    // 不再直接访问 h.engine['_deps'].knowledgeStorage 内存
    writeFileSync(join(h.dir, 'knowledge-bases.json'), JSON.stringify([kb], null, 2))
    writeFileSync(join(h.dir, 'files-metadata.json'), JSON.stringify([file], null, 2))

    const result = await h.engine.syncNow()
    assert.ok(result.success)
    assert.ok(result.data)
    // bases + metadata + 1 file = 3 uploaded
    assert.equal(result.data.uploaded, 3)
    assert.ok(h.relay.files.has(makeBasesKey()))
    assert.ok(h.relay.files.has(makeMetadataKey()))
    assert.ok(h.relay.files.has(makeFileKey('file-1')))
  } finally {
    h.cleanup()
  }
})

test('远端 KB 更新 → 下行合并', async () => {
  const h = makeHarness()
  try {
    // 先上行基线
    writeFileSync(join(h.dir, 'knowledge-bases.json'), JSON.stringify([makeKB('kb-1')], null, 2))
    writeFileSync(join(h.dir, 'files-metadata.json'), '[]')
    await h.engine.syncNow()

    // 注入远端 KB 更新
    const remoteKB = makeKB('kb-1', '远端改名')
    remoteKB.updatedAt = '2099-01-01T00:00:00.000Z'
    const ct = sealKnowledgeFile(DEK, new TextEncoder().encode(JSON.stringify([remoteKB], null, 2)))
    h.relay.files.set(makeBasesKey(), { bytes: ct, version: 2 })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.downloaded, 1)
  } finally {
    h.cleanup()
  }
})

test('远端 uploaded 文件 → 下行落盘', async () => {
  const h = makeHarness()
  try {
    // 先上行 metadata（含 file 定义）
    const file = makeFile('file-1', '123-abc.txt', join(h.dir, 'data', 'files', '123-abc.txt'))
    writeFileSync(file.absolutePath, '原始内容')
    writeFileSync(join(h.dir, 'knowledge-bases.json'), '[]')
    writeFileSync(join(h.dir, 'files-metadata.json'), JSON.stringify([file], null, 2))
    await h.engine.syncNow()

    // 注入远端文件更新
    const remoteContent = new TextEncoder().encode('远端文件内容')
    const ct = sealKnowledgeFile(DEK, remoteContent)
    h.relay.files.set(makeFileKey('file-1'), { bytes: ct, version: 2 })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.ok(result.data.downloaded >= 1)
  } finally {
    h.cleanup()
  }
})

test('reindex 触发（KB 下行后无向量库）', async () => {
  const h = makeHarness()
  try {
    // 注入远端 KB
    const remoteKB = makeKB('kb-new')
    const ct = sealKnowledgeFile(DEK, new TextEncoder().encode(JSON.stringify([remoteKB], null, 2)))
    h.relay.files.set(makeBasesKey(), { bytes: ct, version: 1 })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.ok(result.data.reindexed >= 1)
    assert.ok(h.reindexCalls.includes('kb-new'))
  } finally {
    h.cleanup()
  }
})

test('paper_file/paper_note 不上行', async () => {
  const h = makeHarness()
  try {
    const uploaded = makeFile('file-up', '123.txt', join(h.dir, 'data', 'files', '123.txt'))
    const paperFile = makeFile('paper-file-x', '', '')
    paperFile.sourceKind = 'paper_file'
    const paperNote = makeFile('paper-note-x', '', '')
    paperNote.sourceKind = 'paper_note'

    writeFileSync(uploaded.absolutePath, '内容')
    writeFileSync(join(h.dir, 'knowledge-bases.json'), '[]')
    writeFileSync(
      join(h.dir, 'files-metadata.json'),
      JSON.stringify([uploaded, paperFile, paperNote], null, 2)
    )

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    // bases + metadata + 1 uploaded file = 3（paper_file/paper_note 不上行）
    assert.equal(result.data.uploaded, 3)
    assert.ok(!h.relay.files.has(makeFileKey('paper-file-x')))
    assert.ok(!h.relay.files.has(makeFileKey('paper-note-x')))
  } finally {
    h.cleanup()
  }
})

test('无变更时 skipped', async () => {
  const h = makeHarness()
  try {
    writeFileSync(join(h.dir, 'knowledge-bases.json'), '[]')
    writeFileSync(join(h.dir, 'files-metadata.json'), '[]')
    await h.engine.syncNow()
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.skipped, 2) // bases + metadata
  } finally {
    h.cleanup()
  }
})
