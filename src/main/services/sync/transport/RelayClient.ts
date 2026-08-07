/**
 * Relay HTTP 客户端：封装 net.fetch，负责 PoP 设备证明签名、请求体一致性、
 * 错误码归一，覆盖全部 REST 端点。所有方法返回统一 Result（不抛未捕获异常）。
 */
import { net } from 'electron'
import { randomBytes, randomUUID } from 'node:crypto'
import type {
  Bootstrap,
  ConnectStartResponse,
  ConnectionResult,
  DiscardResult,
  DiscoveryInfo,
  ManifestListResult,
  RelayDevice,
  RedeemResult,
  SessionFileMeta,
  SyncCodeResult,
  SyncResult
} from '@shared/types/sync'
import { encodeBase64Url, utf8ToBytes } from '../crypto/base64url'
import { sha256Hex } from '../crypto/hash'
import { sign as ed25519Sign } from '../crypto/keys'
import { toRelayErrorCode } from './relayErrors'

/** 可注入的 fetch 实现（默认 Electron net.fetch，测试可替换） */
export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

/** PoP 签名所需的设备身份与时钟偏差 */
interface AuthContext {
  deviceSeed: Uint8Array | null
  sessionToken: string | null
  serverTimeOffsetMs: number
}

/** 设备证明用的随机 nonce 字节数（解码后须落在 16~32 区间） */
const NONCE_BYTES = 24

export class RelayClient {
  private readonly baseUrl: string
  private readonly fetchImpl: FetchImpl
  private auth: AuthContext = {
    deviceSeed: null,
    sessionToken: null,
    serverTimeOffsetMs: 0
  }

  constructor(baseUrl: string, fetchImpl?: FetchImpl) {
    // 去除末尾斜杠，保留可能存在的反向代理子路径前缀
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.fetchImpl = fetchImpl ?? ((url, init) => net.fetch(url, init))
  }

  /** 设置/更新 PoP 所需的设备种子与会话 Token */
  setAuthContext(ctx: Partial<AuthContext>): void {
    this.auth = { ...this.auth, ...ctx }
  }

  /** 记录服务端与本地的时钟偏差（discover 时校准） */
  setServerTimeOffset(offsetMs: number): void {
    this.auth.serverTimeOffsetMs = offsetMs
  }

  /** 由 relayUrl 派生 WebSocket 事件地址（http→ws / https→wss，追加 /events） */
  getWebSocketUrl(): string {
    const url = new URL(this.baseUrl + '/events')
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.toString()
  }

  /** 返回构造时校验并规范化后的 Relay 基础地址。 */
  getBaseUrl(): string {
    return this.baseUrl
  }

  // ============ 无认证端点 ============

  /** GET /.well-known/lumina-relay */
  discover(): Promise<SyncResult<DiscoveryInfo>> {
    return this.requestJson<DiscoveryInfo>('GET', '/.well-known/lumina-relay', { authed: false })
  }

  /** POST /connections/start */
  connectionsStart(username: string): Promise<SyncResult<ConnectStartResponse>> {
    return this.requestJson('POST', '/connections/start', { authed: false, body: { username } })
  }

  /** POST /connections/complete（body 由 SyncService 按注册/登录分支构造） */
  connectionsComplete(body: Record<string, unknown>): Promise<SyncResult<ConnectionResult>> {
    return this.requestJson('POST', '/connections/complete', { authed: false, body })
  }

  /** POST /session-challenges */
  sessionChallenge(
    deviceId: string
  ): Promise<SyncResult<{ attemptId: string; challenge: string; expiresAt: number }>> {
    return this.requestJson('POST', '/session-challenges', { authed: false, body: { deviceId } })
  }

  /** POST /sessions */
  sessions(attemptId: string, signature: string): Promise<SyncResult<ConnectionResult>> {
    return this.requestJson('POST', '/sessions', { authed: false, body: { attemptId, signature } })
  }

  // ============ 账户数据端点（Bearer + PoP） ============

  /** GET /bootstrap */
  getBootstrap(): Promise<SyncResult<Bootstrap>> {
    return this.requestJson('GET', '/bootstrap', { authed: true })
  }

  /** POST /sync-codes（空 body） */
  generateSyncCode(): Promise<SyncResult<SyncCodeResult>> {
    return this.requestJson('POST', '/sync-codes', { authed: true })
  }

  /** POST /sync-codes/redeem */
  redeemSyncCode(code: string): Promise<SyncResult<RedeemResult>> {
    return this.requestJson('POST', '/sync-codes/redeem', { authed: true, body: { code } })
  }

  /** GET /devices */
  listDevices(): Promise<SyncResult<{ devices: RelayDevice[] }>> {
    return this.requestJson('GET', '/devices', { authed: true })
  }

  /** DELETE /devices/:deviceId */
  revokeDevice(deviceId: string): Promise<SyncResult<{ revoked: boolean }>> {
    return this.requestJson('DELETE', `/devices/${deviceId}`, { authed: true })
  }

