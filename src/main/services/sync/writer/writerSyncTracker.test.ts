import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WriterSyncTracker, TOMBSTONE_TTL_MS } from './writerSyncTracker'

function makeTmpTracker(): { tracker: WriterSyncTracker; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-writer-sync-tracker-'))
  const tracker = new WriterSyncTracker(join(dir, 'writer-sync.json'))
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
  const dir = mkdtempSync(join(tmpdir(), 'lumina-writer-sync-tracker-'))
  const filePath = join(dir, 'writer-sync.json')
  writeFileSync(filePath, '{invalid json', 'utf-8')
  const tracker = new WriterSyncTracker(filePath)
  try {
    assert.deepEqual(tracker.getData().keys, {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('setKey/getKey/setTombstone/getTombstone 正确读写', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    tracker.setKey('writer-doc-writer-abc', { version: 3, contentHash: 'hash123' })
    tracker.setTombstone('writer-doc-writer-del', '2026-08-05T00:00:00.000Z')
    const data = tracker.getData()
    assert.equal(data.keys['writer-doc-writer-abc']?.version, 3)
    assert.equal(data.tombstones['writer-doc-writer-del']?.deletedAt, '2026-08-05T00:00:00.000Z')
    assert.equal(
      tracker.getTombstone('writer-doc-writer-del')?.deletedAt,
      '2026-08-05T00:00:00.000Z'
    )
    assert.equal(tracker.getTombstone('writer-doc-nope'), null)
  } finally {
    cleanup()
  }
})

test('removeKey 删除 key 记录', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    tracker.setKey('writer-index', { version: 1, contentHash: 'h' })
    tracker.removeKey('writer-index')
    assert.equal(tracker.getData().keys['writer-index'], undefined)
  } finally {
    cleanup()
  }
})

test('save 后文件存在且无 tmp 残留', () => {
  const { tracker, dir, cleanup } = makeTmpTracker()
  try {
    tracker.getData()
    tracker.setKey('writer-index', { version: 1, contentHash: 'h' })
    tracker.save()
    assert.ok(existsSync(join(dir, 'writer-sync.json')))
    assert.equal(existsSync(join(dir, 'writer-sync.json.tmp')), false)
    const raw = JSON.parse(readFileSync(join(dir, 'writer-sync.json'), 'utf-8'))
    assert.equal(raw.keys['writer-index'].version, 1)
  } finally {
    cleanup()
  }
})

test('pruneTombstones 清理超期记录', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    const now = Date.parse('2026-08-05T00:00:00.000Z')
    // 超 TTL 1 秒 → 应被清理
    tracker.setTombstone('old-key', new Date(now - TOMBSTONE_TTL_MS - 1000).toISOString())
    // 当前时刻 → 保留
    tracker.setTombstone('new-key', new Date(now).toISOString())
    tracker.pruneTombstones(now)
    const data = tracker.getData()
    assert.equal(data.tombstones['old-key'], undefined)
    assert.ok(data.tombstones['new-key'])
  } finally {
    cleanup()
  }
})

test('resetIfOwnerChanged：账号变更重置并认领，未绑定只认领', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-writer-tracker-reset-'))
  const file = join(dir, 'writer-sync.json')
  try {
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        ownerAccountId: 'account-a',
        keys: { 'writer-index': { version: 2, contentHash: 'abc' } },
        tombstones: {},
        lastSyncAt: null
      }),
      'utf-8'
    )
    const tracker = new WriterSyncTracker(file)
    assert.equal(tracker.resetIfOwnerChanged('account-b'), true)
    assert.deepEqual(tracker.getData().keys, {})
    assert.equal(tracker.getData().ownerAccountId, 'account-b')
    assert.equal(JSON.parse(readFileSync(file, 'utf-8')).ownerAccountId, 'account-b')

    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        keys: { 'writer-index': { version: 2, contentHash: 'abc' } },
        tombstones: {},
        lastSyncAt: null
      }),
      'utf-8'
    )
    const legacy = new WriterSyncTracker(file)
    assert.equal(legacy.resetIfOwnerChanged('account-c'), false)
    assert.equal(legacy.getData().keys['writer-index']?.version, 2)
    assert.equal(legacy.getData().ownerAccountId, 'account-c')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
