/**
 * Lumina Relay 同步协议类型定义
 *
 * 字段名严格匹配服务端 JSON 契约（见 lumina-relay 的 FRONTEND_INTEGRATION.md）。
 * 所有二进制字段在网络层用无 padding 的 base64url 传输，本类型层统一为字符串。
 * 时间字段：createdAt/lastSeenAt/updatedAt/expiresAt 为 Unix 秒；
 * serverTimeMs/expiresAtMs 为 Unix 毫秒。
 */

/** 服务发现返回的大小与能力限制 */
interface DiscoveryLimits {
  maxJsonBytes: number
  maxManifestBytes: number
  maxSessionFileBytes: number
  maxBlockBytes: number
  maxMissingIds: number
  maxDeviceNameBytes: number
  blockGcGraceSeconds: number
}

/** `GET /.well-known/lumina-relay` 响应 */
export interface DiscoveryInfo {
  protocol: string
  instanceId: string
  serverTimeMs: number
  capabilities: string[]
  limits: DiscoveryLimits
}

/** 密码派生 KDF 参数（与 `/connections/start` 返回一致） */
interface KdfParams {
  name: string
  memoryKiB: number
  iterations: number
  parallelism: number
  outputBytes: number
}

/** `POST /connections/start` 响应 */
export interface ConnectStartResponse {
  accountExists: boolean
  attemptId: string
  /** base64url 编码的 32 字节 challenge */
  challenge: string
  /** base64url 编码的 16 字节 authSalt */
  authSalt: string
  expiresAt: number
  kdf: KdfParams
}

/** 会话 Token（JWT），客户端视为不透明字符串 */
interface SessionInfo {
  token: string
  expiresAt: number
  proofBinding: string
}

/** bootstrap 根状态（`/connections/complete`、`/sessions`、`GET /bootstrap`） */
export interface Bootstrap {
  accountId: string
  username: string
  deviceId: string
  /** base64url 编码的 72 字节 DEK 信封 */
  dekEnvelope: string
  /** base64url 编码的 32 字节 account-auth 公钥 */
  accountAuthPublicKey: string
  cryptoStateRevision: number
  dekEpoch: number
  syncGroupId: string
  groupRevision: number
  hasOtherSyncData: boolean
  serverTimeMs: number
}

/** 连接完成/会话完成响应 */
export interface ConnectionResult {
  accountExists: boolean
  session: SessionInfo
  bootstrap: Bootstrap
}

/** 客户端对外暴露的同步状态（渲染进程使用） */
export interface SyncStatus {
  /** 是否已完成连接（本地存在有效身份） */
  connected: boolean
  relayUrl: string | null
  instanceId: string | null
  accountId: string | null
  deviceId: string | null
  deviceName: string | null
  username: string | null
  syncGroupId: string | null
  groupRevision: number | null
  hasOtherSyncData: boolean
  /** 会话 Token 到期时间（Unix 秒） */
  sessionExpiresAt: number | null
  /** 安全存储是否可用（safeStorage）。不可用时身份只在本次会话内存中保留 */
  secureStorageAvailable: boolean
}

/** 连接（注册/登录）结果 */
export interface ConnectResult {
  accountExists: boolean
  status: SyncStatus
}

/** 同步组内设备条目（`GET /devices`） */
export interface RelayDevice {
  deviceId: string
  deviceName: string
  createdAt: number
  lastSeenAt: number
  status: string
}

/** `POST /sync-codes` 响应 */
export interface SyncCodeResult {
  code: string
  expiresAt: number
}

/** `POST /sync-codes/redeem` 响应 */
export interface RedeemResult {
  joined: boolean
  syncGroupId: string
  groupRevision: number
}

/** `POST /sync-groups/discard-others` 响应 */
export interface DiscardResult {
  discardedDevices: number
  reclaimedBytes: number
}

/** Manifest head（`GET /manifests`） */
export interface ManifestHead {
  deviceId: string
  currentVersion: number
  updatedAt: number
}

/** `GET /manifests` 响应 */
export interface ManifestListResult {
  groupRevision: number
  heads: ManifestHead[]
}

/** 会话快照元数据（`GET /session-files`） */
export interface SessionFileMeta {
  sessionId: string
  version: number
  size: number
  updatedAt: number
}

