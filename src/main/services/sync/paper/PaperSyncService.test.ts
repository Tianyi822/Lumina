/**
 * PaperSyncService 引擎单测：内存假 RelayClient（session-files CAS + blocks map）
 * + tmpdir 真实论文目录 + 真落盘的假 PaperStorageLike（含 filePath 归一化）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  renameSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import type { PaperDocument, PaperAnnotationStore } from '@shared/types/paper'
import type { SyncResult, SessionFileMeta } from '@shared/types/sync'
import type { RelayClient } from '../transport/RelayClient'
import type { SyncService } from '../SyncService'
import { sealPaperMeta, openPaperMeta, sealPaperPack, sealPaperBlock } from './paperSnapshotCrypto'
import { PaperSyncTracker } from './paperSyncTracker'
import { PaperSyncService } from './PaperSyncService'
import { makePaperMetaKey, makePaperAnnotationsKey, makePaperPackKey } from './paperSyncKeys'

const DEK = new Uint8Array(randomBytes(32))

type SyncServiceLike = Pick<SyncService, 'getStatus' | 'getDataKey' | 'getClient'>
type PaperStorageLike = {
  applySyncedMeta(
    paperId: string,
    meta: PaperDocument
  ): Promise<{ success: boolean; error?: string; data?: Uint8Array }>
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

/** 假 RelayClient：session-files CAS + blocks 内容寻址；支持故障注入 */
class FakeRelayClient {
  files = new Map<string, { bytes: Uint8Array; version: number }>()
  blocks = new Map<string, Uint8Array>()
  /** putBlock 全部失败 */
  failPutBlock = false
  /** putSessionFile 对这些 key 首次调用注入 stale（测 CAS 重试） */
  staleOnceKeys = new Set<string>()
  /** listSessionFiles 返回限流 */
  rateLimitList = false

  async listSessionFiles(): Promise<SyncResult<{ sessions: SessionFileMeta[] }>> {
    if (this.rateLimitList) {
      return {
        success: false,
        code: 'rate_limited',
        error: '限流',
        extra: { retryAfterMs: 60_000 }
      }
    }
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
    if (this.staleOnceKeys.has(key)) {
      this.staleOnceKeys.delete(key)
      return { success: false, code: 'stale_session_file', error: '版本过期（故障注入）' }
    }
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
    if (this.failPutBlock) return { success: false, code: 'network_error', error: '模拟网络失败' }
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
    filePath: `/remote-machine/papers/${id}/source.pdf`,
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

function makeAnnotations(paperId: string): PaperAnnotationStore {
  return {
    version: 3,
    paperId,
    annotations: [],
    updatedAt: '2026-08-05T00:00:00.000Z'
  } as PaperAnnotationStore
}

/** 向 relay 种入加密 meta */
function seedRemoteMeta(relay: FakeRelayClient, meta: PaperDocument, version = 1): void {
  const bytes = new TextEncoder().encode(JSON.stringify(meta))
  relay.files.set(makePaperMetaKey(meta.id), { bytes: sealPaperMeta(DEK, bytes), version })
}

/** 向 relay 种入加密 pack manifest + 对应块；返回种入的 manifest 密文 */
function seedRemotePack(
  relay: FakeRelayClient,
  paperId: string,
  files: { path: string; content: Uint8Array }[]
): Uint8Array {
  const manifestFiles = files.map((f) => {
    const { blockId, ciphertext } = sealPaperBlock(DEK, f.content)
    relay.blocks.set(blockId, ciphertext)
    return {
      path: f.path,
      size: f.content.length,
      sha256: createHash('sha256').update(f.content).digest('hex'),
      blockIds: [blockId]
    }
  })
  const manifest = {
    schemaVersion: 1,
    paperId,
    updatedAt: '2026-08-05T00:00:00.000Z',
    files: manifestFiles
  }
  const sealed = sealPaperPack(DEK, new TextEncoder().encode(JSON.stringify(manifest)))
  relay.files.set(makePaperPackKey(paperId), { bytes: sealed, version: 1 })
  return sealed
}

interface Harness {
  engine: PaperSyncService
  relay: FakeRelayClient
  tracker: PaperSyncTracker
  storage: PaperStorageLike & { failPackApply: boolean }
  dir: string
  papersDir: string
  cleanup: () => void
}

function makeHarness(connected = true): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-paper-sync-engine-'))
  const papersDir = join(dir, 'papers')
  mkdirSync(papersDir, { recursive: true })

  const tracker = new PaperSyncTracker(join(dir, 'paper-sync.json'))
  const relay = new FakeRelayClient()

  // 真落盘的假 storage：模拟真实 PaperStorageService 的路径归一化（filePath 改写为
  // 本机布局）与序列化（JSON.stringify(_, null, 2)），applySyncedMeta 返回落盘字节
  const storage: PaperStorageLike & { failPackApply: boolean } = {
    failPackApply: false,
    applySyncedMeta: async (paperId, meta) => {
      const normalized = { ...meta, filePath: join(papersDir, paperId, 'source.pdf') }
      const paperDir = join(papersDir, paperId)
      mkdirSync(paperDir, { recursive: true })
      const bytes = new TextEncoder().encode(JSON.stringify(normalized, null, 2))
      writeFileSync(join(paperDir, 'meta.json'), bytes)
      return { success: true, data: bytes }
    },
    applySyncedAnnotations: async (paperId, store) => {
      const paperDir = join(papersDir, paperId)
      mkdirSync(paperDir, { recursive: true })
      writeFileSync(join(paperDir, 'annotations.json'), JSON.stringify(store, null, 2))
      return { success: true }
    },
    applySyncedPackFile: async (paperId, relPath, stagingFilePath) => {
      if (storage.failPackApply) throw new Error('模拟磁盘写失败')
      const target = join(papersDir, paperId, relPath)
      mkdirSync(join(dirname_safe(target)), { recursive: true })
      renameSync(stagingFilePath, target)
      return { success: true }
    },
    readMeta: async (paperId) => {
      try {
        const content = readFileSync(join(papersDir, paperId, 'meta.json'), 'utf-8')
        return { success: true, data: JSON.parse(content) as PaperDocument }
      } catch {
        return { success: false, data: null }
      }
    },
    readAnnotationStore: async (paperId) => {
      try {
        const content = readFileSync(join(papersDir, paperId, 'annotations.json'), 'utf-8')
        return { success: true, data: JSON.parse(content) as PaperAnnotationStore }
      } catch {
        return { success: false, data: null }
      }
    }
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
    paperStorage: storage,
    paperService,
    tracker,
    broadcast: () => {},
    papersDirProvider: () => papersDir
  })

