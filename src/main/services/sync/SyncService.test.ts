import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  Bootstrap,
  ConnectStartResponse,
  ConnectionResult,
  DiscoveryInfo,
  RedeemResult,
  SyncResult
} from '@shared/types/sync'
import { SyncService } from './SyncService'
import { SyncSecretStore, type SyncSecrets } from './SyncSecretStore'
import { SyncStateStore, type SyncState } from './SyncStateStore'
import { decodeBase64Url, encodeBase64Url } from './crypto/base64url'
import { sealDek } from './crypto/envelope'
import { deriveAccountAuthSeed, deriveEnvelopeKey } from './crypto/kdf'
import { getPublicKey, verify } from './crypto/keys'
import { buildDekEnvelopeAad, buildDiscardGroupsTranscript } from './crypto/transcript'
import { RelayClient } from './transport/RelayClient'

const AUTH_SALT = Uint8Array.from({ length: 16 }, (_, index) => index)
const CHALLENGE = new Uint8Array(32).fill(3)
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'
const DEVICE_ID = '22222222-2222-4222-8222-222222222222'
const GROUP_ID = '33333333-3333-4333-8333-333333333333'
const PASSWORD = 'correct horse battery staple'
const PASSWORD_ROOT = Uint8Array.from(
  Buffer.from('0d1a3c6523c8f06e4e0af9c515aa5b5448cfebd6838f2d52c3d8b6ef8ddc3c2e', 'hex')
)

const discovery: DiscoveryInfo = {
  protocol: 'lumina-relay',
  instanceId: 'instance-1',
  serverTimeMs: Date.now(),
  capabilities: ['password-proof', 'device-proof'],
  limits: {
    maxJsonBytes: 65536,
    maxManifestBytes: 4194304,
    maxSessionFileBytes: 4194304,
    maxBlockBytes: 1048576,
    maxMissingIds: 1000,
    maxDeviceNameBytes: 128,
    blockGcGraceSeconds: 86400
  }
}

function createBootstrap(overrides: Partial<Bootstrap> = {}): Bootstrap {
  return {
    accountId: ACCOUNT_ID,
    username: 'alice',
    deviceId: DEVICE_ID,
    dekEnvelope: encodeBase64Url(new Uint8Array(72).fill(4)),
    accountAuthPublicKey: encodeBase64Url(new Uint8Array(32).fill(5)),
    cryptoStateRevision: 1,
    dekEpoch: 1,
    syncGroupId: GROUP_ID,
    groupRevision: 1,
    hasOtherSyncData: false,
    serverTimeMs: Date.now(),
    ...overrides
  }
}

class MemoryStateStore extends SyncStateStore {
  value: SyncState | null
  saves = 0

  constructor(value: SyncState | null = null) {
    super()
    this.value = value
  }

  override load(): SyncState | null {
    return this.value ? { ...this.value } : null
  }

  override save(state: SyncState): boolean {
    this.saves += 1
    this.value = { ...state }
    return true
  }

  override clear(): void {
    this.value = null
  }
}

class MemorySecretStore extends SyncSecretStore {
  value: SyncSecrets | null
  saves = 0
  private readonly available: boolean

  constructor(value: SyncSecrets | null = null, available = true) {
    super()
    this.value = value
    this.available = available
  }

  override isAvailable(): boolean {
    return this.available
  }

  override load(): SyncSecrets | null {
    return this.value ? { ...this.value } : null
  }

  override save(secrets: SyncSecrets): boolean {
    this.saves += 1
    if (!this.available) return false
    this.value = { ...secrets }
    return true
  }

  override clear(): void {
    this.value = null
  }
}

class FakeRelayClient extends RelayClient {
  accountExists = false
  completeBodies: Record<string, unknown>[] = []
  bootstrap = createBootstrap()
  sessionToken = 'session-token'
  redeemResult: SyncResult<RedeemResult> = {
    success: true,
    data: { joined: true, syncGroupId: GROUP_ID, groupRevision: 1 }
  }
  discardCall: { groupRevision: number; accountProof: string } | null = null
  bootstrapCalls = 0

  constructor() {
    super('https://relay.example', async () => {
      throw new Error('测试不应调用底层 fetch')
    })
  }

  override async discover(): Promise<SyncResult<DiscoveryInfo>> {
    return { success: true, data: discovery }
  }

