/**
 * 共享切块工具测试（paper pack / knowledge file 复用同一实现）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { chunkFile, CHUNK_BYTES } from './chunkFile'

test('chunkFile：跨块文件切块正确且 sha256 匹配', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-chunkfile-'))
  try {
    const payload = randomBytes(CHUNK_BYTES + 10)
    const filePath = join(dir, 'big.bin')
    writeFileSync(filePath, payload)
    const chunks: Uint8Array[] = []
    const result = await chunkFile(filePath, async (chunk) => {
      chunks.push(chunk)
    })
    assert.equal(result.chunks, 2)
    assert.equal(result.size, payload.length)
    assert.equal(chunks[0].length, CHUNK_BYTES)
    assert.equal(chunks[1].length, 10)
    assert.equal(result.sha256, createHash('sha256').update(payload).digest('hex'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('chunkFile：空文件 0 块', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-chunkfile-'))
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

test('chunkFile：恰好一块的边界', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-chunkfile-'))
  try {
    const filePath = join(dir, 'exact.bin')
    writeFileSync(filePath, randomBytes(CHUNK_BYTES))
    const result = await chunkFile(filePath, async () => {})
    assert.equal(result.chunks, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('chunkFile：回调 index 从 0 递增', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lumina-chunkfile-'))
  try {
    const filePath = join(dir, 'multi.bin')
    writeFileSync(filePath, randomBytes(CHUNK_BYTES * 3))
    const indices: number[] = []
    await chunkFile(filePath, async (_chunk, index) => {
      indices.push(index)
    })
    assert.deepEqual(indices, [0, 1, 2])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