  /** POST /sync-groups/discard-others */
  discardOtherGroups(
    groupRevision: number,
    accountProof: string
  ): Promise<SyncResult<DiscardResult>> {
    return this.requestJson('POST', '/sync-groups/discard-others', {
      authed: true,
      body: { groupRevision, accountProof }
    })
  }

  /** POST /event-tickets（空 body） */
  createEventTicket(): Promise<
    SyncResult<{ ticket: string; expiresAtMs: number; subprotocol: string }>
  > {
    return this.requestJson('POST', '/event-tickets', { authed: true })
  }

  // ============ Manifest / 块 / 会话文件（scope A 实现并单测，暂不搬运真实数据） ============

  /** GET /manifests */
  listManifests(): Promise<SyncResult<ManifestListResult>> {
    return this.requestJson('GET', '/manifests', { authed: true })
  }

  /** GET /manifests/:deviceId/:version（octet-stream，返回密文与 ETag） */
  async getManifest(
    deviceId: string,
    version: number
  ): Promise<SyncResult<{ bytes: Uint8Array; etag: string | null }>> {
    const result = await this.requestBinaryDownload('GET', `/manifests/${deviceId}/${version}`)
    if (!result.success || !result.data) return this.asError(result)
    return {
      success: true,
      data: { bytes: result.data.bytes, etag: result.data.headers.get('ETag') }
    }
  }

  /** PUT /manifests/self/:baseVersion（octet-stream 上传） */
  putSelfManifest(
    baseVersion: number,
    ciphertext: Uint8Array
  ): Promise<SyncResult<{ version: number; idempotent: boolean }>> {
    return this.requestBinaryUpload(`/manifests/self/${baseVersion}`, ciphertext)
  }

  /** POST /blocks/missing */
  blocksMissing(ids: string[]): Promise<SyncResult<{ missing: string[] }>> {
    return this.requestJson('POST', '/blocks/missing', { authed: true, body: { ids } })
  }

  /** PUT /blocks/:blockId（octet-stream 上传） */
  putBlock(blockId: string, ciphertext: Uint8Array): Promise<SyncResult<{ created: boolean }>> {
    return this.requestBinaryUpload(`/blocks/${blockId}`, ciphertext)
  }

  /** GET /blocks/:blockId（octet-stream 下载） */
  async getBlock(blockId: string): Promise<SyncResult<{ bytes: Uint8Array }>> {
    const result = await this.requestBinaryDownload('GET', `/blocks/${blockId}`)
    if (!result.success || !result.data) return this.asError(result)
    return { success: true, data: { bytes: result.data.bytes } }
  }

  /** GET /session-files */
  listSessionFiles(): Promise<SyncResult<{ sessions: SessionFileMeta[] }>> {
    return this.requestJson('GET', '/session-files', { authed: true })
  }

  /** GET /session-files/:sessionId（octet-stream，版本在 X-Session-File-Version 头） */
  async getSessionFile(
    sessionId: string
  ): Promise<SyncResult<{ bytes: Uint8Array; version: number | null }>> {
    const result = await this.requestBinaryDownload('GET', `/session-files/${sessionId}`)
    if (!result.success || !result.data) return this.asError(result)
    const header = result.data.headers.get('X-Session-File-Version')
    const parsedVersion = header ? Number(header) : NaN
    const version = Number.isSafeInteger(parsedVersion) && parsedVersion > 0 ? parsedVersion : null
    return { success: true, data: { bytes: result.data.bytes, version } }
  }

  /** PUT /session-files/:sessionId/:baseVersion（octet-stream 上传，非空） */
  putSessionFile(
    sessionId: string,
    baseVersion: number,
    ciphertext: Uint8Array
  ): Promise<SyncResult<{ version: number; size: number }>> {
    return this.requestBinaryUpload(`/session-files/${sessionId}/${baseVersion}`, ciphertext)
  }

  /** DELETE /session-files/:sessionId/:baseVersion */
  deleteSessionFile(
    sessionId: string,
    baseVersion: number
  ): Promise<SyncResult<{ deleted: boolean }>> {
    return this.requestJson('DELETE', `/session-files/${sessionId}/${baseVersion}`, {
      authed: true
    })
  }

  // ============ 内部实现 ============

  /** 拼接完整请求 URL（含可能的子路径前缀） */
  private buildUrl(path: string): string {
    return this.baseUrl + path
  }

  /** 计算用于 PoP canonical 的 path（去 query，含子路径前缀） */
  private signedPath(path: string): string {
    return new URL(this.baseUrl + path).pathname
  }

  /**
   * 构造设备证明请求头。缺少设备种子或会话 Token 时返回 null（未连接）。
   * canonical = UPPER(method)
path
timestamp
nonce
hex(sha256(bodyBytes))
   * 每次调用生成全新 nonce（重试必换）。
   */
  private buildPopHeaders(
    method: string,
    path: string,
    bodyBytes: Uint8Array
  ): Record<string, string> | null {
    if (!this.auth.deviceSeed || !this.auth.sessionToken) {
      return null
    }
    const timestamp = String(Date.now() + this.auth.serverTimeOffsetMs)
    const nonce = encodeBase64Url(new Uint8Array(randomBytes(NONCE_BYTES)))
    const canonical = [
      method.toUpperCase(),
      this.signedPath(path),
      timestamp,
      nonce,
      sha256Hex(bodyBytes)
    ].join('\n')
    const signature = encodeBase64Url(ed25519Sign(utf8ToBytes(canonical), this.auth.deviceSeed))
    return {
      Authorization: `Bearer ${this.auth.sessionToken}`,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
      'X-Request-ID': randomUUID()
    }
  }

