import test from 'node:test'
import assert from 'node:assert/strict'
import {
  serializeManifest,
  parseManifest,
  createConfigManifestEntry,
  type ConfigManifest
} from './configManifest'

test('manifest 序列化/反序列化往返一致', () => {
  const entry = createConfigManifestEntry('2026-08-04T10:00:00.000Z', 1024, 'abc123')
  const manifest: ConfigManifest = {
    schemaVersion: 1,
    version: 5,
    files: [entry]
  }
  const bytes = serializeManifest(manifest)
  const parsed = parseManifest(bytes)
  assert.deepEqual(parsed, manifest)
})

test('createConfigManifestEntry 固定 path 为 config.json', () => {
  const entry = createConfigManifestEntry('2026-08-04T10:00:00.000Z', 100, 'blockid')
  assert.equal(entry.path, 'config.json')
})

test('parseManifest 拒绝错误的 schemaVersion', () => {
  const bad = new TextEncoder().encode(JSON.stringify({ schemaVersion: 2, version: 1, files: [] }))
  assert.throws(() => parseManifest(bad))
})

test('parseManifest 拒绝 files 数组为空', () => {
  const bad = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, version: 1, files: [] }))
  assert.throws(() => parseManifest(bad))
})

test('parseManifest 拒绝 files 超过 1 项（本迭代约束）', () => {
  const entry = createConfigManifestEntry('2026-08-04T10:00:00.000Z', 100, 'blockid')
  const bad = new TextEncoder().encode(
    JSON.stringify({ schemaVersion: 1, version: 1, files: [entry, entry] })
  )
  assert.throws(() => parseManifest(bad))
})

test('parseManifest 拒绝 version 非整数', () => {
  const entry = createConfigManifestEntry('2026-08-04T10:00:00.000Z', 100, 'blockid')
  const bad = new TextEncoder().encode(
    JSON.stringify({ schemaVersion: 1, version: 1.5, files: [entry] })
  )
  assert.throws(() => parseManifest(bad))
})

test('parseManifest 拒绝 entry.path 非 config.json', () => {
  const badEntry = {
    path: 'other.json',
    mtime: '2026-08-04T10:00:00.000Z',
    size: 100,
    blockId: 'x'
  }
  const bad = new TextEncoder().encode(
    JSON.stringify({ schemaVersion: 1, version: 1, files: [badEntry] })
  )
  assert.throws(() => parseManifest(bad))
})
