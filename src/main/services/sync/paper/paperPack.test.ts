/**
 * paperPack 纯函数测试：manifest 解析/校验、路径安全、流式切块。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import {
  chunkFile,
  isValidPackRelPath,
  PACK_CHUNK_BYTES,
  parsePaperPackManifest,
  resolveContainedPath,
  type PaperPackManifest
} from './paperPack'

function makeManifest(): PaperPackManifest {
  return {
    schemaVersion: 1,
    paperId: 'p1',
    updatedAt: '2026-08-05T00:00:00.000Z',
    files: [
      {
        path: 'source.pdf',
        size: 100,
        sha256: 'a'.repeat(64),
        blockIds: ['b'.repeat(64)]
      },
      {
        path: 'pages/page-0001.jpg',
        size: 50,
        sha256: 'c'.repeat(64),
        blockIds: ['d'.repeat(64)]
      }
    ]
  }
}

test('manifest 构建 → JSON → parse 往返', () => {
  const manifest = makeManifest()
  const parsed = parsePaperPackManifest(JSON.stringify(manifest))
  assert.deepEqual(parsed, manifest)
})

test('非法 manifest 拒绝：schemaVersion/缺字段/坏 hash', () => {
  assert.equal(parsePaperPackManifest('not json'), null)
  assert.equal(parsePaperPackManifest(JSON.stringify({ schemaVersion: 2 })), null)
  const badSha = makeManifest()
  badSha.files[0].sha256 = 'xyz'
  assert.equal(parsePaperPackManifest(JSON.stringify(badSha)), null)
  const emptyBlocks = makeManifest()
  emptyBlocks.files[0].blockIds = []
  assert.equal(parsePaperPackManifest(JSON.stringify(emptyBlocks)), null)
})

test('路径安全：../ 与绝对路径拒绝', () => {
  assert.equal(isValidPackRelPath('source.pdf'), true)
  assert.equal(isValidPackRelPath('pages/page-0001.jpg'), true)
  assert.equal(isValidPackRelPath('../escape.txt'), false)
  assert.equal(isValidPackRelPath('a/../../b'), false)
  assert.equal(isValidPackRelPath('/etc/passwd'), false)
  assert.equal(isValidPackRelPath('C:\\evil'), false)
  assert.equal(isValidPackRelPath(''), false)
})

test('resolveContainedPath：目录内解析/逃逸拒绝/等于 base 拒绝', () => {
  const base = join(tmpdir(), 'paper-pack-test-base')
  assert.ok(resolveContainedPath(base, 'source.pdf')?.startsWith(base))
  assert.equal(resolveContainedPath(base, '../escape'), null)
  assert.equal(resolveContainedPath(base, '/etc/passwd'), null)
  assert.equal(resolveContainedPath(base, '.'), null)
})

test('chunkFile：跨块文件切块正确且 sha256 匹配', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-paper-pack-'))
  try {
    const payload = randomBytes(PACK_CHUNK_BYTES + 10)
    const filePath = join(dir, 'big.bin')
    writeFileSync(filePath, payload)
    const chunks: Uint8Array[] = []
    const result = await chunkFile(filePath, async (chunk) => {
      chunks.push(chunk)
    })
    assert.equal(result.chunks, 2)
    assert.equal(result.size, payload.length)
    assert.equal(chunks[0].length, PACK_CHUNK_BYTES)
    assert.equal(chunks[1].length, 10)
    assert.equal(result.sha256, createHash('sha256').update(payload).digest('hex'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('chunkFile：空文件 0 块', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-paper-pack-'))
  try {
    const filePath = join(dir, 'empty.bin')
    writeFileSync(filePath, '')
    const result = await chunkFile(filePath, async () => {})
    assert.equal(result.chunks, 0)
    assert.equal(result.sha256, createHash('sha256').update('').digest('hex'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
