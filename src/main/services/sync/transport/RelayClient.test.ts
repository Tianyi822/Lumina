import assert from 'node:assert/strict'
import test from 'node:test'

import { decodeBase64Url, utf8ToBytes } from '../crypto/base64url'
import { sha256Hex } from '../crypto/hash'
import { getPublicKey, verify } from '../crypto/keys'
import { RelayClient, type FetchImpl } from './RelayClient'

interface CapturedRequest {
  url: string
  init: RequestInit
}

test('已认证 JSON 请求对最终发送字节生成正确 PoP', async () => {
  const captured: CapturedRequest[] = []
  const fetchImpl: FetchImpl = async (url, init = {}) => {
    captured.push({ url, init })
    return Response.json({ joined: true, syncGroupId: 'group', groupRevision: 2 })
  }
  const deviceSeed = new Uint8Array(32).fill(7)
  const client = new RelayClient('https://relay.example/proxy/', fetchImpl)
  client.setAuthContext({ deviceSeed, sessionToken: 'session-token', serverTimeOffsetMs: 0 })

  const result = await client.redeemSyncCode('123456')

  assert.equal(result.success, true)
  assert.equal(captured.length, 1)
  const request = captured[0]
  assert.equal(request.url, 'https://relay.example/proxy/sync-codes/redeem')
  assert.equal(request.init.method, 'POST')
  const body = new Uint8Array(request.init.body as ArrayBuffer)
  assert.equal(Buffer.from(body).toString('utf-8'), '{"code":"123456"}')

  const headers = new Headers(request.init.headers)
  assert.equal(headers.get('Authorization'), 'Bearer session-token')
  assert.equal(headers.get('Content-Type'), 'application/json')
  assert.ok(headers.get('X-Request-ID'))
  const timestamp = headers.get('X-Timestamp')
  const nonce = headers.get('X-Nonce')
  const signature = headers.get('X-Signature')
  assert.ok(timestamp)
  assert.ok(nonce)
  assert.ok(signature)
  decodeBase64Url(nonce, 24)

  const canonical = ['POST', '/proxy/sync-codes/redeem', timestamp, nonce, sha256Hex(body)].join(
    '\n'
  )
  assert.equal(
    verify(decodeBase64Url(signature, 64), utf8ToBytes(canonical), getPublicKey(deviceSeed)),
    true
  )
})

test('二进制上传发送原始字节并保留服务端冲突附加字段', async () => {
  let captured: CapturedRequest | null = null
  const fetchImpl: FetchImpl = async (url, init = {}) => {
    captured = { url, init }
    return Response.json(
      {
        error: {
          code: 'stale_manifest',
          message: 'manifest version changed',
          currentVersion: 7,
          requestId: 'request-1'
        }
      },
      { status: 409 }
    )
  }
  const client = new RelayClient('https://relay.example', fetchImpl)
  client.setAuthContext({
    deviceSeed: new Uint8Array(32).fill(9),
    sessionToken: 'token',
    serverTimeOffsetMs: 0
  })
  const ciphertext = Uint8Array.of(0, 1, 2, 255)

  const result = await client.putSelfManifest(3, ciphertext)

  assert.equal(result.success, false)
  assert.equal(result.code, 'stale_manifest')
  assert.deepEqual(result.extra, { currentVersion: 7, requestId: 'request-1' })
  const request = captured as CapturedRequest | null
  assert.ok(request)
  assert.deepEqual(new Uint8Array(request.init.body as ArrayBuffer), ciphertext)
  assert.equal(new Headers(request.init.headers).get('Content-Type'), 'application/octet-stream')
})

test('二进制下载返回字节并严格解析会话版本头', async () => {
  const fetchImpl: FetchImpl = async () =>
    new Response(Uint8Array.of(4, 5, 6), {
      status: 200,
      headers: { 'X-Session-File-Version': '2' }
    })
  const client = new RelayClient('http://127.0.0.1:8080', fetchImpl)
  client.setAuthContext({
    deviceSeed: new Uint8Array(32).fill(1),
    sessionToken: 'token',
    serverTimeOffsetMs: 0
  })

  const result = await client.getSessionFile('session-1-a')

  assert.equal(result.success, true)
  assert.deepEqual(result.data?.bytes, Uint8Array.of(4, 5, 6))
  assert.equal(result.data?.version, 2)
})