  override async connectionsStart() {
    return {
      success: true,
      data: {
        accountExists: this.accountExists,
        attemptId: 'attempt-1',
        challenge: encodeBase64Url(CHALLENGE),
        authSalt: encodeBase64Url(AUTH_SALT),
        expiresAt: 1_800_000_000,
        kdf: {
          name: 'argon2id',
          memoryKiB: 65536,
          iterations: 3,
          parallelism: 1,
          outputBytes: 32
        }
      }
    }
  }

  override async connectionsComplete(
    body: Record<string, unknown>
  ): Promise<SyncResult<ConnectionResult>> {
    this.completeBodies.push(body)
    const bootstrap = {
      ...this.bootstrap,
      accountId: typeof body.accountId === 'string' ? body.accountId : this.bootstrap.accountId,
      deviceId: String(body.deviceId)
    }
    return {
      success: true,
      data: {
        accountExists: this.accountExists,
        session: { token: this.sessionToken, expiresAt: 1_800_000_000, proofBinding: 'binding' },
        bootstrap
      }
    }
  }

  override async sessionChallenge() {
    return {
      success: true,
      data: {
        attemptId: 'session-attempt',
        challenge: encodeBase64Url(CHALLENGE),
        expiresAt: 1_800_000_000
      }
    }
  }

  override async sessions(): Promise<SyncResult<ConnectionResult>> {
    return {
      success: true,
      data: {
        accountExists: true,
        session: { token: 'renewed-token', expiresAt: 1_900_000_000, proofBinding: 'new-binding' },
        bootstrap: this.bootstrap
      }
    }
  }

  override async getBootstrap(): Promise<SyncResult<Bootstrap>> {
    this.bootstrapCalls += 1
    return { success: true, data: this.bootstrap }
  }

  override async redeemSyncCode(): Promise<SyncResult<RedeemResult>> {
    return this.redeemResult
  }

  override async discardOtherGroups(groupRevision: number, accountProof: string) {
    this.discardCall = { groupRevision, accountProof }
    return { success: true, data: { discardedDevices: 1, reclaimedBytes: 64 } }
  }
}

function createStoredIdentity(dek = new Uint8Array(32).fill(8)): {
  state: SyncState
  secrets: SyncSecrets
} {
  return {
    state: {
      relayUrl: 'https://relay.example',
      instanceId: discovery.instanceId,
      accountId: ACCOUNT_ID,
      deviceId: DEVICE_ID,
      normalizedUsername: 'alice',
      deviceName: 'Laptop',
      syncGroupId: GROUP_ID,
      groupRevision: 1,
      cryptoStateRevision: 1,
      dekEpoch: 1,
      hasOtherSyncData: false,
      sessionExpiresAt: 1_800_000_000,
      serverTimeOffsetMs: 0
    },
    secrets: {
      deviceSeedB64: encodeBase64Url(new Uint8Array(32).fill(7)),
      dekB64: encodeBase64Url(dek),
      sessionToken: 'stored-token'
    }
  }
}

test('connect 新账号走注册分支并只把机密写入安全存储', async () => {
  const client = new FakeRelayClient()
  const stateStore = new MemoryStateStore()
  const secretStore = new MemorySecretStore()
  const service = new SyncService({ createClient: () => client, stateStore, secretStore })

  const result = await service.connect('https://relay.example', ' Alice ', PASSWORD)

  assert.equal(result.success, true)
  assert.equal(result.data?.accountExists, false)
  assert.equal(client.completeBodies.length, 1)
  const body = client.completeBodies[0]
  assert.equal(typeof body.accountId, 'string')
  assert.equal(decodeBase64Url(String(body.loginPublicKey), 32).length, 32)
  assert.equal(decodeBase64Url(String(body.accountAuthPublicKey), 32).length, 32)
  assert.equal(decodeBase64Url(String(body.dekEnvelope), 72).length, 72)
  assert.equal(decodeBase64Url(String(body.accountProof), 64).length, 64)
  assert.equal(secretStore.value?.sessionToken, 'session-token')
  assert.equal(decodeBase64Url(secretStore.value?.deviceSeedB64 ?? '', 32).length, 32)
  assert.equal(stateStore.value?.normalizedUsername, 'alice')
})