  /** 发送 JSON 请求（或空 body），解析为 Result */
  private async requestJson<T>(
    method: string,
    path: string,
    options: { authed: boolean; body?: unknown }
  ): Promise<SyncResult<T>> {
    const hasBody = options.body !== undefined
    const headers: Record<string, string> = {}
    let bodyBytes: Uint8Array = new Uint8Array(0)
    if (hasBody) {
      // 先序列化成最终字节，对同一字节计算签名并原样发送
      bodyBytes = utf8ToBytes(JSON.stringify(options.body))
      headers['Content-Type'] = 'application/json'
    }
    if (options.authed) {
      const pop = this.buildPopHeaders(method, path, bodyBytes)
      if (!pop) return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
      Object.assign(headers, pop)
    }
    let response: Response
    try {
      response = await this.fetchImpl(this.buildUrl(path), {
        method,
        headers,
        body: hasBody ? toRequestBody(bodyBytes) : undefined
      })
    } catch (err) {
      return { success: false, code: 'network_error', error: normalizeError(err) }
    }
    return this.parseJsonResponse<T>(response)
  }

  /** 发送 octet-stream 上传（PUT），返回 JSON Result */
  private async requestBinaryUpload<T>(
    path: string,
    bodyBytes: Uint8Array
  ): Promise<SyncResult<T>> {
    const pop = this.buildPopHeaders('PUT', path, bodyBytes)
    if (!pop) return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream', ...pop }
    let response: Response
    try {
      response = await this.fetchImpl(this.buildUrl(path), {
        method: 'PUT',
        headers,
        body: toRequestBody(bodyBytes)
      })
    } catch (err) {
      return { success: false, code: 'network_error', error: normalizeError(err) }
    }
    return this.parseJsonResponse<T>(response)
  }

  /** 发送 octet-stream 下载（GET），返回原始字节与响应头 */
  private async requestBinaryDownload(
    method: string,
    path: string
  ): Promise<SyncResult<{ bytes: Uint8Array; headers: Headers }>> {
    const pop = this.buildPopHeaders(method, path, new Uint8Array(0))
    if (!pop) return { success: false, code: 'not_connected', error: '尚未连接同步服务' }
    let response: Response
    try {
      response = await this.fetchImpl(this.buildUrl(path), { method, headers: pop })
    } catch (err) {
      return { success: false, code: 'network_error', error: normalizeError(err) }
    }
    if (!response.ok) {
      return this.toErrorResult(await safeParseJson(response), response.status)
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { success: true, data: { bytes, headers: response.headers } }
  }

  /** 解析 JSON 响应为 Result */
  private async parseJsonResponse<T>(response: Response): Promise<SyncResult<T>> {
    const parsed = await safeParseJson(response)
    if (response.ok) {
      return { success: true, data: parsed as T }
    }
    return this.toErrorResult(parsed, response.status)
  }

  /** 把服务端错误响应体转为 Result（附带 currentVersion/groupRevision/retryAfterMs 等 extra） */
  private toErrorResult<T>(parsed: unknown, status: number): SyncResult<T> {
    const errObj = (parsed as { error?: Record<string, unknown> } | undefined)?.error
    const code = toRelayErrorCode(errObj?.code)
    const message = typeof errObj?.message === 'string' ? errObj.message : `HTTP ${status}`
    const extra: Record<string, unknown> = {}
    if (errObj) {
      for (const [key, value] of Object.entries(errObj)) {
        if (key !== 'code' && key !== 'message') extra[key] = value
      }
    }
    return {
      success: false,
      code,
      error: message,
      extra: Object.keys(extra).length > 0 ? extra : undefined
    }
  }

  /** 把失败的下载 Result 透传为目标泛型的错误 Result */
  private asError<T>(result: SyncResult<unknown>): SyncResult<T> {
    return { success: false, code: result.code, error: result.error, extra: result.extra }
  }
}

/** 读取响应文本并尝试解析 JSON，失败返回 undefined */
async function safeParseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** 归一化异常为字符串 */
function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 只接受 HTTP(S) Relay 地址，拒绝会改变请求目标或泄露凭证的 URL 组成。 */
function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Relay 地址仅支持 HTTP 或 HTTPS')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Relay 地址不能包含凭证、查询参数或片段')
  }
  return url.toString().replace(/\/+$/, '')
}

/**
 * TS 6 将通用 Uint8Array<ArrayBufferLike> 与 DOM BodyInit 区分得更严格。
 * 复制到明确由 ArrayBuffer 支撑的视图，确保签名和发送内容逐字节一致。
 */
function toRequestBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
