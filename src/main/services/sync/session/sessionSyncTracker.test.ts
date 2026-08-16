/**
 * sessionSyncTracker 单测：读写、损坏自愈、tombstone 过期清理。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionSyncTracker, TOMBSTONE_TTL_MS } from './sessionSyncTracker'

function makeTracker(): { tracker: SessionSyncTracker; dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-tracker-test-'))
  const file = join(dir, 'session-sync.json')
  return { tracker: new SessionSyncTracker(file), dir, file }
}

test('空初始：无文件时返回空数据', () => {
  const { tracker, dir } = makeTracker()
  try {
    const data = tracker.getData()
    assert.equal(data.schemaVersion, 1)
    assert.equal(data.lastSyncAt, null)
    assert.deepEqual(data.sessions, {})
    assert.deepEqual(data.tombstones, {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('setSession/save 后可重新加载', () => {
  const { tracker, dir, file } = makeTracker()
  try {
    tracker.setSession('session-1-abc', { version: 3, contentHash: 'deadbeef' })
    tracker.setLastSyncAt('2026-08-03T00:00:00.000Z')
    assert.equal(tracker.save(), true)
    const reloaded = new SessionSyncTracker(file)
    assert.equal(reloaded.getData().sessions['session-1-abc']?.version, 3)
    assert.equal(reloaded.getData().lastSyncAt, '2026-08-03T00:00:00.000Z')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('损坏文件自愈为空初始', () => {
  const { tracker, dir, file } = makeTracker()
  try {
    writeFileSync(file, '这不是JSON', 'utf-8')
    assert.deepEqual(tracker.getData().sessions, {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('结构非法（字段类型错误）自愈为空初始', () => {
  const { tracker, dir, file } = makeTracker()
  try {
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, sessions: 'not-an-object' }), 'utf-8')
    assert.deepEqual(tracker.getData().sessions, {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tombstone 写入/读取/过期清理', () => {
  const { tracker, dir } = makeTracker()
  try {
    const now = Date.parse('2026-08-03T00:00:00.000Z')
    tracker.setTombstone('session-old-abc', new Date(now - TOMBSTONE_TTL_MS - 1000).toISOString())
    tracker.setTombstone('session-new-abc', new Date(now).toISOString())
    tracker.pruneTombstones(now)
    assert.equal(tracker.getTombstone('session-old-abc'), null)
    assert.notEqual(tracker.getTombstone('session-new-abc'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('损坏 tombstone（deletedAt 不可解析）不被 prune 删除，防止远端复活', () => {
  const { tracker, dir } = makeTracker()
  try {
    const now = Date.parse('2026-08-03T00:00:00.000Z')
    tracker.setTombstone('session-corrupt', 'not-a-date')
    tracker.pruneTombstones(now)
    assert.notEqual(
      tracker.getTombstone('session-corrupt'),
      null,
      '损坏 tombstone 应保留以拦截远端同 key 复活'
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('removeSession 同时清除会话记录', () => {
  const { tracker, dir } = makeTracker()
  try {
    tracker.setSession('session-1-abc', { version: 1, contentHash: 'x' })
    tracker.removeSession('session-1-abc')
    assert.deepEqual(tracker.getData().sessions, {})
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resetIfOwnerChanged：账号变更重置并持久化，同账号/未绑定不重置', () => {
  const { dir, file } = makeTracker()
  try {
    // 属于 account-a 的 stale tracker
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        ownerAccountId: 'account-a',
        lastSyncAt: null,
        sessions: { 'session-1-abc': { version: 3, contentHash: 'deadbeef' } },
        tombstones: {}
      }),
      'utf-8'
    )
    const tracker = new SessionSyncTracker(file)
    assert.equal(tracker.resetIfOwnerChanged('account-b'), true)
    assert.deepEqual(tracker.getData().sessions, {})
    assert.equal(tracker.getData().ownerAccountId, 'account-b')
    assert.equal(JSON.parse(readFileSync(file, 'utf-8')).ownerAccountId, 'account-b')

    // 同账号：不动作
    const same = new SessionSyncTracker(file)
    same.setSession('session-2-xyz', { version: 1, contentHash: 'abc' })
    same.save()
    assert.equal(same.resetIfOwnerChanged('account-b'), false)
    assert.equal(same.getData().sessions['session-2-xyz']?.version, 1)

    // 未绑定（旧格式文件缺字段）：认领不重置
    writeFileSync(
      file,
      JSON.stringify({
        schemaVersion: 1,
        lastSyncAt: null,
        sessions: { 'session-1-abc': { version: 3, contentHash: 'deadbeef' } },
        tombstones: {}
      }),
      'utf-8'
    )
    const legacy = new SessionSyncTracker(file)
    assert.equal(legacy.resetIfOwnerChanged('account-c'), false)
    assert.equal(legacy.getData().sessions['session-1-abc']?.version, 3)
    assert.equal(legacy.getData().ownerAccountId, 'account-c')

    // accountId 未知：完全不动作
    assert.equal(legacy.resetIfOwnerChanged(null), false)
    assert.equal(legacy.getData().ownerAccountId, 'account-c')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
