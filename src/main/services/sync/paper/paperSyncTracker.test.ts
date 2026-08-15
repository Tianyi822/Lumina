/**
 * paper 同步 tracker 测试：per-key 版本、tombstone TTL、pack 存取、损坏自愈。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PaperSyncTracker, TOMBSTONE_TTL_MS } from './paperSyncTracker'

function makeTracker(): { tracker: PaperSyncTracker; filePath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-paper-sync-tracker-'))
  const filePath = join(dir, 'paper-sync.json')
  return {
    tracker: new PaperSyncTracker(filePath),
    filePath,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

test('setKey/save/重载往返', () => {
  const { tracker, filePath, cleanup } = makeTracker()
  try {
    tracker.setKey('paper-meta-p1', { version: 3, contentHash: 'abc' })
    tracker.setLastSyncAt('2026-08-05T00:00:00.000Z')
    assert.equal(tracker.save(), true)
    const reloaded = new PaperSyncTracker(filePath)
    assert.deepEqual(reloaded.getData().keys['paper-meta-p1'], { version: 3, contentHash: 'abc' })
    assert.equal(reloaded.getData().lastSyncAt, '2026-08-05T00:00:00.000Z')
  } finally {
    cleanup()
  }
})

test('tombstone 设置与过期清理', () => {
  const { tracker, cleanup } = makeTracker()
  try {
    tracker.setTombstone('old-key', new Date(Date.now() - TOMBSTONE_TTL_MS - 1000).toISOString())
    tracker.setTombstone('new-key', new Date().toISOString())
    tracker.pruneTombstones()
    assert.equal(tracker.getTombstone('old-key'), null)
    assert.ok(tracker.getTombstone('new-key'))
  } finally {
    cleanup()
  }
})

test('pack 存取与移除', () => {
  const { tracker, cleanup } = makeTracker()
  try {
    tracker.setPack('p1', {
      files: {
        'source.pdf': {
          size: 100,
          mtime: '2026-08-05T00:00:00.000Z',
          sha256: 'a'.repeat(64),
          blockIds: ['b'.repeat(64)]
        }
      },
      remoteManifest: null,
      downloadState: 'local'
    })
    const pack = tracker.getPack('p1')
    assert.equal(pack?.downloadState, 'local')
    assert.equal(pack?.files['source.pdf']?.blockIds.length, 1)
    tracker.removePack('p1')
    assert.equal(tracker.getPack('p1'), null)
  } finally {
    cleanup()
  }
})

test('损坏文件自愈为空初始', () => {
  const { tracker, filePath, cleanup } = makeTracker()
  try {
    writeFileSync(filePath, '{{{not json')
    assert.deepEqual(tracker.getData().keys, {})
    assert.deepEqual(tracker.getData().packs, {})
  } finally {
    cleanup()
  }
})

test('schemaVersion 不符自愈', () => {
  const { tracker, filePath, cleanup } = makeTracker()
  try {
    writeFileSync(
      filePath,
      JSON.stringify({ schemaVersion: 2, keys: {}, tombstones: {}, packs: {}, lastSyncAt: null })
    )
    assert.deepEqual(tracker.getData().keys, {})
  } finally {
    cleanup()
  }
})

test('resetIfOwnerChanged：账号变更重置并认领，未绑定只认领', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-paper-tracker-reset-'))
  const file = join(dir, 'paper-sync.json')
  try {
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        ownerAccountId: 'account-a',
        keys: { 'paper-meta-abc': { version: 1, contentHash: 'abc' } },
        tombstones: {},
        packs: {},
        lastSyncAt: null
      }),
      'utf-8'
    )
    const tracker = new PaperSyncTracker(file)
    assert.equal(tracker.resetIfOwnerChanged('account-b'), true)
    assert.deepEqual(tracker.getData().keys, {})
    assert.equal(tracker.getData().ownerAccountId, 'account-b')

    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        keys: { 'paper-meta-abc': { version: 1, contentHash: 'abc' } },
        tombstones: {},
        packs: {},
        lastSyncAt: null
      }),
      'utf-8'
    )
    const legacy = new PaperSyncTracker(file)
    assert.equal(legacy.resetIfOwnerChanged('account-c'), false)
    assert.equal(legacy.getData().keys['paper-meta-abc']?.version, 1)
    assert.equal(legacy.getData().ownerAccountId, 'account-c')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
