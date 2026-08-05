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
    assert.equal(tracker.getTombstone('knowledge-file-file-del')?.deletedAt, '2026-08-05T00:00:00.000Z')
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
