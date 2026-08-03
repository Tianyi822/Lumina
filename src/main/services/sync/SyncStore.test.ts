import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import test from 'node:test'

import { encodeBase64Url } from './crypto/base64url'
import { getSyncDirPath, getSyncSecretsFilePath, getSyncStateFilePath } from './syncPaths'
import { SyncSecretStore, type SyncSecrets } from './SyncSecretStore'
import { SyncStateStore, type SyncState } from './SyncStateStore'

const state: SyncState = {
  relayUrl: 'https://relay.example',
  instanceId: 'instance-1',
  accountId: '11111111-1111-4111-8111-111111111111',
  deviceId: '22222222-2222-4222-8222-222222222222',
  normalizedUsername: 'alice',
  deviceName: 'Laptop',
  syncGroupId: '33333333-3333-4333-8333-333333333333',
  groupRevision: 1,
  cryptoStateRevision: 1,
  dekEpoch: 1,
  hasOtherSyncData: false,
  sessionExpiresAt: 1_800_000_000,
  serverTimeOffsetMs: 12
}

const secrets: SyncSecrets = {
  deviceSeedB64: encodeBase64Url(new Uint8Array(32).fill(1)),
  dekB64: encodeBase64Url(new Uint8Array(32).fill(2)),
  sessionToken: 'opaque-token'
}

test.beforeEach(() => {
  rmSync(getSyncDirPath(), { recursive: true, force: true })
})

test.after(() => {
  rmSync(getSyncDirPath(), { recursive: true, force: true })
})

test('SyncStateStore 原子保存、读取和清理合法状态', () => {
  const store = new SyncStateStore()

  assert.equal(store.save(state), true)
  assert.deepEqual(store.load(), state)
  assert.match(readFileSync(getSyncStateFilePath(), 'utf-8'), /"instanceId": "instance-1"/)

  store.clear()
  assert.equal(store.load(), null)
})

test('SyncStateStore 忽略损坏或字段不完整的状态', () => {
  mkdirSync(getSyncDirPath(), { recursive: true })
  writeFileSync(getSyncStateFilePath(), '{broken', 'utf-8')
  assert.equal(new SyncStateStore().load(), null)

  writeFileSync(
    getSyncStateFilePath(),
    JSON.stringify({ relayUrl: 'https://relay.example' }),
    'utf-8'
  )
  assert.equal(new SyncStateStore().load(), null)
})

test('SyncSecretStore 通过 safeStorage 往返并校验密钥长度', () => {
  const store = new SyncSecretStore()

  assert.equal(store.isAvailable(), true)
  assert.equal(store.save(secrets), true)
  assert.deepEqual(store.load(), secrets)

  writeFileSync(
    getSyncSecretsFilePath(),
    JSON.stringify({ ...secrets, deviceSeedB64: encodeBase64Url(Uint8Array.of(1)) }),
    'utf-8'
  )
  assert.equal(store.load(), null)
})

test('SyncSecretStore 清理已保存机密', () => {
  const store = new SyncSecretStore()
  assert.equal(store.save(secrets), true)
  store.clear()
  assert.equal(store.load(), null)
})
