/**
 * 联调集成测试：真实 SyncService / RelayClient / 密码学模块 直连运行中的 Lumina Relay。
 *
 * 运行前提：Relay 已在本地启动（默认 http://localhost:8443，可用环境变量
 * LUMINA_RELAY_URL 覆盖）；服务不可用时整组用例跳过，不影响离线开发。
 *
 * 覆盖链路（对应 docs/sync-data-spec.md 的同步数据需求）：
 *   服务发现 → 注册/登录/会话续期（SyncService 编排层）
 *   → Manifest + 块通道（papers/config/knowledge/writing 共用的 E2EE 数据通道）
 *   → 会话文件通道（sessions 的整文件快照 CAS）
 *   → 多设备六位码合并后凭密码解开同一 DEK 读取对端密文（E2EE 端到端闭环）
 *   → WebSocket 事件 → 错误语义（hash 校验/CAS/隔离/吊销）。
 *
 * 注意：每次运行都会向 Relay 写入测试账号与数据，仅用于本地开发联调。
 */
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import type { Bootstrap, SyncResult } from '@shared/types/sync'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { SyncService } from './SyncService'
import { RelayClient } from './transport/RelayClient'
import { decodeBase64Url, encodeBase64Url, utf8ToBytes } from './crypto/base64url'
import { sha256Bytes, sha256Hex } from './crypto/hash'
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
  buildLoginTranscript
} from './crypto/transcript'

const RELAY_URL = process.env.LUMINA_RELAY_URL ?? 'http://localhost:8443'

/** Relay 是否可达（before 钩子探测，不可达时全部跳过） */
let serverUp = false

/** 跨用例共享的联调上下文 */
interface RawDevice {
  client: RelayClient
  accountId: string
  deviceId: string
  deviceSeed: Uint8Array
  sessionToken: string
  dek: Uint8Array
  bootstrap: Bootstrap
}

const ctx: {
  username1?: string
  password1?: string
  username2?: string
  password2?: string
  svcA?: SyncService
  svcB?: SyncService
  deviceC?: RawDevice
  deviceD?: RawDevice
  configBlockId?: string
  configPlaintext?: string
  keptSessionId?: string
  keptSessionPlaintext?: string
} = {}

before(async () => {
  try {
    const response = await globalThis.fetch(`${RELAY_URL}/.well-known/lumina-relay`)
    serverUp = response.ok
  } catch {
    serverUp = false
  }
  if (!serverUp) {
    console.error(`[联调] Relay 不可达（${RELAY_URL}），全部用例跳过`)
  }
})

/** Relay 未运行时跳过当前用例 */
function skipIfDown(t: { skip: (msg?: string) => void }): boolean {
  if (!serverUp) {
    t.skip('Relay 未运行')
    return true
  }
  return false
}

/** 断言 Result 成功并取出 data */
function unwrap<T>(result: SyncResult<T>): T {
  assert.equal(result.success, true, `${result.code ?? ''} ${result.error ?? '请求失败'}`.trim())
  assert.ok(result.data !== undefined, '成功响应缺少 data')
  return result.data
}

function randomUsername(): string {
  return `itest-${randomBytes(4).toString('hex')}`
}

/** DEK 加解密（客户端侧密文格式约定：24 字节 nonce || XChaCha20-Poly1305 密文） */
function sealWithDek(dek: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = new Uint8Array(randomBytes(24))
  const sealed = xchacha20poly1305(dek, nonce).encrypt(plaintext)
  const out = new Uint8Array(24 + sealed.length)
  out.set(nonce, 0)
  out.set(sealed, 24)
  return out
}

function openWithDek(dek: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const nonce = ciphertext.subarray(0, 24)
  return xchacha20poly1305(dek, nonce).decrypt(ciphertext.subarray(24))
}

/** 注入真实 fetch 创建 SyncService，并捕获其内部使用的 RelayClient */
function createSyncService(): SyncService {
  return new SyncService({
    createClient: (baseUrl) => new RelayClient(baseUrl, (url, init) => globalThis.fetch(url, init))
  })
}