  return {
    engine,
    relay,
    tracker,
    storage,
    dir,
    papersDir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

function dirname_safe(path: string): string {
  return path.substring(0, path.lastIndexOf('/'))
}

/** 在本地论文目录写入 meta + annotations + 可选 pack 文件 */
function writeLocalPaper(
  papersDir: string,
  paperId: string,
  opts: { meta?: PaperDocument; withAnnotations?: boolean; withPdf?: boolean } = {}
): void {
  const paperDir = join(papersDir, paperId)
  mkdirSync(paperDir, { recursive: true })
  const meta = opts.meta ?? makeMeta(paperId)
  writeFileSync(join(paperDir, 'meta.json'), JSON.stringify(meta, null, 2))
  if (opts.withAnnotations !== false) {
    writeFileSync(
      join(paperDir, 'annotations.json'),
      JSON.stringify(makeAnnotations(paperId), null, 2)
    )
  }
  if (opts.withPdf) {
    writeFileSync(join(paperDir, 'source.pdf'), Buffer.from('PDF content'))
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

test('首次上行：meta + annotations + pack manifest', async () => {
  const h = makeHarness()
  try {
    writeLocalPaper(h.papersDir, 'test-paper', { withPdf: true })

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

test('远端 meta 更新 → 下行合并并落盘', async () => {
  const h = makeHarness()
  try {
    // 先上行基线
    writeLocalPaper(h.papersDir, 'test-paper', {
      meta: makeMeta('test-paper', '旧标题'),
      withPdf: false
    })
    await h.engine.syncNow()

    // 注入远端 meta 更新
    const remoteMeta = makeMeta('test-paper', '新标题', '2099-01-01T00:00:00.000Z')
    const ct = sealPaperMeta(DEK, new TextEncoder().encode(JSON.stringify(remoteMeta, null, 2)))
    h.relay.files.set(makePaperMetaKey('test-paper'), { bytes: ct, version: 2 })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.ok(result.data.downloaded >= 1)
    // 合并结果真正落盘（假 storage 归一化 filePath 后写入）
    const diskMeta = JSON.parse(
      readFileSync(join(h.papersDir, 'test-paper', 'meta.json'), 'utf-8')
    ) as PaperDocument
    assert.equal(diskMeta.title, '新标题')
    assert.equal(diskMeta.filePath, join(h.papersDir, 'test-paper', 'source.pdf'))
  } finally {
    h.cleanup()
  }
})

test('S2 回归：本地 meta 更新胜时下行不误判 dirty 导致乒乓', async () => {
  const h = makeHarness()
  try {
    // 基线：本地旧 meta 上行
    writeLocalPaper(h.papersDir, 'p1', {
      meta: makeMeta('p1', '基线', '2026-01-01T00:00:00.000Z'),
      withPdf: false
    })
    await h.engine.syncNow()
    const baselineVersion = h.relay.files.get(makePaperMetaKey('p1'))?.version ?? 0

    // 场景：远端仍是基线（旧），但本地已改为更新的 meta（updatedAt 更新）
    // 远端 version 保持基线不变，制造"远端版本 >= tracked 但内容旧"的下行触发
    const localNewMeta = makeMeta('p1', '本地最新', '2099-01-01T00:00:00.000Z')
    writeFileSync(
      join(h.papersDir, 'p1', 'meta.json'),
      JSON.stringify(localNewMeta, null, 2),
      'utf-8'
    )

    // 把远端 meta 版本推到比 tracked 新，触发下行分支
    h.relay.files.set(makePaperMetaKey('p1'), {
      bytes: sealPaperMeta(
        DEK,
        new TextEncoder().encode(JSON.stringify(makeMeta('p1', '基线'), null, 2))
      ),
      version: baselineVersion + 1
    })

    const r1 = await h.engine.syncNow()
    assert.ok(r1.data)
    // 关键断言 1：本地更新胜（updatedAt 2099 > 远端基线），下行应 skip 而非 downloaded
    assert.equal(r1.data.downloaded, 0, '本地更新胜时下行应 skip，不记 downloaded')
    assert.ok(r1.data.skipped >= 1, '应计 skipped')

    // 关键断言 2：本地最新 meta 应上行覆盖远端（而非被远端旧内容覆盖）
    assert.ok(r1.data.uploaded >= 1, '本地最新 meta 应上行')
    const remoteBytes = h.relay.files.get(makePaperMetaKey('p1'))?.bytes
    assert.ok(remoteBytes)
    const remoteMeta = JSON.parse(
      new TextDecoder().decode(openPaperMeta(DEK, remoteBytes))
    ) as PaperDocument
    assert.equal(remoteMeta.title, '本地最新', '远端应被本地最新覆盖')

    // 关键断言 3：下一轮稳定，无乒乓（既不重复下行也不重复上行）
    const r2 = await h.engine.syncNow()
    assert.ok(r2.data)
    assert.equal(r2.data.uploaded, 0, '第二轮不应重复上行（无乒乓）')
    assert.equal(r2.data.downloaded, 0, '第二轮不应重复下行（无乒乓）')
  } finally {
    h.cleanup()
  }
})

test('无变更时 skipped', async () => {
  const h = makeHarness()
  try {
    writeLocalPaper(h.papersDir, 'test-paper', { withPdf: false })
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
    writeLocalPaper(h.papersDir, 'test-paper', { withPdf: false })
    await h.engine.syncNow()

    // 删除本地论文
    rmSync(join(h.papersDir, 'test-paper'), { recursive: true, force: true })
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.ok(result.data.deletedRemote >= 1)
  } finally {
    h.cleanup()
  }
})

test('块上传失败：记 error、manifest 不上行、基线不更新，恢复后下轮重试成功', async () => {
  const h = makeHarness()
  try {
    h.relay.failPutBlock = true
    writeLocalPaper(h.papersDir, 'p1', { withPdf: true })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.ok(result.data.errors.length > 0, '块上传失败必须记入 errors')
    assert.ok(result.data.errors.some((e) => e.key === makePaperPackKey('p1')))
    // manifest 不得上行（缺块的 manifest 会让对端永远无法下载）
    assert.equal(h.relay.files.has(makePaperPackKey('p1')), false)
    assert.equal(h.relay.blocks.size, 0)
    // tracker 基线不更新（下轮重切块重试）
    assert.equal(h.tracker.getPack('p1'), null)

    // 恢复后下轮重试成功
    h.relay.failPutBlock = false
    const retry = await h.engine.syncNow()
    assert.ok(retry.data)
    assert.equal(retry.data.errors.length, 0)
    assert.ok(h.relay.files.has(makePaperPackKey('p1')))
    assert.ok(h.relay.blocks.size > 0)
  } finally {
    h.cleanup()
  }
})

test('路径归一化落盘后下一轮不判 dirty（防跨机 meta 无限互传）', async () => {
  const h = makeHarness()
  try {
    // 本地已有论文目录与 source.pdf（懒下载完成后的形态），但还没有 meta.json
    const paperDir = join(h.papersDir, 'p1')
    mkdirSync(paperDir, { recursive: true })
    writeFileSync(join(paperDir, 'source.pdf'), Buffer.from('PDF content'))
    // 远端 meta 的 filePath 是远端机器路径（makeMeta 默认 /remote-machine/...）
    seedRemoteMeta(h.relay, makeMeta('p1'), 1)

    // 第一轮：下行 meta → 假 storage 归一化 filePath 后落盘（落盘字节 ≠ 远端明文）
    await h.engine.syncNow()
    const diskBytes = readFileSync(join(paperDir, 'meta.json'))
    const diskMeta = JSON.parse(diskBytes.toString('utf-8')) as PaperDocument
    assert.equal(diskMeta.filePath, join(h.papersDir, 'p1', 'source.pdf'))

    // 第二轮：落盘字节 hash 已记为基线 → 不判 dirty、不重传
    const round2 = await h.engine.syncNow()
    assert.ok(round2.data)
    assert.equal(round2.data.uploaded, 0, '归一化落盘后不应再触发重传')
  } finally {
    h.cleanup()
  }
})

test('懒下载计数：result.blocksDownloaded 反映实际下载块数', async () => {
  const h = makeHarness()
  try {
    const content = new TextEncoder().encode('hello block')
    seedRemoteMeta(h.relay, makeMeta('p1'), 1)
    seedRemotePack(h.relay, 'p1', [{ path: 'source.pdf', content }])

    // 第一轮：下行 meta + manifest（登记懒下载）
    await h.engine.syncNow()
    assert.equal(h.tracker.getPack('p1')?.downloadState, 'remote')

    // 触发懒下载
    h.engine.requestPaperPackDownload('p1')
    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.blocksDownloaded, 1)
    assert.equal(h.tracker.getPack('p1')?.downloadState, 'local')
    assert.deepEqual(new Uint8Array(readFileSync(join(h.papersDir, 'p1', 'source.pdf'))), content)
  } finally {
    h.cleanup()
  }
})

test('脏 meta 记录不炸整轮：记 error 后继续处理其他论文', async () => {
  const h = makeHarness()
  try {
    seedRemoteMeta(h.relay, makeMeta('p-good'), 1)
    // 合法加密、非法 JSON 的脏记录
    h.relay.files.set(makePaperMetaKey('p-bad'), {
      bytes: sealPaperMeta(DEK, new TextEncoder().encode('{{{not json')),
      version: 1
    })

    const result = await h.engine.syncNow()
    // 有 error → phase error → syncNow 返回失败，但 data 携带部分结果
    assert.equal(result.success, false)
    assert.ok(result.data)
    assert.ok(result.data.errors.some((e) => e.key === makePaperMetaKey('p-bad')))
    // 好论文正常下行落盘
    assert.equal(result.data.downloaded, 1)
    assert.ok(existsSync(join(h.papersDir, 'p-good', 'meta.json')))
    assert.ok(h.tracker.getData().keys[makePaperMetaKey('p-good')])
  } finally {
    h.cleanup()
  }
})

test('坏 staging 块（崩溃残留）被清除，下一轮重新下载成功', async () => {
  const h = makeHarness()
  try {
    const content = new TextEncoder().encode('real block content')
    seedRemoteMeta(h.relay, makeMeta('p1'), 1)
    seedRemotePack(h.relay, 'p1', [{ path: 'source.pdf', content }])
    await h.engine.syncNow()

    // 种入损坏的 staging 块（模拟上次崩溃留下的半截写入）
    const manifest = h.tracker.getPack('p1')?.remoteManifest
    assert.ok(manifest)
    const blockId = manifest.files[0].blockIds[0]
    const stagingDir = join(h.papersDir, 'p1', '.sync-staging')
    mkdirSync(stagingDir, { recursive: true })
    writeFileSync(join(stagingDir, blockId), Buffer.from('corrupted-half-write'))

    // 第一轮下载：命中坏 staging → sha256 校验失败 → 清掉坏块 → error 态
    h.engine.requestPaperPackDownload('p1')
    await h.engine.syncNow()
    assert.equal(h.tracker.getPack('p1')?.downloadState, 'error')
    assert.equal(existsSync(join(stagingDir, blockId)), false, '坏 staging 块必须被清除')

    // 第二轮下载：重新拉块 → 成功
    h.engine.requestPaperPackDownload('p1')
    const retry = await h.engine.syncNow()
    assert.ok(retry.data)
    assert.equal(retry.data.blocksDownloaded, 1)
    assert.equal(h.tracker.getPack('p1')?.downloadState, 'local')
    assert.deepEqual(new Uint8Array(readFileSync(join(h.papersDir, 'p1', 'source.pdf'))), content)
  } finally {
    h.cleanup()
  }
})

test('pack 落盘异常不炸 drain：置 error 态', async () => {
  const h = makeHarness()
  try {
    seedRemoteMeta(h.relay, makeMeta('p1'), 1)
    seedRemotePack(h.relay, 'p1', [
      { path: 'source.pdf', content: new TextEncoder().encode('data') }
    ])
    await h.engine.syncNow()

    h.storage.failPackApply = true
    h.engine.requestPaperPackDownload('p1')
    // 不应 reject（drain 不产生未捕获异常）
    const result = await h.engine.syncNow()
    assert.ok(result)
    assert.equal(h.tracker.getPack('p1')?.downloadState, 'error')
    assert.equal(h.engine.getState().downloads['p1']?.state, 'error')
  } finally {
    h.cleanup()
  }
})

test('含 pack 文件时指纹相等跳过 manifest 上行', async () => {
  const h = makeHarness()
  try {
    writeLocalPaper(h.papersDir, 'p1', { withPdf: true })
    const round1 = await h.engine.syncNow()
    assert.ok(round1.data)
    assert.equal(round1.data.uploaded, 3)
    const manifestBytesV1 = h.relay.files.get(makePaperPackKey('p1'))?.bytes

    // 无任何变更：manifest 指纹相等 → 不再上行
    const round2 = await h.engine.syncNow()
    assert.ok(round2.data)
    assert.equal(round2.data.uploaded, 0)
    assert.equal(h.relay.files.get(makePaperPackKey('p1'))?.version, 1)
    assert.deepEqual(h.relay.files.get(makePaperPackKey('p1'))?.bytes, manifestBytesV1)
  } finally {
    h.cleanup()
  }
})

test('懒下载待拉取时不上行空 manifest 覆盖远端', async () => {
  const h = makeHarness()
  try {
    // 远端有含文件的 manifest；本地只有 meta，没有任何 pack 文件
    const content = new TextEncoder().encode('remote pdf')
    const sealedManifest = seedRemotePack(h.relay, 'p1', [{ path: 'source.pdf', content }])
    writeLocalPaper(h.papersDir, 'p1', { withPdf: false })

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    // 远端 manifest 原样保留（version/字节均未变）
    const remote = h.relay.files.get(makePaperPackKey('p1'))
    assert.ok(remote)
    assert.equal(remote.version, 1)
    assert.deepEqual(remote.bytes, sealedManifest)
    // remoteManifest 保留待懒下载
    assert.ok(h.tracker.getPack('p1')?.remoteManifest)
    assert.equal(h.tracker.getPack('p1')?.downloadState, 'remote')
  } finally {
    h.cleanup()
  }
})

test('CAS stale 冲突重试后上行成功', async () => {
  const h = makeHarness()
  try {
    writeLocalPaper(h.papersDir, 'p1', { withPdf: false })
    await h.engine.syncNow()
    assert.equal(h.relay.files.get(makePaperMetaKey('p1'))?.version, 1)

    // 本地修改 + 注入一次 stale（模拟他设备并发上行）
    writeLocalPaper(h.papersDir, 'p1', {
      meta: makeMeta('p1', '并发修改', '2099-01-01T00:00:00.000Z'),
      withPdf: false
    })
    h.relay.staleOnceKeys.add(makePaperMetaKey('p1'))

    const result = await h.engine.syncNow()
    assert.ok(result.data)
    assert.equal(result.data.errors.length, 0)
    // meta + annotations 各上行一次（meta 经 stale 重试成功）
    assert.ok(result.data.uploaded >= 1)
    assert.equal(h.relay.files.get(makePaperMetaKey('p1'))?.version, 2)
    assert.equal(h.tracker.getData().keys[makePaperMetaKey('p1')]?.version, 2)
  } finally {
    h.cleanup()
  }
})

test('限流窗口内 syncNow 返回 rate_limited 而非陈旧成功', async () => {
  const h = makeHarness()
  try {
    h.relay.rateLimitList = true
    // 第一轮：listSessionFiles 限流 → 整轮失败并进入限流窗口
    const first = await h.engine.syncNow()
    assert.equal(first.success, false)
    // 第二轮：命中限流窗口
    const second = await h.engine.syncNow()
    assert.equal(second.success, false)
    assert.equal(second.code, 'rate_limited')
  } finally {
    h.cleanup()
  }
})