test('connect 已有账号走登录分支并省略全部注册专用字段', async () => {
  const client = new FakeRelayClient()
  client.accountExists = true
  const dek = new Uint8Array(32).fill(6)
  const envelopeKey = deriveEnvelopeKey(PASSWORD_ROOT)
  const aad = buildDekEnvelopeAad({
    instanceId: discovery.instanceId,
    normalizedUsername: 'alice',
    accountId: ACCOUNT_ID,
    authSalt: AUTH_SALT
  })
  client.bootstrap = createBootstrap({
    dekEnvelope: encodeBase64Url(sealDek(envelopeKey, dek, aad))
  })
  const secretStore = new MemorySecretStore()
  const service = new SyncService({
    createClient: () => client,
    stateStore: new MemoryStateStore(),
    secretStore
  })

  const result = await service.connect('https://relay.example', 'alice', PASSWORD)

  assert.equal(result.success, true)
  assert.equal(result.data?.accountExists, true)
  const body = client.completeBodies[0]
  for (const field of [
    'accountId',
    'loginPublicKey',
    'accountAuthPublicKey',
    'dekEnvelope',
    'accountProof'
  ]) {
    assert.equal(Object.hasOwn(body, field), false, `${field} 必须省略`)
  }
  assert.deepEqual(decodeBase64Url(secretStore.value?.dekB64 ?? '', 32), dek)
})

test('safeStorage 不可用时连接仍可在本次会话使用且不写孤立状态', async () => {
  const client = new FakeRelayClient()
  const stateStore = new MemoryStateStore()
  const secretStore = new MemorySecretStore(null, false)
  const service = new SyncService({ createClient: () => client, stateStore, secretStore })

  const result = await service.connect('https://relay.example', 'alice', PASSWORD)

  assert.equal(result.success, true)
  assert.equal(result.data?.status.connected, true)
  assert.equal(result.data?.status.secureStorageAvailable, false)
  assert.equal(stateStore.saves, 0)
  assert.equal(secretStore.value, null)
})

test('restore 后可无密码续期会话并更新安全 Token', async () => {
  const client = new FakeRelayClient()
  const identity = createStoredIdentity()
  client.bootstrap = createBootstrap({ deviceId: DEVICE_ID })
  const secretStore = new MemorySecretStore(identity.secrets)
  const service = new SyncService({
    createClient: () => client,
    stateStore: new MemoryStateStore(identity.state),
    secretStore
  })
  service.restore()

  const result = await service.renewSession()

  assert.equal(result.success, true)
  assert.equal(result.data?.sessionExpiresAt, 1_900_000_000)
  assert.equal(secretStore.value?.sessionToken, 'renewed-token')
})

test('already_joined 视为成功并刷新 bootstrap', async () => {
  const client = new FakeRelayClient()
  const identity = createStoredIdentity()
  client.redeemResult = {
    success: false,
    code: 'already_joined',
    error: 'already joined',
    extra: { groupRevision: 2 }
  }
  client.bootstrap = createBootstrap({ groupRevision: 2 })
  const service = new SyncService({
    createClient: () => client,
    stateStore: new MemoryStateStore(identity.state),
    secretStore: new MemorySecretStore(identity.secrets)
  })
  service.restore()

  const result = await service.redeemSyncCode('123456')

  assert.equal(result.success, true)
  assert.deepEqual(result.data, { joined: false, syncGroupId: GROUP_ID, groupRevision: 2 })
  assert.equal(client.bootstrapCalls, 1)
})

test('discardOtherGroups 使用由 DEK 派生的 account-auth key 签名', async () => {
  const dek = new Uint8Array(32).fill(8)
  const client = new FakeRelayClient()
  const identity = createStoredIdentity(dek)
  client.bootstrap = createBootstrap({ deviceId: DEVICE_ID, groupRevision: 4 })
  const service = new SyncService({
    createClient: () => client,
    stateStore: new MemoryStateStore(identity.state),
    secretStore: new MemorySecretStore(identity.secrets)
  })
  service.restore()

  const result = await service.discardOtherGroups()

  assert.equal(result.success, true)
  assert.ok(client.discardCall)
  const transcript = buildDiscardGroupsTranscript({
    instanceId: discovery.instanceId,
    accountId: ACCOUNT_ID,
    deviceId: DEVICE_ID,
    groupId: GROUP_ID,
    groupRevision: 4
  })
  const accountAuthSeed = deriveAccountAuthSeed(dek)
  assert.equal(
    verify(
      decodeBase64Url(client.discardCall.accountProof, 64),
      transcript,
      getPublicKey(accountAuthSeed)
    ),
    true
  )
  assert.equal(client.bootstrapCalls, 2)
})

