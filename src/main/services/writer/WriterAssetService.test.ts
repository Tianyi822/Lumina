import test from 'node:test'
import assert from 'node:assert/strict'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WriterAssetService } from './WriterAssetService'

function createService(t: test.TestContext): { rootPath: string; service: WriterAssetService } {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-writer-assets-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))
  return { rootPath, service: new WriterAssetService({ rootPath }) }
}

test('PNG 按哈希去重且 SVG 被拒绝', async (t) => {
  const { service } = createService(t)
  const documentId = 'writer-12345678'
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])

  const first = await service.importBytes(documentId, {
    fileName: 'figure.png',
    declaredMimeType: 'image/png',
    bytes: png
  })
  const second = await service.importBytes(documentId, {
    fileName: 'copy.png',
    declaredMimeType: 'image/png',
    bytes: png
  })
  const svg = await service.importBytes(documentId, {
    fileName: 'unsafe.svg',
    declaredMimeType: 'image/svg+xml',
    bytes: Buffer.from('<svg><script>alert(1)</script></svg>')
  })

  assert.equal(first.success, true)
  assert.equal(first.data?.relativePath, second.data?.relativePath)
  assert.equal(first.data?.mimeType, 'image/png')
  assert.match(
    first.data?.url ?? '',
    /^lumina:\/\/writing\/writer-12345678\/assets\/[a-f0-9]{64}\.png$/
  )
  assert.equal(svg.success, false)
  assert.equal(svg.code, 'invalid_input')
})

test('导入拒绝扩展名、声明 MIME 与图像签名不一致的内容', async (t) => {
  const { service } = createService(t)
  const documentId = 'writer-12345678'
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

  const misleadingExtension = await service.importBytes(documentId, {
    fileName: 'figure.png.exe',
    declaredMimeType: 'image/jpeg',
    bytes: jpeg
  })
  const misleadingMime = await service.importBytes(documentId, {
    fileName: 'figure.jpg',
    declaredMimeType: 'image/png',
    bytes: jpeg
  })
  const executable = await service.importBytes(documentId, {
    fileName: 'figure.png',
    declaredMimeType: 'image/png',
    bytes: Buffer.from([0x4d, 0x5a, 0x90, 0x00])
  })

  assert.equal(misleadingExtension.code, 'invalid_input')
  assert.equal(misleadingMime.code, 'invalid_input')
  assert.equal(executable.code, 'invalid_input')
})

test('导入拒绝超过 20MB 的图像', async (t) => {
  const { service } = createService(t)
  const oversizedPng = Buffer.alloc(20 * 1024 * 1024 + 1)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversizedPng)

  const result = await service.importBytes('writer-12345678', {
    fileName: 'large.png',
    declaredMimeType: 'image/png',
    bytes: oversizedPng
  })

  assert.equal(result.success, false)
  assert.equal(result.code, 'invalid_input')
})

test('并发导入同一哈希的图片不会读取未完成文件', async (t) => {
  const { service } = createService(t)
  const png = Buffer.alloc(20 * 1024 * 1024)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png)

  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      service.importBytes('writer-12345678', {
        fileName: `figure-${index}.png`,
        declaredMimeType: 'image/png',
        bytes: png
      })
    )
  )

  assert.equal(
    results.every((result) => result.success),
    true
  )
  assert.equal(new Set(results.map((result) => result.data?.relativePath)).size, 1)
})

test('垃圾回收仅删除当前文档 assets 顶层未引用的普通图像文件', async (t) => {
  const { rootPath, service } = createService(t)
  const documentId = 'writer-12345678'
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const kept = (
    await service.importBytes(documentId, {
      fileName: 'keep.png',
      declaredMimeType: 'image/png',
      bytes: png
    })
  ).data!
  const assetsPath = join(rootPath, 'documents', documentId, 'assets')
  const unusedPath = join(assetsPath, 'unused.png')
  const nestedPath = join(assetsPath, 'nested')
  const temporaryPath = join(assetsPath, 'upload.tmp')
  const outsidePath = join(rootPath, 'outside.png')
  writeFileSync(unusedPath, png)
  mkdirSync(nestedPath)
  writeFileSync(join(nestedPath, 'nested.png'), png)
  writeFileSync(temporaryPath, png)
  writeFileSync(outsidePath, png)
  symlinkSync(outsidePath, join(assetsPath, 'escape.png'))

  const result = await service.collectGarbage(documentId, [
    kept.relativePath,
    '../outside.png',
    'assets/../document.json'
  ])

  assert.equal(result.data, 1)
  assert.equal(existsSync(unusedPath), false)
  assert.equal(existsSync(join(assetsPath, kept.relativePath.replace('assets/', ''))), true)
  assert.equal(existsSync(join(nestedPath, 'nested.png')), true)
  assert.equal(existsSync(temporaryPath), true)
  assert.equal(lstatSync(join(assetsPath, 'escape.png')).isSymbolicLink(), true)
  assert.equal(existsSync(outsidePath), true)
})
