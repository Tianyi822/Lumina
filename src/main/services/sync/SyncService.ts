/**
 * 同步服务顶层编排：服务发现、连接（注册/登录自动分流）、会话续期、
 * 同步组管理（六位码、设备、放弃其他组）、事件票据、断线对账。
 *
 * 所有密码学与密钥仅在本主进程完成，私钥/DEK 绝不出主进程。
 * 方法统一返回 SyncResult，不抛未捕获异常。
 */
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import { logger } from '@main/services/logger'
import type {
  Bootstrap,
  ConnectResult,
  DiscardResult,
  DiscoveryInfo,
  EventTicketResult,
  ManifestHead,
  ReconcileSummary,
  RelayDevice,
  RedeemResult,
  SessionFileMeta,
  SyncCodeResult,
  SyncResult,
  SyncStatus
} from '@shared/types/sync'
import { decodeBase64Url, encodeBase64Url } from './crypto/base64url'
import { sha256Bytes } from './crypto/hash'
import {
  deriveAccountAuthSeed,
  deriveEnvelopeKey,
  deriveLoginSeed,
  derivePasswordRoot
} from './crypto/kdf'
import { generateDek, openDek, sealDek } from './crypto/envelope'
import { generateSeed, getPublicKey, sign } from './crypto/keys'
import {
  buildAccountCreateTranscript,
  buildDekEnvelopeAad,
  buildDiscardGroupsTranscript,
  buildLoginTranscript,
  buildSessionTranscript
} from './crypto/transcript'
import { RelayClient } from './transport/RelayClient'
import { SyncStateStore, type SyncState } from './SyncStateStore'
import { SyncSecretStore } from './SyncSecretStore'

/** 用户名规范化：与服务端一致 —— toLower(trim) 且匹配 ^[a-z0-9._-]{3,64}$ */
const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SYNC_CODE_PATTERN = /^\d{6}$/

/** 可注入依赖（用于单测） */
export interface SyncServiceDeps {
  createClient?: (baseUrl: string) => RelayClient
  stateStore?: SyncStateStore
  secretStore?: SyncSecretStore
}

export class SyncService {
  private readonly createClient: (baseUrl: string) => RelayClient
  private readonly stateStore: SyncStateStore
  private readonly secretStore: SyncSecretStore

  private client: RelayClient | null = null
  private state: SyncState | null = null
  private deviceSeed: Uint8Array | null = null
  private dek: Uint8Array | null = null

  constructor(deps: SyncServiceDeps = {}) {
    this.createClient = deps.createClient ?? ((baseUrl) => new RelayClient(baseUrl))
    this.stateStore = deps.stateStore ?? new SyncStateStore()
    this.secretStore = deps.secretStore ?? new SyncSecretStore()
  }