/**
 * 不走 SyncService 编排、直接用 RelayClient + 密码学模块完成注册/登录。
 * 用于需要持有 DEK / 设备种子 / 会话 Token 的数据通道用例。
 * transcript 与信封构造全部复用生产代码（crypto/*），仅编排顺序与 SyncService.connect 一致。
 */
async function connectRawDevice(
  username: string,
  password: string,
  deviceName: string
): Promise<RawDevice> {
  const client = new RelayClient(RELAY_URL, (url, init) => globalThis.fetch(url, init))
  const discovery = unwrap(await client.discover())
  const instanceId = discovery.instanceId
  client.setServerTimeOffset(discovery.serverTimeMs - Date.now())

  const start = unwrap(await client.connectionsStart(username))
  const authSalt = decodeBase64Url(start.authSalt, 16)
  const challenge = decodeBase64Url(start.challenge, 32)

  const passwordRoot = await derivePasswordRoot(password, authSalt)
  const loginSeed = deriveLoginSeed(passwordRoot)
  const envelopeKey = deriveEnvelopeKey(passwordRoot)

  const deviceId = randomUUID()
  const deviceSeed = generateSeed()
  const devicePublicKey = getPublicKey(deviceSeed)

  let dek: Uint8Array
  let body: Record<string, unknown>

  if (start.accountExists) {
    const transcript = buildLoginTranscript({
      instanceId,
      attemptId: start.attemptId,
      normalizedUsername: username,
      challenge,
      deviceId,
      deviceName,
      devicePublicKey
    })
    body = {
      attemptId: start.attemptId,
      deviceId,
      deviceName,
      devicePublicKey: encodeBase64Url(devicePublicKey),
      loginProof: encodeBase64Url(sign(transcript, loginSeed)),
      deviceProof: encodeBase64Url(sign(transcript, deviceSeed))
    }
    dek = new Uint8Array(0)
  } else {
    const accountId = randomUUID()
    dek = generateDek()
    const loginPublicKey = getPublicKey(loginSeed)
    const accountAuthSeed = deriveAccountAuthSeed(dek)
    const accountAuthPublicKey = getPublicKey(accountAuthSeed)
    const aad = buildDekEnvelopeAad({
      instanceId,
      normalizedUsername: username,
      accountId,
      authSalt
    })
    const dekEnvelope = sealDek(envelopeKey, dek, aad)
    const transcript = buildAccountCreateTranscript({
      instanceId,
      attemptId: start.attemptId,
      challenge,
      normalizedUsername: username,
      accountId,
      authSalt,
      loginPublicKey,
      accountAuthPublicKey,
      dekEnvelopeHash: sha256Bytes(dekEnvelope),
      deviceId,
      deviceName,
      devicePublicKey
    })
    body = {
      attemptId: start.attemptId,
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

  const complete = unwrap(await client.connectionsComplete(body))
  if (start.accountExists) {
    const aad = buildDekEnvelopeAad({
      instanceId,
      normalizedUsername: username,
      accountId: complete.bootstrap.accountId,
      authSalt
    })
    dek = openDek(envelopeKey, decodeBase64Url(complete.bootstrap.dekEnvelope), aad)
  }
  client.setAuthContext({ deviceSeed, sessionToken: complete.session.token })
  return {
    client,
    accountId: complete.bootstrap.accountId,
    deviceId,
    deviceSeed,
    sessionToken: complete.session.token,
    dek,
    bootstrap: complete.bootstrap
  }
}

/** Manifest 明文条目（§6.4 客户端契约，服务端不可见） */
function manifestEntry(
  key: string,
  writerDeviceId: string,
  blocks: string[],
  size: number
): Record<string, unknown> {
  return {
    key,
    hlc: { physicalMs: Date.now(), logical: 0 },
    writerDeviceId,
    operationId: randomUUID(),
    tombstone: false,
    blocks,
    size
  }
}

function buildManifestPlaintext(
  deviceId: string,
  deviceVersion: number,
  entries: Record<string, unknown>[]
): Uint8Array {
  return utf8ToBytes(JSON.stringify({ deviceId, deviceVersion, entries }))
}

/** 轮询等待条件成立（WebSocket 事件断言用） */
async function waitFor(
  condition: () => boolean,
  description: string,
  timeoutMs = 8000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.fail(`等待超时：${description}`)
}

// ============ 1. SyncService 编排层：注册 → 续期 ============

test('SyncService：注册新账号并续期会话', async (t) => {
  if (skipIfDown(t)) return
  const svc = createSyncService()
  const username = randomUsername()
  const password = `pw-${randomBytes(6).toString('hex')}`

  const connected = unwrap(await svc.connect(RELAY_URL, username, password))
  assert.equal(connected.accountExists, false, '新用户名应走注册分支')
  assert.equal(connected.status.connected, true)
  assert.equal(connected.status.username, username)
  assert.ok(connected.status.sessionExpiresAt !== null && connected.status.sessionExpiresAt > 0)

  const renewed = unwrap(await svc.renewSession())
  assert.equal(renewed.connected, true)

  ctx.username1 = username
  ctx.password1 = password
  ctx.svcA = svc
  t.diagnostic(`账号1（SyncService 设备A）注册成功：${username}`)
})

// ============ 2. SyncService 编排层：登录 → 六位码合并 → 对账 ============

test('SyncService：已有账号登录、六位码合并同步组、设备列表与对账', async (t) => {
  if (skipIfDown(t)) return
  assert.ok(ctx.username1 && ctx.password1 && ctx.svcA, '依赖用例 1')

  const svcB = createSyncService()
  const connected = unwrap(await svcB.connect(RELAY_URL, ctx.username1, ctx.password1))
  assert.equal(connected.accountExists, true, '同用户名应走登录分支')
  assert.equal(connected.status.hasOtherSyncData, false, '账号1 尚未上传任何数据')

  // A 生成六位同步码，B 兑换 → 两个同步组永久合并
  const code = unwrap(await ctx.svcA.generateSyncCode())
  assert.match(code.code, /^\d{6}$/)
  const redeemed = unwrap(await svcB.redeemSyncCode(code.code))
  assert.equal(redeemed.joined, true)

  const devices = unwrap(await ctx.svcA.listDevices())
  assert.equal(devices.length, 2, '合并后组内应有两台设备')

  const summary = unwrap(await svcB.reconcile())
  assert.ok(summary.groupRevision >= 2, '合并后 groupRevision 应推进')
  assert.ok(Array.isArray(summary.manifestHeads))
  assert.ok(Array.isArray(summary.sessionFiles))

  ctx.svcB = svcB
  t.diagnostic('设备B 登录 + 六位码合并成功')
})

// ============ 3. Manifest + 块通道（papers/config/knowledge/writing 共用） ============

test('数据通道：块查缺/上传/幂等、Manifest CAS 与下载解密', async (t) => {
  if (skipIfDown(t)) return
  const username = randomUsername()
  const password = `pw-${randomBytes(6).toString('hex')}`
  const deviceC = await connectRawDevice(username, password, '联调设备C')
  ctx.deviceC = deviceC
  ctx.username2 = username
  ctx.password2 = password

  // 构造一份贴近真实 config.json 的明文（含明文 API key，验证 E2EE 保护对象）
  const configPlaintext = JSON.stringify(
    {
      theme: { name: 'lumina-dark', mode: 'manual' },
      llm_config: {
        default_model: 'deepseek-chat',
        compression_threshold: 20000,
        enable_auto_compression: true,
        models: [
          {
            base_url: 'https://api.deepseek.com',
            api_key: 'sk-itest-secret-key',
            model_name: 'deepseek-chat'
          }
        ]
      },
      mcpServers: {}
    },
    null,
    2
  )
  ctx.configPlaintext = configPlaintext
  const configCipher = sealWithDek(deviceC.dek, utf8ToBytes(configPlaintext))
  const configBlockId = sha256Hex(configCipher)
  ctx.configBlockId = configBlockId

  // 块查缺 → 上传 → 重复上传幂等
  const missingBefore = unwrap(await deviceC.client.blocksMissing([configBlockId]))
  assert.deepEqual(missingBefore.missing, [configBlockId], '新块应在 missing 列表中')
  const put1 = unwrap(await deviceC.client.putBlock(configBlockId, configCipher))
  assert.equal(put1.created, true)
  const put2 = unwrap(await deviceC.client.putBlock(configBlockId, configCipher))
  assert.equal(put2.created, false, '重复上传同一块应幂等')
  const missingAfter = unwrap(await deviceC.client.blocksMissing([configBlockId]))
  assert.deepEqual(missingAfter.missing, [], '上传后块不应再缺失')

  // 第二块：模拟 annotations.json 变更后的新密文
  const annotationsPlaintext = JSON.stringify({
    version: 3,
    paperId: randomUUID(),
    annotations: [{ id: randomUUID(), kind: 'highlight', comment: '重要' }],
    updatedAt: new Date().toISOString()
  })
  const annotationsCipher = sealWithDek(deviceC.dek, utf8ToBytes(annotationsPlaintext))
  const annotationsBlockId = sha256Hex(annotationsCipher)
  unwrap(await deviceC.client.putBlock(annotationsBlockId, annotationsCipher))

  // Manifest v1：两个条目（config/settings + papers/<id>/annotations.json）
  const manifestV1 = buildManifestPlaintext(deviceC.deviceId, 1, [
    manifestEntry('config/settings', deviceC.deviceId, [configBlockId], configPlaintext.length),
    manifestEntry(
      'papers/itest-paper/annotations.json',
      deviceC.deviceId,
      [annotationsBlockId],
      annotationsPlaintext.length
    )
  ])
  const manifestCipherV1 = sealWithDek(deviceC.dek, manifestV1)
  const putM1 = unwrap(await deviceC.client.putSelfManifest(0, manifestCipherV1))
  assert.equal(putM1.version, 1)

  // 幂等重放：重发完全相同的上一次请求（同 base + 同内容），版本不推进
  const replay = unwrap(await deviceC.client.putSelfManifest(0, manifestCipherV1))
  assert.equal(replay.version, 1)
  assert.equal(replay.idempotent, true)

  // CAS：过期 baseVersion 拒绝
  const manifestV2 = buildManifestPlaintext(deviceC.deviceId, 2, [
    manifestEntry('config/settings', deviceC.deviceId, [configBlockId], configPlaintext.length)
  ])
  const manifestCipherV2 = sealWithDek(deviceC.dek, manifestV2)
  const stale = await deviceC.client.putSelfManifest(0, manifestCipherV2)
  assert.equal(stale.success, false)
  assert.equal(stale.code, 'stale_manifest')
  assert.equal(stale.extra?.currentVersion, 1)

  // 正确 base 推进到 v2
  const putM2 = unwrap(await deviceC.client.putSelfManifest(1, manifestCipherV2))
  assert.equal(putM2.version, 2)

  // 列表与下载解密
  const list = unwrap(await deviceC.client.listManifests())
  const head = list.heads.find((h) => h.deviceId === deviceC.deviceId)
  assert.equal(head?.currentVersion, 2)

  const downloaded = unwrap(await deviceC.client.getManifest(deviceC.deviceId, 2))
  const decrypted = JSON.parse(
    Buffer.from(openWithDek(deviceC.dek, downloaded.bytes)).toString('utf-8')
  ) as { entries: { key: string }[] }
  assert.deepEqual(
    decrypted.entries.map((e) => e.key),
    ['config/settings']
  )

  // 不存在的版本
  const notFound = await deviceC.client.getManifest(deviceC.deviceId, 999)
  assert.equal(notFound.code, 'manifest_not_found')

  t.diagnostic(
    `Manifest+块通道验证通过（config 密文 ${configCipher.length}B，manifest v1→v2 CAS 正常）`
  )
})

// ============ 4. 会话文件通道（sessions 整文件快照 CAS） ============

test('会话文件：上传/列表/下载/版本 CAS/删除', async (t) => {
  if (skipIfDown(t)) return
  const deviceC = ctx.deviceC
  assert.ok(deviceC, '依赖用例 3')

  // 构造贴近真实 JSONL 的会话明文（首行 meta + 两条 message）
  const sessionId = `session-${Date.now()}-itest01`
  const sessionJsonl = [
    JSON.stringify({
      kind: 'meta',
      v: 1,
      data: {
        sessionId,
        title: '联调会话',
        sessionType: 'default',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }),
    JSON.stringify({
      kind: 'message',
      data: { id: randomUUID(), role: 'user', content: '你好', timestamp: new Date().toISOString() }
    }),
    JSON.stringify({
      kind: 'message',
      data: {
        id: randomUUID(),
        role: 'assistant',
        content: '你好，我是 Lumina',
        timestamp: new Date().toISOString()
      }
    })
  ].join('\n')
  const sessionCipher = sealWithDek(deviceC.dek, utf8ToBytes(sessionJsonl))

  const put1 = unwrap(await deviceC.client.putSessionFile(sessionId, 0, sessionCipher))
  assert.equal(put1.version, 1)

  const downloaded = unwrap(await deviceC.client.getSessionFile(sessionId))
  assert.equal(downloaded.version, 1, '响应头应携带当前版本')
  const decrypted = Buffer.from(openWithDek(deviceC.dek, downloaded.bytes)).toString('utf-8')
  assert.equal(decrypted, sessionJsonl)

  const listed = unwrap(await deviceC.client.listSessionFiles())
  assert.ok(listed.sessions.some((s) => s.sessionId === sessionId && s.version === 1))

  // CAS：过期 baseVersion 拒绝
  const stalePut = await deviceC.client.putSessionFile(sessionId, 0, sessionCipher)
  assert.equal(stalePut.code, 'stale_session_file')
  assert.equal(stalePut.extra?.currentVersion, 1)
  const staleDelete = await deviceC.client.deleteSessionFile(sessionId, 99)
  assert.equal(staleDelete.code, 'stale_session_file')

  // 非法 sessionId
  const invalidId = await deviceC.client.putSessionFile('bogus-id', 0, sessionCipher)
  assert.equal(invalidId.code, 'invalid_session_id')

  // 保留一个会话快照给设备D 合并后读取
  const keptSessionId = `session-${Date.now()}-itest02`
  ctx.keptSessionId = keptSessionId
  ctx.keptSessionPlaintext = sessionJsonl
  unwrap(await deviceC.client.putSessionFile(keptSessionId, 0, sessionCipher))

  // 删除第一个快照
  const deleted = unwrap(await deviceC.client.deleteSessionFile(sessionId, 1))
  assert.equal(deleted.deleted, true)
  const gone = await deviceC.client.getSessionFile(sessionId)
  assert.equal(gone.code, 'session_file_not_found')

  t.diagnostic('会话文件通道验证通过（上传/下载/版本 CAS/删除）')
})

// ============ 5. 多设备 E2EE：新设备凭密码解开同一 DEK，合并后读取对端密文 ============

test('多设备：登录解出同一 DEK、合并前隔离、六位码合并后读取对端数据', async (t) => {
  if (skipIfDown(t)) return
  const deviceC = ctx.deviceC
  assert.ok(deviceC && ctx.username2 && ctx.password2, '依赖用例 3')

  const deviceD = await connectRawDevice(ctx.username2, ctx.password2, '联调设备D')
  ctx.deviceD = deviceD
  assert.deepEqual(deviceD.dek, deviceC.dek, '同密码应解出同一 DEK（E2EE 关键性质）')
  assert.equal(deviceD.bootstrap.hasOtherSyncData, true, '设备C 已上传数据，应提示有其他同步数据')

  // 合并前：D 在空白组，heads 仅含 D 自己的 0 版本 head，看不到 C 的任何数据（组间隔离）
  const isolatedHeads = unwrap(await deviceD.client.listManifests())
  assert.equal(isolatedHeads.heads.length, 1, '空白组只应列出本设备的空 head')
  assert.equal(isolatedHeads.heads[0]?.deviceId, deviceD.deviceId)
  assert.equal(isolatedHeads.heads[0]?.currentVersion, 0)
  const isolatedBlock = await deviceD.client.getBlock(ctx.configBlockId ?? '')
  assert.equal(isolatedBlock.code, 'block_not_found')
  const isolatedSession = await deviceD.client.getSessionFile(ctx.keptSessionId ?? '')
  assert.equal(isolatedSession.code, 'session_file_not_found')

  // 六位码合并
  const code = unwrap(await deviceC.client.generateSyncCode())
  const redeemed = unwrap(await deviceD.client.redeemSyncCode(code.code))
  assert.equal(redeemed.joined, true)

  // 合并后：D 能列出 C 的 head、下载并解密 C 的 manifest / 块 / 会话快照
  const heads = unwrap(await deviceD.client.listManifests())
  const headC = heads.heads.find((h) => h.deviceId === deviceC.deviceId)
  assert.equal(headC?.currentVersion, 2)

  const manifestDl = unwrap(await deviceD.client.getManifest(deviceC.deviceId, 2))
  const manifestPlain = JSON.parse(
    Buffer.from(openWithDek(deviceD.dek, manifestDl.bytes)).toString('utf-8')
  ) as { entries: { key: string }[] }
  assert.deepEqual(
    manifestPlain.entries.map((e) => e.key),
    ['config/settings']
  )

  const blockDl = unwrap(await deviceD.client.getBlock(ctx.configBlockId ?? ''))
  const configPlain = Buffer.from(openWithDek(deviceD.dek, blockDl.bytes)).toString('utf-8')
  assert.equal(configPlain, ctx.configPlaintext, '设备D 应能解密设备C 的 config 密文')

  const sessionDl = unwrap(await deviceD.client.getSessionFile(ctx.keptSessionId ?? ''))
  const sessionPlain = Buffer.from(openWithDek(deviceD.dek, sessionDl.bytes)).toString('utf-8')
  assert.equal(sessionPlain, ctx.keptSessionPlaintext, '设备D 应能解密设备C 的会话快照')

  t.diagnostic('多设备 E2EE 闭环成立：合并后凭同一 DEK 读取对端 manifest/块/会话快照')
})

// ============ 6. WebSocket 事件 ============

test('WebSocket：ready 事件与 manifest_updated 实时推送', async (t) => {
  if (skipIfDown(t)) return
  const deviceC = ctx.deviceC
  const deviceD = ctx.deviceD
  assert.ok(deviceC && deviceD, '依赖用例 5')

  const ticket = unwrap(await deviceD.client.createEventTicket())
  assert.equal(ticket.subprotocol, 'lumina-events')

  const WebSocketCtor = (
    globalThis as {
      WebSocket?: new (
        url: string,
        protocols: string[]
      ) => {
        addEventListener(type: string, listener: (event: { data?: unknown }) => void): void
        close(): void
      }
    }
  ).WebSocket
  assert.ok(WebSocketCtor, '当前 Node 需要提供全局 WebSocket')

  const events: { type?: string; deviceId?: string; version?: number }[] = []
  const ws = new WebSocketCtor(deviceD.client.getWebSocketUrl(), [
    ticket.subprotocol,
    `ticket.${ticket.ticket}`
  ])
  ws.addEventListener('message', (event) => {
    try {
      events.push(JSON.parse(String(event.data)) as { type?: string })
    } catch {
      // 忽略非 JSON 帧
    }
  })

  try {
    await waitFor(() => events.some((e) => e.type === 'ready'), 'ready 事件')
    // C 推进 manifest v3，D 应实时收到事件
    const manifestV3 = buildManifestPlaintext(deviceC.deviceId, 3, [
      manifestEntry('config/settings', deviceC.deviceId, [ctx.configBlockId ?? ''], 1)
    ])
    unwrap(await deviceC.client.putSelfManifest(2, sealWithDek(deviceC.dek, manifestV3)))
    await waitFor(
      () => events.some((e) => e.type === 'manifest_updated' && e.deviceId === deviceC.deviceId),
      'manifest_updated 事件'
    )
  } finally {
    ws.close()
  }

  t.diagnostic(`WebSocket 事件验证通过（收到 ${events.length} 条事件）`)
})

// ============ 7. 错误语义 ============

test('错误语义：hash 校验、query 拒绝、资源缺失', async (t) => {
  if (skipIfDown(t)) return
  const deviceC = ctx.deviceC
  assert.ok(deviceC, '依赖用例 3')

  // blockId 与内容不匹配 → block_hash_mismatch
  const cipher = sealWithDek(deviceC.dek, utf8ToBytes('tamper-check'))
  const wrongId = sha256Hex(utf8ToBytes('other-content'))
  const mismatch = await deviceC.client.putBlock(wrongId, cipher)
  assert.equal(mismatch.code, 'block_hash_mismatch')

  // 已认证接口携带 query → invalid_device_proof
  const timestamp = String(Date.now())
  const nonce = encodeBase64Url(new Uint8Array(randomBytes(24)))
  const canonical = ['GET', '/manifests', timestamp, nonce, sha256Hex(new Uint8Array(0))].join('\n')
  const signature = encodeBase64Url(sign(utf8ToBytes(canonical), deviceC.deviceSeed))
  const queryResponse = await globalThis.fetch(`${RELAY_URL}/manifests?probe=1`, {
    headers: {
      Authorization: `Bearer ${deviceC.sessionToken}`,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature
    }
  })
  assert.equal(queryResponse.status, 401)
  const queryBody = (await queryResponse.json()) as { error?: { code?: string } }
  assert.equal(queryBody.error?.code, 'invalid_device_proof')

  // 缺失资源
  const missingBlock = await deviceC.client.getBlock(sha256Hex(utf8ToBytes('never-uploaded')))
  assert.equal(missingBlock.code, 'block_not_found')
  const missingSession = await deviceC.client.getSessionFile('session-1-nonexistent')
  assert.equal(missingSession.code, 'session_file_not_found')

  t.diagnostic('错误语义验证通过（hash 校验/query 拒绝/404）')
})

// ============ 8. 设备吊销 ============

test('设备吊销：吊销后对端请求立即失效，SyncService 自动清理本地身份', async (t) => {
  if (skipIfDown(t)) return
  const deviceC = ctx.deviceC
  const deviceD = ctx.deviceD
  assert.ok(deviceC && deviceD && ctx.svcA && ctx.svcB, '依赖用例 2/5')

  // 账号2：C 吊销 D
  const revoked = unwrap(await deviceC.client.revokeDevice(deviceD.deviceId))
  assert.equal(revoked.revoked, true)
  const afterRevoke = await deviceD.client.listManifests()
  assert.equal(afterRevoke.code, 'device_revoked', '被吊销设备应立即被拒绝')

  // 账号1：A 吊销 B，SyncService 收到 device_revoked 应自动断开并清理
  const statusB = ctx.svcB.getStatus()
  assert.ok(statusB.deviceId, '设备B 应有 deviceId')
  const revokedB = unwrap(await ctx.svcA.revokeDevice(statusB.deviceId ?? ''))
  assert.equal(revokedB.revoked, true)
  const listAfter = await ctx.svcB.listDevices()
  assert.equal(listAfter.success, false)
  assert.equal(listAfter.code, 'device_revoked')
  assert.equal(ctx.svcB.getStatus().connected, false, 'SyncService 应在吊销后自动断开')

  t.diagnostic('设备吊销验证通过')
})