test('畸形 Relay 响应返回 invalid_response 而非抛出异常', async () => {
  const connect = async (mutate: (client: FakeRelayClient) => void) => {
    const client = new FakeRelayClient()
    mutate(client)
    const service = new SyncService({
      createClient: () => client,
      stateStore: new MemoryStateStore(),
      secretStore: new MemorySecretStore()
    })
    // 若服务层抛出 TypeError，node:test 会直接判失败
    return service.connect('https://relay.example', 'alice', PASSWORD)
  }

  // discovery 缺 instanceId
  let result = await connect((client) => {
    client.discover = async () => ({
      success: true,
      data: { protocol: 'lumina-relay' } as unknown as DiscoveryInfo
    })
  })
  assert.equal(result.success, false)
  assert.equal(result.code, 'invalid_response')

  // start 缺 kdf
  result = await connect((client) => {
    client.connectionsStart = async () => ({
      success: true,
      data: {
        accountExists: false,
        attemptId: 'attempt-1',
        challenge: encodeBase64Url(CHALLENGE),
        authSalt: encodeBase64Url(AUTH_SALT),
        expiresAt: 1_800_000_000
      } as unknown as ConnectStartResponse
    })
  })
  assert.equal(result.success, false)
  assert.equal(result.code, 'invalid_response')

  // start 缺 attemptId（kdf 合法）
  result = await connect((client) => {
    client.connectionsStart = async () => ({
      success: true,
      data: {
        accountExists: false,
        challenge: encodeBase64Url(CHALLENGE),
        authSalt: encodeBase64Url(AUTH_SALT),
        expiresAt: 1_800_000_000,
        kdf: { name: 'argon2id', memoryKiB: 65536, iterations: 3, parallelism: 1, outputBytes: 32 }
      } as unknown as ConnectStartResponse
    })
  })
  assert.equal(result.success, false)
  assert.equal(result.code, 'invalid_response')

  // complete 缺 bootstrap
  result = await connect((client) => {
    client.connectionsComplete = async () => ({
      success: true,
      data: {
        accountExists: false,
        session: { token: 't', expiresAt: 1_800_000_000, proofBinding: 'b' }
      } as unknown as ConnectionResult
    })
  })
  assert.equal(result.success, false)
  assert.equal(result.code, 'invalid_response')
})

test('device_revoked 失败自动断开并清理本地身份', async () => {
  const client = new FakeRelayClient()
  const identity = createStoredIdentity()
  const stateStore = new MemoryStateStore(identity.state)
  const secretStore = new MemorySecretStore(identity.secrets)
  const service = new SyncService({ createClient: () => client, stateStore, secretStore })
  service.restore()
  assert.equal(service.getStatus().connected, true)

  client.getBootstrap = async () => ({
    success: false,
    code: 'device_revoked',
    error: '设备已被吊销'
  })
  const result = await service.refreshBootstrap()

  assert.equal(result.success, false)
  assert.equal(result.code, 'device_revoked')
  assert.equal(service.getStatus().connected, false)
  assert.equal(stateStore.value, null)
  assert.equal(secretStore.value, null)
})

test('account_became_existing 抢注后自动按登录分支重试一次', async () => {
  const client = new FakeRelayClient()
  let startCalls = 0
  const originalStart = client.connectionsStart.bind(client)
  client.connectionsStart = async () => {
    startCalls += 1
    client.accountExists = startCalls > 1
    return originalStart()
  }
  let completeCalls = 0
  const originalComplete = client.connectionsComplete.bind(client)
  client.connectionsComplete = async (body) => {
    completeCalls += 1
    if (completeCalls === 1) {
      return { success: false, code: 'account_became_existing', error: '并发抢注' }
    }
    return originalComplete(body)
  }
  // 重试进入登录分支，需要可用密码解开的 DEK 信封
  const dek = new Uint8Array(32).fill(6)
  const envelopeKey = deriveEnvelopeKey(PASSWORD_ROOT)
  const aad = buildDekEnvelopeAad({
    instanceId: discovery.instanceId,
    normalizedUsername: 'alice',
    accountId: ACCOUNT_ID,
    authSalt: AUTH_SALT
  })
  client.bootstrap = createBootstrap({
    dekEnvelope: encodeBase64Url(sealDek(envelopeKey, dek, aad))
  })
  const secretStore = new MemorySecretStore()
  const service = new SyncService({
    createClient: () => client,
    stateStore: new MemoryStateStore(),
    secretStore
  })

  const result = await service.connect('https://relay.example', 'alice', PASSWORD)

  assert.equal(result.success, true)
  assert.equal(result.data?.accountExists, true)
  assert.equal(startCalls, 2)
  assert.equal(completeCalls, 2)
  assert.deepEqual(decodeBase64Url(secretStore.value?.dekB64 ?? '', 32), dek)
})
