import assert from 'node:assert/strict'
import test from 'node:test'

import { decodeBase64Url, encodeBase64Url, utf8ToBytes } from './base64url'
import { generateDek, openDek, sealDek } from './envelope'
import { sha256Hex } from './hash'
import {
  deriveAccountAuthSeed,
  deriveEnvelopeKey,
  deriveLoginSeed,
  derivePasswordRoot
} from './kdf'
import { generateSeed, getPublicKey, sign, verify } from './keys'
import {
  buildAccountCreateTranscript,
  buildDekEnvelopeAad,
  buildDiscardGroupsTranscript,
  buildLoginTranscript,
  buildSessionTranscript,
  buildTranscript
} from './transcript'

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex')

test('base64url 只接受无 padding 的规范编码', () => {
  const bytes = Uint8Array.of(0xfb, 0xff, 0x00)
  const encoded = encodeBase64Url(bytes)
  assert.equal(encoded, '-_8A')
  assert.deepEqual(decodeBase64Url(encoded, 3), bytes)
  assert.throws(() => decodeBase64Url(`${encoded}=`), /格式非法/)
  assert.throws(() => decodeBase64Url('+/8A'), /格式非法/)
  assert.throws(() => decodeBase64Url(encoded, 4), /长度非法/)
})

test('Transcript 与 Go 服务端固定向量逐字节一致', async (t) => {
  const vectors: Array<{ name: string; want: string; actual: Uint8Array }> = [
    {
      name: 'generic',
      want: '646f6d61696e0000000141000000020001',
      actual: buildTranscript('domain', [utf8ToBytes('A'), Uint8Array.of(0, 1)])
    },
    {
      name: 'account-create',
      want: '6c756d696e612d6163636f756e742d6372656174650000000169000000016100000002010200000005616c6963650000000461636374000000010300000001040000000105000000010600000003646576000000064c6170746f700000000107',
      actual: buildAccountCreateTranscript({
        instanceId: 'i',
        attemptId: 'a',
        challenge: Uint8Array.of(1, 2),
        normalizedUsername: 'alice',
        accountId: 'acct',
        authSalt: Uint8Array.of(3),
        loginPublicKey: Uint8Array.of(4),
        accountAuthPublicKey: Uint8Array.of(5),
        dekEnvelopeHash: Uint8Array.of(6),
        deviceId: 'dev',
        deviceName: 'Laptop',
        devicePublicKey: Uint8Array.of(7)
      })
    },
    {
      name: 'login-proof',
      want: '6c756d696e612d6c6f67696e2d70726f6f660000000169000000016100000005616c69636500000002010200000003646576000000064c6170746f700000000107',
      actual: buildLoginTranscript({
        instanceId: 'i',
        attemptId: 'a',
        normalizedUsername: 'alice',
        challenge: Uint8Array.of(1, 2),
        deviceId: 'dev',
        deviceName: 'Laptop',
        devicePublicKey: Uint8Array.of(7)
      })
    },
    {
      name: 'device-session',
      want: '6c756d696e612d6465766963652d73657373696f6e0000000169000000016100000002010200000003646576',
      actual: buildSessionTranscript({
        instanceId: 'i',
        attemptId: 'a',
        challenge: Uint8Array.of(1, 2),
        deviceId: 'dev'
      })
    },
    {
      name: 'discard-sync-groups',
      want: '6c756d696e612d646973636172642d73796e632d67726f75707300000001690000000461636374000000036465760000000567726f757000000008000000000000002a',
      actual: buildDiscardGroupsTranscript({
        instanceId: 'i',
        accountId: 'acct',
        deviceId: 'dev',
        groupId: 'group',
        groupRevision: 42
      })
    },
    {
      name: 'dek-envelope-aad',
      want: '6c756d696e612d64656b2d656e76656c6f7065000000016900000005616c6963650000000461636374000000020102',
      actual: buildDekEnvelopeAad({
        instanceId: 'i',
        normalizedUsername: 'alice',
        accountId: 'acct',
        authSalt: Uint8Array.of(1, 2)
      })
    }
  ]

  for (const vector of vectors) {
    await t.test(vector.name, () => assert.equal(hex(vector.actual), vector.want))
  }
})

test('固定 Argon2id 参数与 HKDF 域分离保持稳定', async () => {
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index)
  const root = await derivePasswordRoot('correct horse battery staple', salt)
  assert.equal(hex(root), '0d1a3c6523c8f06e4e0af9c515aa5b5448cfebd6838f2d52c3d8b6ef8ddc3c2e')

  const loginSeed = deriveLoginSeed(root)
  const envelopeKey = deriveEnvelopeKey(root)
  assert.equal(loginSeed.length, 32)
  assert.equal(envelopeKey.length, 32)
  assert.notDeepEqual(loginSeed, envelopeKey)
  assert.notDeepEqual(deriveAccountAuthSeed(root), loginSeed)
})

test('DEK 信封往返成功且错误 AAD 无法解密', () => {
  const key = new Uint8Array(32).fill(7)
  const dek = generateDek()
  const aad = utf8ToBytes('account-aad')
  const envelope = sealDek(key, dek, aad)

  assert.equal(envelope.length, 72)
  assert.deepEqual(openDek(key, envelope, aad), dek)
  assert.throws(() => openDek(key, envelope, utf8ToBytes('other-aad')))
})

test('Ed25519 签名可验证且篡改后失败', () => {
  const seed = generateSeed()
  const publicKey = getPublicKey(seed)
  const message = utf8ToBytes('lumina sync')
  const signature = sign(message, seed)

  assert.equal(publicKey.length, 32)
  assert.equal(signature.length, 64)
  assert.equal(verify(signature, message, publicKey), true)
  assert.equal(verify(signature, utf8ToBytes('tampered'), publicKey), false)
})

test('SHA-256 与 Node 标准向量一致', () => {
  assert.equal(
    sha256Hex(utf8ToBytes('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  )
})
