/**
 * configSyncTracker 单测：读写、appliedRemoteHead、损坏自愈、旧版多余字段宽容、原子写无残留 tmp。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigSyncTracker } from './configSyncTracker'

function makeTmpTracker(): { tracker: ConfigSyncTracker; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-config-sync-tracker-'))
  const tracker = new ConfigSyncTracker(join(dir, 'config-sync.json'))
  return { tracker, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('缺失文件时返回空初始数据', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    const data = tracker.getData()
    assert.equal(data.schemaVersion, 1)
    assert.equal(data.selfManifestVersion, 0)
    assert.equal(data.syncedConfigHash, '')
    assert.equal(data.appliedRemoteHead, null)
    assert.equal(data.lastSyncAt, null)
  } finally {
    cleanup()
  }
})

test('损坏文件自愈为空初始', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-config-sync-tracker-'))
  const filePath = join(dir, 'config-sync.json')
  writeFileSync(filePath, '{invalid json', 'utf-8')
  const tracker = new ConfigSyncTracker(filePath)
  try {
    const data = tracker.getData()
    assert.equal(data.selfManifestVersion, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('save 后文件存在且内容正确（原子写）', () => {
  const { tracker, dir, cleanup } = makeTmpTracker()
  try {
    tracker.getData()
    tracker.setSelfManifest(5)
    tracker.setSyncedConfig('config-hash')
    tracker.setAppliedRemoteHead('device-x', 3)
    tracker.setLastSyncAt('2026-08-04T10:01:00.000Z')
    const ok = tracker.save()
    assert.equal(ok, true)
    const raw = readFileSync(join(dir, 'config-sync.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    assert.equal(parsed.selfManifestVersion, 5)
    assert.equal(parsed.syncedConfigHash, 'config-hash')
    assert.deepEqual(parsed.appliedRemoteHead, { deviceId: 'device-x', version: 3 })
    assert.equal(parsed.lastSyncAt, '2026-08-04T10:01:00.000Z')
  } finally {
    cleanup()
  }
})

test('save 不残留 tmp 文件', () => {
  const { tracker, dir, cleanup } = makeTmpTracker()
  try {
    tracker.getData()
    tracker.save()
    assert.equal(existsSync(join(dir, 'config-sync.json.tmp')), false)
  } finally {
    cleanup()
  }
})

test('setSelfManifest / setSyncedConfig / setAppliedRemoteHead 正确更新内存', () => {
  const { tracker, cleanup } = makeTmpTracker()
  try {
    tracker.setSelfManifest(3)
    tracker.setSyncedConfig('ch')
    tracker.setAppliedRemoteHead('device-y', 9)
    const data = tracker.getData()
    assert.equal(data.selfManifestVersion, 3)
    assert.equal(data.syncedConfigHash, 'ch')
    assert.deepEqual(data.appliedRemoteHead, { deviceId: 'device-y', version: 9 })
  } finally {
    cleanup()
  }
})

test('字段类型非法时自愈为空初始', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-config-sync-tracker-'))
  const filePath = join(dir, 'config-sync.json')
  writeFileSync(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      selfManifestVersion: 'bad',
      syncedConfigHash: '',
      appliedRemoteHead: null,
      lastSyncAt: null
    }),
    'utf-8'
  )
  const tracker = new ConfigSyncTracker(filePath)
  try {
    const data = tracker.getData()
    assert.equal(data.selfManifestVersion, 0) // 自愈
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('旧版文件含已删除的多余字段仍能加载（额外字段宽容）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-config-sync-tracker-'))
  const filePath = join(dir, 'config-sync.json')
  // selfManifestContentHash / syncedConfigMtime 为已删除的旧字段
  writeFileSync(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      selfManifestVersion: 7,
      selfManifestContentHash: 'legacy-hash',
      syncedConfigHash: 'config-hash',
      syncedConfigMtime: '2026-01-01T00:00:00.000Z',
      appliedRemoteHead: { deviceId: 'device-old', version: 4 },
      lastSyncAt: null
    }),
    'utf-8'
  )
  const tracker = new ConfigSyncTracker(filePath)
  try {
    const data = tracker.getData()
    assert.equal(data.selfManifestVersion, 7)
    assert.equal(data.syncedConfigHash, 'config-hash')
    assert.deepEqual(data.appliedRemoteHead, { deviceId: 'device-old', version: 4 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
