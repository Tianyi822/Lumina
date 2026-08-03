/**
 * sessionSyncTracker 单测：读写、损坏自愈、tombstone 过期清理。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