test('网络异常和非法 Relay 地址均被明确归类', async () => {
  const client = new RelayClient('https://relay.example', async () => {
    throw new Error('offline')
  })
  const result = await client.discover()
  assert.deepEqual(result, { success: false, code: 'network_error', error: 'offline' })

  assert.throws(() => new RelayClient('file:///tmp/relay'), /仅支持 HTTP 或 HTTPS/)
  assert.throws(() => new RelayClient('https://user:pass@relay.example'), /不能包含凭证/)
  assert.throws(() => new RelayClient('https://relay.example?x=1'), /不能包含凭证/)
})

test('RelayClient 的 Scope A REST 方法全部映射到无 query 的协议路径', async () => {
  const requests: CapturedRequest[] = []
  const fetchImpl: FetchImpl = async (url, init = {}) => {
    requests.push({ url, init })
    const pathname = new URL(url).pathname
    if (
      pathname.startsWith('/manifests/device-1/') ||
      pathname.startsWith('/blocks/') ||
      (pathname.startsWith('/session-files/session-1-a') && init.method === 'GET')
    ) {
      return new Response(Uint8Array.of(1), {
        status: 200,
        headers: { ETag: 'etag', 'X-Session-File-Version': '1' }
      })
    }
    return Response.json({})
  }
  const client = new RelayClient('https://relay.example', fetchImpl)
  client.setAuthContext({
    deviceSeed: new Uint8Array(32).fill(2),
    sessionToken: 'token',
    serverTimeOffsetMs: 0
  })

  await client.discover()
  await client.connectionsStart('alice')
  await client.connectionsComplete({ attemptId: 'attempt' })
  await client.sessionChallenge('device-1')
  await client.sessions('attempt', 'signature')
  await client.getBootstrap()
  await client.generateSyncCode()
  await client.redeemSyncCode('123456')
  await client.listDevices()
  await client.revokeDevice('device-1')
  await client.discardOtherGroups(1, 'proof')
  await client.createEventTicket()
  await client.listManifests()
  await client.getManifest('device-1', 1)
  await client.putSelfManifest(0, Uint8Array.of(1))
  await client.blocksMissing(['a'.repeat(64)])
  await client.putBlock('a'.repeat(64), Uint8Array.of(1))
  await client.getBlock('a'.repeat(64))
  await client.listSessionFiles()
  await client.getSessionFile('session-1-a')
  await client.putSessionFile('session-1-a', 0, Uint8Array.of(1))
  await client.deleteSessionFile('session-1-a', 1)

  assert.deepEqual(
    requests.map((request) => `${request.init.method} ${new URL(request.url).pathname}`),
    [
      'GET /.well-known/lumina-relay',
      'POST /connections/start',
      'POST /connections/complete',
      'POST /session-challenges',
      'POST /sessions',
      'GET /bootstrap',
      'POST /sync-codes',
      'POST /sync-codes/redeem',
      'GET /devices',
      'DELETE /devices/device-1',
      'POST /sync-groups/discard-others',
      'POST /event-tickets',
      'GET /manifests',
      'GET /manifests/device-1/1',
      'PUT /manifests/self/0',
      'POST /blocks/missing',
      `PUT /blocks/${'a'.repeat(64)}`,
      `GET /blocks/${'a'.repeat(64)}`,
      'GET /session-files',
      'GET /session-files/session-1-a',
      'PUT /session-files/session-1-a/0',
      'DELETE /session-files/session-1-a/1'
    ]
  )
  assert.equal(
    requests.every((request) => !new URL(request.url).search),
    true
  )

  const first = new Headers(requests[5].init.headers).get('X-Nonce')
  await client.getBootstrap()
  const second = new Headers(requests.at(-1)?.init.headers).get('X-Nonce')
  assert.ok(first)
  assert.ok(second)
  assert.notEqual(first, second)
  assert.equal(client.getWebSocketUrl(), 'wss://relay.example/events')
})
