/**
 * WriterAssetManifest 解析校验单测（写作资产 manifest 通道化）。
 *
 * 校验契约：schemaVersion===1、fileName 匹配磁盘正则 [a-f0-9]+\.(png|jpg|webp|gif)、
 * size ≤ 20MiB 安全整数、sha256/blockIds 为 hex64、size>0 时 blockIds 非空。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseWriterAssetManifest, type WriterAssetManifest } from '@shared/types/sync'

const DOC_ID = 'writer-0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0'
const HEX64 = 'a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e'
const MAX_ASSET_BYTES = 20 * 1024 * 1024

function validManifest(): WriterAssetManifest {
  return {
    schemaVersion: 1,
    documentId: DOC_ID,
    updatedAt: '2026-08-17T10:00:00.000Z',
    files: [{ fileName: `${HEX64}.png`, size: 1024, sha256: HEX64, blockIds: [HEX64] }]
  }
}

function parseWith(patch: (m: Record<string, unknown>) => void): WriterAssetManifest | null {
  const raw = validManifest() as unknown as Record<string, unknown>
  patch(raw)
  return parseWriterAssetManifest(JSON.stringify(raw))
}

test('合法 manifest 解析一致', () => {
  const m = validManifest()
  assert.deepEqual(parseWriterAssetManifest(JSON.stringify(m)), m)
})

test('空 files（无资产文档）合法', () => {
  const m = validManifest()
  m.files = []
  assert.deepEqual(parseWriterAssetManifest(JSON.stringify(m)), m)
})

test('size 为 0 且 blockIds 为空合法', () => {
  const m = validManifest()
  m.files = [{ fileName: `${HEX64}.gif`, size: 0, sha256: HEX64, blockIds: [] }]
  assert.deepEqual(parseWriterAssetManifest(JSON.stringify(m)), m)
})

test('size 恰为 20MiB 上限合法', () => {
  const m = validManifest()
  m.files = [{ fileName: `${HEX64}.jpg`, size: MAX_ASSET_BYTES, sha256: HEX64, blockIds: [HEX64] }]
  assert.deepEqual(parseWriterAssetManifest(JSON.stringify(m)), m)
})

test('非法 JSON / 非对象返回 null', () => {
  assert.equal(parseWriterAssetManifest('not-json'), null)
  assert.equal(parseWriterAssetManifest('[]'), null)
  assert.equal(parseWriterAssetManifest('null'), null)
  assert.equal(parseWriterAssetManifest('"str"'), null)
})

test('schemaVersion 非 1 返回 null', () => {
  for (const bad of [2, 0, '1', null, undefined]) {
    assert.equal(
      parseWith((m) => (m.schemaVersion = bad as unknown as 1)),
      null
    )
  }
  assert.equal(
    parseWith((m) => delete m.schemaVersion),
    null
  )
})

test('documentId 缺失/空/非字符串返回 null', () => {
  assert.equal(
    parseWith((m) => delete m.documentId),
    null
  )
  assert.equal(
    parseWith((m) => (m.documentId = '')),
    null
  )
  assert.equal(
    parseWith((m) => (m.documentId = 123 as unknown as string)),
    null
  )
})

test('updatedAt 非 string 返回 null', () => {
  assert.equal(
    parseWith((m) => (m.updatedAt = 1755424800000 as unknown as string)),
    null
  )
  assert.equal(
    parseWith((m) => delete m.updatedAt),
    null
  )
})

test('files 非数组返回 null', () => {
  assert.equal(
    parseWith((m) => (m.files = {} as unknown as WriterAssetManifest['files'])),
    null
  )
  assert.equal(
    parseWith((m) => delete m.files),
    null
  )
})

test('fileName 不匹配磁盘正则返回 null', () => {
  const badNames = [
    'ABCDEF12.png', // 大写 hash 非法
    `${HEX64}.txt`, // 扩展名白名单外
    `${HEX64}.PNG`, // 大写扩展名非法
    `${HEX64}.png.jpg`, // 双扩展名非法
    HEX64, // 缺扩展名
    `../${HEX64}.png`, // 路径注入
    `${HEX64}_png`, // 分隔符非法
    '' // 空
  ]
  for (const fileName of badNames) {
    assert.equal(
      parseWith((m) => {
        ;(m.files as { fileName: string }[])[0].fileName = fileName
      }),
      null,
      `应拒绝 fileName: ${fileName}`
    )
  }
})

test('size 非安全整数/负数/超 20MiB 返回 null', () => {
  for (const bad of [1.5, -1, '1024', MAX_ASSET_BYTES + 1, Number.MAX_SAFE_INTEGER * 2]) {
    assert.equal(
      parseWith((m) => {
        ;(m.files as { size: number }[])[0].size = bad as unknown as number
      }),
      null,
      `应拒绝 size: ${String(bad)}`
    )
  }
})

test('sha256 非 hex64 返回 null', () => {
  for (const bad of [HEX64.slice(1), `${HEX64}a`, HEX64.toUpperCase(), 'not-hex']) {
    assert.equal(
      parseWith((m) => {
        ;(m.files as { sha256: string }[])[0].sha256 = bad
      }),
      null,
      `应拒绝 sha256: ${bad}`
    )
  }
})

test('blockIds 非数组或成员非 hex64 返回 null', () => {
  assert.equal(
    parseWith((m) => {
      ;(m.files as { blockIds: unknown }[])[0].blockIds = HEX64
    }),
    null
  )
  assert.equal(
    parseWith((m) => {
      ;(m.files as { blockIds: unknown }[])[0].blockIds = [HEX64, 'zz' + HEX64.slice(2)]
    }),
    null
  )
  assert.equal(
    parseWith((m) => {
      ;(m.files as { blockIds: unknown }[])[0].blockIds = [HEX64, 42]
    }),
    null
  )
})

test('size>0 且 blockIds 为空返回 null', () => {
  assert.equal(
    parseWith((m) => {
      ;(m.files as { blockIds: unknown }[])[0].blockIds = []
    }),
    null
  )
})

test('entry 非对象/缺字段返回 null', () => {
  assert.equal(
    parseWith((m) => {
      m.files = ['x'] as unknown as WriterAssetManifest['files']
    }),
    null
  )
  assert.equal(
    parseWith((m) => {
      m.files = [{ size: 1 }] as unknown as WriterAssetManifest['files']
    }),
    null
  )
})
