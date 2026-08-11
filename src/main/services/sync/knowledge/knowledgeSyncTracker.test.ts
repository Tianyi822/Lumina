import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnowledgeSyncTracker, TOMBSTONE_TTL_MS } from './knowledgeSyncTracker'

function makeTmpTracker(): { tracker: KnowledgeSyncTracker; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-knowledge-sync-tracker-'))
  const tracker = new KnowledgeSyncTracker(join(dir, 'knowledge-sync.json'))
  return { tracker, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('缺失文件时返回空初始数据', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    const data = tracker.getData()
    assert.equal(data.schemaVersion, 1)
    assert.deepEqual(data.keys, {})
    assert.deepEqual(data.tombstones, {})
    assert.equal(data.lastSyncAt, null)
  } finally {
    cleanup()
  }
})

test('损坏文件自愈为空初始', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-knowledge-sync-tracker-'))
  const filePath = join(dir, 'knowledge-sync.json')
  writeFileSync(filePath, '{invalid json', 'utf-8')
  const tracker = new KnowledgeSyncTracker(filePath)
  try {
    assert.deepEqual(tracker.getData().keys, {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('setKey/removeKey/setTombstone/getTombstone 正确读写', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    tracker.setKey('knowledge-bases', { version: 2, contentHash: 'hash-kb' })
    tracker.setTombstone('knowledge-file-file-del', '2026-08-05T00:00:00.000Z')
    const data = tracker.getData()
    assert.equal(data.keys['knowledge-bases']?.version, 2)
    assert.equal(data.tombstones['knowledge-file-file-del']?.deletedAt, '2026-08-05T00:00:00.000Z')
    assert.equal(
      tracker.getTombstone('knowledge-file-file-del')?.deletedAt,
      '2026-08-05T00:00:00.000Z'
    )
    tracker.removeKey('knowledge-bases')
    assert.equal(tracker.getData().keys['knowledge-bases'], undefined)
  } finally {
    cleanup()
  }
})

test('save 后文件存在且无 tmp 残留', () => {
  const { tracker, dir, cleanup } = makeTmpTracker()
  try {
    tracker.getData()
    tracker.setKey('knowledge-bases', { version: 1, contentHash: 'h' })
    tracker.save()
    assert.ok(existsSync(join(dir, 'knowledge-sync.json')))
    assert.equal(existsSync(join(dir, 'knowledge-sync.json.tmp')), false)
    const raw = JSON.parse(readFileSync(join(dir, 'knowledge-sync.json'), 'utf-8'))
    assert.equal(raw.keys['knowledge-bases'].version, 1)
  } finally {
    cleanup()
  }
})

test('pruneTombstones 清理超期记录', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    const oldDate = new Date(Date.now() - TOMBSTONE_TTL_MS - 1000).toISOString()
    const newDate = new Date().toISOString()
    tracker.setTombstone('old-key', oldDate)
    tracker.setTombstone('new-key', newDate)
    tracker.pruneTombstones()
    const data = tracker.getData()
    assert.equal(data.tombstones['old-key'], undefined)
    assert.ok(data.tombstones['new-key'])
  } finally {
    cleanup()
  }
})

test('pruneTombstones 保留 deletedAt 无法解析的记录（防复活不失效）', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    tracker.setTombstone('broken-key', 'not-a-date')
    tracker.setTombstone('old-key', new Date(Date.now() - TOMBSTONE_TTL_MS - 1000).toISOString())
    tracker.pruneTombstones()
    // 损坏记录保留，超期记录清理
    assert.ok(tracker.getTombstone('broken-key'))
    assert.equal(tracker.getTombstone('old-key'), null)
  } finally {
    cleanup()
  }
})

// === file-manifest 块基线追踪（避免每轮重切块）===

test('setKey 带 fileBlocks 可正确读取', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    tracker.setKey('knowledge-file-manifest-file-abc', {
      version: 3,
      contentHash: 'manifest-hash',
      fileBlocks: {
        size: 1024,
        mtime: '2026-08-10T00:00:00.000Z',
        sha256: 'file-sha',
        blockIds: ['block-1', 'block-2']
      }
    })
    const entry = tracker.getData().keys['knowledge-file-manifest-file-abc']
    assert.equal(entry.version, 3)
    assert.equal(entry.fileBlocks?.blockIds.length, 2)
    assert.equal(entry.fileBlocks?.sha256, 'file-sha')
  } finally {
    cleanup()
  }
})

test('fileBlocks 持久化后重新加载保持完整', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-knowledge-sync-tracker-'))
  const filePath = join(dir, 'knowledge-sync.json')
  try {
    const tracker = new KnowledgeSyncTracker(filePath)
    tracker.setKey('knowledge-file-manifest-file-xyz', {
      version: 5,
      contentHash: 'h',
      fileBlocks: {
        size: 2048,
        mtime: '2026-08-11T12:00:00.000Z',
        sha256: 'sha-xyz',
        blockIds: ['b1', 'b2', 'b3']
      }
    })
    tracker.save()
    // 新实例重新加载
    const reloaded = new KnowledgeSyncTracker(filePath)
    const entry = reloaded.getData().keys['knowledge-file-manifest-file-xyz']
    assert.equal(entry.fileBlocks?.size, 2048)
    assert.deepEqual(entry.fileBlocks?.blockIds, ['b1', 'b2', 'b3'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('isTrackerData 接受无 fileBlocks 的旧条目（向后兼容）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-knowledge-sync-tracker-'))
  const filePath = join(dir, 'knowledge-sync.json')
  const oldData = {
    schemaVersion: 1,
    keys: {
      'knowledge-bases': { version: 1, contentHash: 'h' },
      'knowledge-file-manifest-file-1': { version: 2, contentHash: 'mh' }
    },
    tombstones: {},
    lastSyncAt: null
  }
  writeFileSync(filePath, JSON.stringify(oldData), 'utf-8')
  try {
    const tracker = new KnowledgeSyncTracker(filePath)
    // 旧数据无 fileBlocks 字段，应正常加载而非重置
    const data = tracker.getData()
    assert.equal(data.keys['knowledge-bases']?.version, 1)
    assert.equal(data.keys['knowledge-file-manifest-file-1']?.version, 2)
    assert.equal(data.keys['knowledge-file-manifest-file-1']?.fileBlocks, undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('isTrackerData 拒绝 fileBlocks 字段类型非法的数据', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-knowledge-sync-tracker-'))
  const filePath = join(dir, 'knowledge-sync.json')
  const badData = {
    schemaVersion: 1,
    keys: {
      'knowledge-file-manifest-file-1': {
        version: 2,
        contentHash: 'h',
        fileBlocks: { size: 'not-a-number', mtime: 'x', sha256: 's', blockIds: [] }
      }
    },
    tombstones: {},
    lastSyncAt: null
  }
  writeFileSync(filePath, JSON.stringify(badData), 'utf-8')
  try {
    const tracker = new KnowledgeSyncTracker(filePath)
    // fileBlocks 字段非法 → 整个 tracker 重置
    assert.deepEqual(tracker.getData().keys, {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