  /** 从本地恢复身份（应用启动时调用）。不主动续期，由调用方决定 */
  restore(): void {
    const state = this.stateStore.load()
    const secrets = this.secretStore.load()
    if (!state || !secrets) return
    try {
      const deviceSeed = decodeBase64Url(secrets.deviceSeedB64, 32)
      const dek = decodeBase64Url(secrets.dekB64, 32)
      const client = this.createClient(state.relayUrl)
      client.setAuthContext({
        deviceSeed,
        sessionToken: secrets.sessionToken,
        serverTimeOffsetMs: state.serverTimeOffsetMs
      })
      this.state = state
      this.deviceSeed = deviceSeed
      this.dek = dek
      this.client = client
    } catch (error) {
      logger.warn('恢复同步身份失败，已忽略本地身份', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /** 当前同步状态 */
  getStatus(): SyncStatus {
    const s = this.state
    return {
      connected: s !== null && this.deviceSeed !== null,
      relayUrl: s?.relayUrl ?? null,
      instanceId: s?.instanceId ?? null,
      accountId: s?.accountId ?? null,
      deviceId: s?.deviceId ?? null,
      deviceName: s?.deviceName ?? null,
      username: s?.normalizedUsername ?? null,
      syncGroupId: s?.syncGroupId ?? null,
      groupRevision: s?.groupRevision ?? null,
      hasOtherSyncData: s?.hasOtherSyncData ?? false,
      sessionExpiresAt: s?.sessionExpiresAt ?? null,
      secureStorageAvailable: this.secretStore.isAvailable()
    }
  }

  /** 仅执行服务发现，用于设置页在提交密码前验证 Relay 地址。 */
  async discover(relayUrl: string): Promise<SyncResult<DiscoveryInfo>> {
    let client: RelayClient
    try {
      client = this.createClient(relayUrl)
    } catch (error) {
      return {
        success: false,
        code: 'invalid_input',
        error: error instanceof Error ? error.message : 'Relay 地址非法'
      }
    }
    const result = await client.discover()
    if (!result.success || !result.data) {
      return this.handleFailure(result, '服务发现失败')
    }
    if (!isValidDiscovery(result.data)) {
      return { success: false, code: 'invalid_response', error: 'Relay 服务发现响应非法' }
    }
    return result
  }

  /**
   * 连接同步服务：发现 → start → 按 accountExists 分流注册/登录 → complete → 持久化。
   * 页面无需选择注册/登录。
   */
  async connect(
    relayUrl: string,
    username: string,
    password: string,
    retried = false
  ): Promise<SyncResult<ConnectResult>> {
    const normalizedUsername = username.trim().toLowerCase()
    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      return {
        success: false,
        code: 'invalid_input',
        error: '用户名需为 3-64 位字母、数字、点、下划线或连字符'
      }
    }
    if (password.length === 0) {
      return { success: false, code: 'invalid_input', error: '密码不能为空' }
    }
    let client: RelayClient
    try {
      client = this.createClient(relayUrl)
    } catch (error) {
      return {
        success: false,
        code: 'invalid_input',
        error: error instanceof Error ? error.message : 'Relay 地址非法'
      }
    }

    // 1. 服务发现：pin instanceId + 校准时钟
    const discovery = await client.discover()
    if (!discovery.success || !discovery.data) {
      return {
        success: false,
        code: discovery.code ?? 'network_error',
        error: discovery.error ?? '服务发现失败'
      }
    }
    if (!isValidDiscovery(discovery.data)) {
      return { success: false, code: 'invalid_response', error: 'Relay 服务发现响应非法' }
    }
    const instanceId = discovery.data.instanceId
    const serverTimeOffsetMs = discovery.data.serverTimeMs - Date.now()
    client.setServerTimeOffset(serverTimeOffsetMs)

    // 2. 开启连接尝试
    const start = await client.connectionsStart(normalizedUsername)
    if (!start.success || !start.data) {
      return {
        success: false,
        code: start.code ?? 'network_error',
        error: start.error ?? '开启连接失败'
      }
    }
    if (!isSupportedKdf(start.data.kdf)) {
      return { success: false, code: 'invalid_response', error: 'Relay 返回了不支持的密码派生参数' }
    }
    let authSalt: Uint8Array
    let challenge: Uint8Array
    try {
      authSalt = decodeBase64Url(start.data.authSalt, 16)
      challenge = decodeBase64Url(start.data.challenge, 32)
    } catch {
      return { success: false, code: 'invalid_response', error: 'Relay 连接挑战格式非法' }
    }
    const attemptId = start.data.attemptId
    if (attemptId.length === 0) {
      return { success: false, code: 'invalid_response', error: 'Relay 连接尝试 ID 为空' }
    }

    // 3. 密码派生
    let passwordRoot: Uint8Array
    try {
      passwordRoot = await derivePasswordRoot(password, authSalt)
    } catch (error) {
      return {
        success: false,
        code: 'unknown_error',
        error: error instanceof Error ? error.message : '密码派生失败'
      }
    }
    const loginSeed = deriveLoginSeed(passwordRoot)
    const envelopeKey = deriveEnvelopeKey(passwordRoot)

    // 4. 生成设备身份
    const deviceId = randomUUID()
    const deviceSeed = generateSeed()
    const devicePublicKey = getPublicKey(deviceSeed)
    const deviceName = deriveDeviceName()

    let completeBody: Record<string, unknown>
    let dek: Uint8Array

    if (start.data.accountExists) {
      // 登录分支：仅提交共同字段，省略注册专用字段
      const transcript = buildLoginTranscript({
        instanceId,
        attemptId,
        normalizedUsername,
        challenge,
        deviceId,
        deviceName,
        devicePublicKey
      })
      completeBody = {
        attemptId,
        deviceId,
        deviceName,
        devicePublicKey: encodeBase64Url(devicePublicKey),
        loginProof: encodeBase64Url(sign(transcript, loginSeed)),
        deviceProof: encodeBase64Url(sign(transcript, deviceSeed))
      }
      // DEK 在 complete 成功后从 bootstrap.dekEnvelope 解出，此处占位
      dek = new Uint8Array(0)
    } else {
      // 注册分支：生成 accountId、DEK、封装信封、三方签名
      const accountId = randomUUID()
      dek = generateDek()
      const loginPublicKey = getPublicKey(loginSeed)
      const accountAuthSeed = deriveAccountAuthSeed(dek)
      const accountAuthPublicKey = getPublicKey(accountAuthSeed)
      const aad = buildDekEnvelopeAad({ instanceId, normalizedUsername, accountId, authSalt })
      const dekEnvelope = sealDek(envelopeKey, dek, aad)
      const transcript = buildAccountCreateTranscript({
        instanceId,
        attemptId,
        challenge,
        normalizedUsername,
        accountId,
        authSalt,
        loginPublicKey,
        accountAuthPublicKey,
        dekEnvelopeHash: sha256Bytes(dekEnvelope),
        deviceId,
        deviceName,
        devicePublicKey
      })
      completeBody = {
        attemptId,
        accountId,
        deviceId,
        deviceName,
        devicePublicKey: encodeBase64Url(devicePublicKey),
        loginPublicKey: encodeBase64Url(loginPublicKey),
        accountAuthPublicKey: encodeBase64Url(accountAuthPublicKey),
        dekEnvelope: encodeBase64Url(dekEnvelope),
        loginProof: encodeBase64Url(sign(transcript, loginSeed)),
        accountProof: encodeBase64Url(sign(transcript, accountAuthSeed)),
        deviceProof: encodeBase64Url(sign(transcript, deviceSeed))
      }
    }

    // 5. 完成连接
    const complete = await client.connectionsComplete(completeBody)
    if (!complete.success || !complete.data) {
      // 并发抢注：重新按登录分支走一次
      if (complete.code === 'account_became_existing' && !retried) {
        return this.connect(relayUrl, username, password, true)
      }
      return {
        success: false,
        code: complete.code ?? 'network_error',
        error: complete.error ?? '连接失败'
      }
    }

    const { session, bootstrap } = complete.data

    // 6. 登录分支解出 DEK
    if (start.data.accountExists) {
      const aad = buildDekEnvelopeAad({
        instanceId,
        normalizedUsername,
        accountId: bootstrap.accountId,
        authSalt
      })
      try {
        dek = openDek(envelopeKey, decodeBase64Url(bootstrap.dekEnvelope), aad)
      } catch {
        return { success: false, code: 'password_incorrect', error: '密码错误，无法解开数据密钥' }
      }
    }

    // 7. 持久化状态与机密
    const state: SyncState = {
      relayUrl: client.getBaseUrl(),
      instanceId,
      accountId: bootstrap.accountId,
      deviceId: bootstrap.deviceId,
      normalizedUsername,
      deviceName,
      syncGroupId: bootstrap.syncGroupId,
      groupRevision: bootstrap.groupRevision,
      cryptoStateRevision: bootstrap.cryptoStateRevision,
      dekEpoch: bootstrap.dekEpoch,
      hasOtherSyncData: bootstrap.hasOtherSyncData,
      sessionExpiresAt: session.expiresAt,
      serverTimeOffsetMs
    }
    if (!this.persist(client, state, deviceSeed, dek, session.token)) {
      return { success: false, code: 'storage_error', error: '同步身份写入安全存储失败' }
    }

    logger.info('同步连接成功', 'main', {
      accountExists: complete.data.accountExists,
      hasOtherSyncData: bootstrap.hasOtherSyncData
    })
    return {
      success: true,
      data: { accountExists: complete.data.accountExists, status: this.getStatus() }
    }
  }

  /** 会话续期（无需密码，用设备私钥续签） */
  async renewSession(): Promise<SyncResult<SyncStatus>> {
    if (!this.client || !this.state || !this.deviceSeed) {
      return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    }
    const challengeResult = await this.client.sessionChallenge(this.state.deviceId)
    if (!challengeResult.success || !challengeResult.data) {
      return this.handleFailure(challengeResult, '会话挑战失败')
    }
    let challenge: Uint8Array
    try {
      challenge = decodeBase64Url(challengeResult.data.challenge, 32)
    } catch {
      return { success: false, code: 'invalid_response', error: 'Relay 会话挑战格式非法' }
    }
    const transcript = buildSessionTranscript({
      instanceId: this.state.instanceId,
      attemptId: challengeResult.data.attemptId,
      challenge,
      deviceId: this.state.deviceId
    })
    const signature = encodeBase64Url(sign(transcript, this.deviceSeed))
    const result = await this.client.sessions(challengeResult.data.attemptId, signature)
    if (!result.success || !result.data) {
      return this.handleFailure(result, '会话续期失败')
    }
    const secretsSaved = this.saveSecrets(result.data.session.token)
    if (!secretsSaved && this.secretStore.isAvailable()) {
      return { success: false, code: 'storage_error', error: '新会话写入安全存储失败' }
    }
    this.client.setAuthContext({ sessionToken: result.data.session.token })
    this.state.sessionExpiresAt = result.data.session.expiresAt
    if (!this.applyBootstrap(result.data.bootstrap)) {
      return { success: false, code: 'storage_error', error: '同步状态持久化失败' }
    }
    return { success: true, data: this.getStatus() }
  }

  /** 刷新 bootstrap 根状态 */
  async refreshBootstrap(): Promise<SyncResult<SyncStatus>> {
    if (!this.client || !this.state) {
      return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    }
    const result = await this.client.getBootstrap()
    if (!result.success || !result.data) {
      return this.handleFailure(result, '刷新失败')
    }
    if (!this.applyBootstrap(result.data)) {
      return { success: false, code: 'storage_error', error: '同步状态持久化失败' }
    }
    return { success: true, data: this.getStatus() }
  }

  /** 生成六位同步码 */
  async generateSyncCode(): Promise<SyncResult<SyncCodeResult>> {
    if (!this.client) return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    return this.client.generateSyncCode()
  }

  /** 兑换六位同步码（成功或已在同组时刷新 bootstrap） */
  async redeemSyncCode(code: string): Promise<SyncResult<RedeemResult>> {
    if (!this.client) return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    if (!SYNC_CODE_PATTERN.test(code)) {
      return { success: false, code: 'invalid_input', error: '同步码必须为 6 位数字' }
    }
    const result = await this.client.redeemSyncCode(code)
    if (!result.success && result.code !== 'already_joined') {
      return this.handleFailure(result, '兑换同步码失败')
    }
    const refreshed = await this.refreshBootstrap()
    if (!refreshed.success) {
      return {
        success: false,
        code: refreshed.code,
        error: refreshed.error,
        extra: refreshed.extra
      }
    }
    if (!result.success && this.state) {
      return {
        success: true,
        data: {
          joined: false,
          syncGroupId: this.state.syncGroupId,
          groupRevision: this.state.groupRevision
        }
      }
    }
    return result
  }

  /** 列出同步组内设备 */
  async listDevices(): Promise<SyncResult<RelayDevice[]>> {
    if (!this.client) return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    const result = await this.client.listDevices()
    if (!result.success || !result.data) {
      return this.handleFailure(result, '获取设备失败')
    }
    return { success: true, data: result.data.devices }
  }

  /** 吊销组内设备 */
  async revokeDevice(deviceId: string): Promise<SyncResult<{ revoked: boolean }>> {
    if (!this.client) return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    if (!UUID_PATTERN.test(deviceId)) {
      return { success: false, code: 'invalid_input', error: '设备 ID 格式非法' }
    }
    const result = await this.client.revokeDevice(deviceId)
    if (!result.success) return this.handleFailure(result, '吊销设备失败')
    return result
  }

  /** 放弃当前组以外的其他同步组（account-auth key 签名） */
  async discardOtherGroups(): Promise<SyncResult<DiscardResult>> {
    if (!this.client || !this.state || !this.dek) {
      return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    }
    // 先刷新 bootstrap 取最新 groupRevision / syncGroupId
    const refreshed = await this.refreshBootstrap()
    if (!refreshed.success || !this.state) {
      return {
        success: false,
        code: refreshed.code ?? 'network_error',
        error: refreshed.error ?? '刷新失败'
      }
    }
    const accountAuthSeed = deriveAccountAuthSeed(this.dek)
    const transcript = buildDiscardGroupsTranscript({
      instanceId: this.state.instanceId,
      accountId: this.state.accountId,
      deviceId: this.state.deviceId,
      groupId: this.state.syncGroupId,
      groupRevision: this.state.groupRevision
    })
    const accountProof = encodeBase64Url(sign(transcript, accountAuthSeed))
    const result = await this.client.discardOtherGroups(this.state.groupRevision, accountProof)
    if (result.success) {
      const refreshedAfterDiscard = await this.refreshBootstrap()
      if (!refreshedAfterDiscard.success) {
        return {
          success: false,
          code: refreshedAfterDiscard.code,
          error: refreshedAfterDiscard.error,
          extra: refreshedAfterDiscard.extra
        }
      }
    } else {
      return this.handleFailure(result, '放弃其他同步组失败')
    }
    return result
  }

  /** 创建 WebSocket 事件票据（渲染进程用它打开 WebSocket） */
  async createEventTicket(): Promise<SyncResult<EventTicketResult>> {
    if (!this.client) return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    const result = await this.client.createEventTicket()
    if (!result.success || !result.data) {
      return this.handleFailure(result, '创建事件票据失败')
    }
    return {
      success: true,
      data: {
        wsUrl: this.client.getWebSocketUrl(),
        ticket: result.data.ticket,
        subprotocol: result.data.subprotocol,
        expiresAtMs: result.data.expiresAtMs
      }
    }
  }

  /** 断线重连后的全量对账（§9.4，不落地真实数据） */
  async reconcile(): Promise<SyncResult<ReconcileSummary>> {
    if (!this.client) return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    const [manifests, sessionFiles, bootstrap] = await Promise.all([
      this.client.listManifests(),
      this.client.listSessionFiles(),
      this.client.getBootstrap()
    ])
    if (!manifests.success || !manifests.data) {
      return this.handleFailure(manifests, '对账失败')
    }
    if (!sessionFiles.success || !sessionFiles.data) {
      return this.handleFailure(sessionFiles, '对账失败')
    }
    if (!bootstrap.success || !bootstrap.data) {
      return this.handleFailure(bootstrap, '刷新根状态失败')
    }
    if (!this.applyBootstrap(bootstrap.data)) {
      return { success: false, code: 'storage_error', error: '同步状态持久化失败' }
    }
    const heads: ManifestHead[] = manifests.data.heads
    const sessions: SessionFileMeta[] = sessionFiles.data.sessions
    return {
      success: true,
      data: {
        groupRevision: manifests.data.groupRevision,
        manifestHeads: heads,
        sessionFiles: sessions
      }
    }
  }

  /** 断开连接并清除本地身份 */
  disconnect(): SyncResult {
    this.stateStore.clear()
    this.secretStore.clear()
    this.state = null
    this.deviceSeed?.fill(0)
    this.dek?.fill(0)
    this.deviceSeed = null
    this.dek = null
    this.client = null
    logger.info('已断开同步连接并清除本地身份', 'main')
    return { success: true }
  }

  /** 持久化连接结果到内存与磁盘 */
  private persist(
    client: RelayClient,
    state: SyncState,
    deviceSeed: Uint8Array,
    dek: Uint8Array,
    sessionToken: string
  ): boolean {
    client.setAuthContext({
      deviceSeed,
      sessionToken,
      serverTimeOffsetMs: state.serverTimeOffsetMs
    })
    const secureStorageAvailable = this.secretStore.isAvailable()
    const secretsSaved = this.secretStore.save({
      deviceSeedB64: encodeBase64Url(deviceSeed),
      dekB64: encodeBase64Url(dek),
      sessionToken
    })
    if (secureStorageAvailable && !secretsSaved) return false
    if (secureStorageAvailable && !this.stateStore.save(state)) {
      this.secretStore.clear()
      return false
    }
    this.client = client
    this.state = state
    this.deviceSeed = deviceSeed
    this.dek = dek
    return true
  }

  /** 用 bootstrap 更新本地状态并落盘 */
  private applyBootstrap(bootstrap: Bootstrap): boolean {
    if (!this.state) return false
    this.state = {
      ...this.state,
      accountId: bootstrap.accountId,
      deviceId: bootstrap.deviceId,
      normalizedUsername: bootstrap.username,
      syncGroupId: bootstrap.syncGroupId,
      groupRevision: bootstrap.groupRevision,
      cryptoStateRevision: bootstrap.cryptoStateRevision,
      dekEpoch: bootstrap.dekEpoch,
      hasOtherSyncData: bootstrap.hasOtherSyncData
    }
    return this.saveState(this.state)
  }

  /** 统一透传失败，并在服务端确认设备已吊销时清理本地身份。 */
  private handleFailure<T>(result: SyncResult<unknown>, fallback: string): SyncResult<T> {
    const failure: SyncResult<T> = {
      success: false,
      code: result.code ?? 'network_error',
      error: result.error ?? fallback,
      extra: result.extra
    }
    if (result.code === 'device_revoked') {
      this.disconnect()
    }
    return failure
  }

  /** safeStorage 不可用时只保留内存身份；可用但写入失败才视为存储错误。 */
  private saveSecrets(sessionToken: string): boolean {
    if (!this.deviceSeed || !this.dek) return false
    if (!this.secretStore.isAvailable()) return false
    return this.secretStore.save({
      deviceSeedB64: encodeBase64Url(this.deviceSeed),
      dekB64: encodeBase64Url(this.dek),
      sessionToken
    })
  }

  /** 没有可恢复的安全机密时不写孤立 state.json。 */
  private saveState(state: SyncState): boolean {
    return !this.secretStore.isAvailable() || this.stateStore.save(state)
  }
}

/** 自动派生设备名（主机名 + 平台），限制 ≤ 128 字节 */
function deriveDeviceName(): string {
  const platformLabel =
    process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux'
  let name = `${hostname()} · ${platformLabel}`.trim() || 'Lumina Device'
  while (Buffer.byteLength(name, 'utf-8') > 128) {
    name = Array.from(name).slice(0, -1).join('')
  }
  return name
}

function isSupportedKdf(kdf: {
  name: string
  memoryKiB: number
  iterations: number
  parallelism: number
  outputBytes: number
}): boolean {
  return (
    kdf.name === 'argon2id' &&
    kdf.memoryKiB === 65536 &&
    kdf.iterations === 3 &&
    kdf.parallelism === 1 &&
    kdf.outputBytes === 32
  )
}

function isValidDiscovery(discovery: DiscoveryInfo): boolean {
  return (
    discovery.protocol === 'lumina-relay' &&
    discovery.instanceId.length > 0 &&
    Number.isSafeInteger(discovery.serverTimeMs)
  )
}