/** `POST /event-tickets` 结果，附带派生的 WebSocket 地址 */
export interface EventTicketResult {
  wsUrl: string
  ticket: string
  subprotocol: string
  expiresAtMs: number
}

/** 断线重连对账摘要（不落地真实数据） */
export interface ReconcileSummary {
  groupRevision: number
  manifestHeads: ManifestHead[]
  sessionFiles: SessionFileMeta[]
}

/** WebSocket 事件（六类，判别联合，`serverTimeMs` 恒为 Unix 毫秒） */
export type RelayEvent =
  | { type: 'ready'; groupRevision: number; serverTimeMs: number }
  | {
      type: 'manifest_updated'
      deviceId: string
      version: number
      groupRevision: number
      serverTimeMs: number
    }
  | {
      type: 'session_file_updated'
      deviceId: string
      sessionId: string
      version: number
      serverTimeMs: number
    }
  | { type: 'session_file_deleted'; deviceId: string; sessionId: string; serverTimeMs: number }
  | { type: 'sync_group_merged'; groupRevision: number; serverTimeMs: number }
  | { type: 'device_revoked'; deviceId: string; serverTimeMs: number }

/** 服务端稳定错误码（§12.2）+ 客户端本地错误码 */
export type RelayErrorCode =
  // 服务端错误码
  | 'invalid_credentials'
  | 'invalid_device_proof'
  | 'device_revoked'
  | 'invalid_sync_code'
  | 'account_became_existing'
  | 'already_joined'
  | 'stale_manifest'
  | 'stale_session_file'
  | 'session_id_conflict'
  | 'group_changed'
  | 'block_busy'
  | 'bad_request'
  | 'block_hash_mismatch'
  | 'invalid_session_id'
  | 'block_not_found'
  | 'manifest_not_found'
  | 'session_file_not_found'
  | 'body_too_large'
  | 'quota_exceeded'
  | 'rate_limited'
  | 'internal_error'
  | 'relay_not_initialized'
  // 客户端本地错误码
  | 'network_error'
  | 'not_connected'
  | 'secure_storage_unavailable'
  | 'password_incorrect'
  | 'invalid_input'
  | 'invalid_response'
  | 'storage_error'
  | 'unknown_error'

/**
 * 统一 Result 模式：所有同步操作返回该结构，不抛未捕获异常。
 * `extra` 承载服务端附带字段（currentVersion / groupRevision / retryAfterMs 等）。
 */
export interface SyncResult<T = void> {
  success: boolean
  data?: T
  code?: RelayErrorCode
  error?: string
  extra?: Record<string, unknown>
}

/** 会话同步的单会话错误条目 */
export interface SessionSyncErrorItem {
  sessionId: string
  message: string
}

/** 一轮会话同步的结果摘要 */
export interface SessionSyncResult {
  /** 上行（新建+覆盖+合并回传）会话数 */
  uploaded: number
  /** 下行落盘会话数 */
  downloaded: number
  /** 发生行级合并的会话数 */
  merged: number
  /** 因远端删除而删除本地的会话数 */
  deletedLocal: number
  /** 上行删除远端的会话数 */
  deletedRemote: number
  /** 双端一致跳过的会话数 */
  skipped: number
  errors: SessionSyncErrorItem[]
}

/** 会话同步引擎状态（IPC 推送载荷） */
export interface SessionSyncState {
  phase: 'idle' | 'running' | 'error'
  /** 最近一轮完成时间（ISO 8601） */
  lastSyncAt: string | null
  lastResult: SessionSyncResult | null
  lastError: string | null
}

/** config 同步的错误条目（无 sessionId，config 是单文件） */
export interface ConfigSyncErrorItem {
  message: string
}

/** 一轮 config 同步的结果摘要 */
export interface ConfigSyncResult {
  /** 上行（新建/覆盖）manifest 次数 */
  uploaded: number
  /** 下行落盘采纳远端次数 */
  downloaded: number
  /** 发生本机优先合并后回写次数 */
  merged: number
  /** 双端一致跳过次数 */
  skipped: number
  errors: ConfigSyncErrorItem[]
}

/** config 同步引擎状态（IPC 推送载荷） */
export interface ConfigSyncState {
  phase: 'idle' | 'running' | 'error'
  /** 最近一轮完成时间（ISO 8601） */
  lastSyncAt: string | null
  lastResult: ConfigSyncResult | null
  lastError: string | null
}
