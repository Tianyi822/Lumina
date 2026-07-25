import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveLuminaResource } from './luminaProtocolResolver'

function createRoots(t: test.TestContext) {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-protocol-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))
  return {
    papersRoot: join(rootPath, 'papers'),
    writingRoot: join(rootPath, 'writing')
  }
}

test('writing 资源限制在对应 assets 目录', (t) => {
  const roots = createRoots(t)
  const ok = resolveLuminaResource('lumina://writing/writer-12345678/assets/image.png', roots)
  const traversal = resolveLuminaResource(
    'lumina://writing/writer-12345678/assets/%2e%2e/document.json',
    roots
  )

  assert.equal(ok.success, true)
  assert.equal(traversal.success, false)
})

test('writing 协议拒绝无效 ID、非图像 MIME、双重编码与路径逃逸', (t) => {
  const roots = createRoots(t)
  const invalidId = resolveLuminaResource('lumina://writing/not-a-writer/assets/image.png', roots)
  const html = resolveLuminaResource('lumina://writing/writer-12345678/assets/page.html', roots)
  const doubleEncoded = resolveLuminaResource(
    'lumina://writing/writer-12345678/assets/%252e%252e%252fdocument.json',
    roots
  )
  const escaped = resolveLuminaResource(
    'lumina://writing/writer-12345678/assets/../../other/assets/image.png',
    roots
  )

  assert.equal(invalidId.success, false)
  assert.equal(html.success, false)
  assert.equal(doubleEncoded.success, false)
  assert.equal(escaped.success, false)
})

test('writing 协议对 URL 编码文件名返回白名单 MIME 与缓存头', (t) => {
  const roots = createRoots(t)
  const result = resolveLuminaResource(
    'lumina://writing/writer-12345678/assets/figure%20one.webp',
    roots
  )

  assert.deepEqual(result, {
    success: true,
    path: join(roots.writingRoot, 'documents', 'writer-12345678', 'assets', 'figure one.webp'),
    mimeType: 'image/webp',
    cacheControl: 'private, max-age=31536000, immutable'
  })
})

test('paper 路由保持页面与资源路径的既有映射', (t) => {
  const roots = createRoots(t)
  const page = resolveLuminaResource('lumina://paper/paper-123/pages/page-0001.jpg', roots)
  const asset = resolveLuminaResource(
    'lumina://paper/paper-123/assets/page-0001/crop-0001.png',
    roots
  )

  assert.equal(page.success, true)
  assert.equal(asset.success, true)
  if (page.success && asset.success) {
    assert.equal(page.path, join(roots.papersRoot, 'paper-123', 'pages', 'page-0001.jpg'))
    assert.equal(
      asset.path,
      join(roots.papersRoot, 'paper-123', 'assets', 'page-0001', 'crop-0001.png')
    )
  }
})

test('paper 路由保持原始 PDF 的既有映射', (t) => {
  const roots = createRoots(t)
  const result = resolveLuminaResource('lumina://paper/paper-123/source.pdf', roots)

  assert.deepEqual(result, {
    success: true,
    path: join(roots.papersRoot, 'paper-123', 'source.pdf'),
    mimeType: 'application/pdf',
    cacheControl: 'private, max-age=31536000, immutable'
  })
})

test('paper 路由保留未知扩展名并降级为安全 MIME', (t) => {
  const roots = createRoots(t)
  const result = resolveLuminaResource('lumina://paper/paper-123/assets/vector.svg', roots)

  assert.deepEqual(result, {
    success: true,
    path: join(roots.papersRoot, 'paper-123', 'assets', 'vector.svg'),
    mimeType: 'application/octet-stream',
    cacheControl: 'private, max-age=31536000, immutable'
  })
})

test('writing 协议拒绝通过符号链接逃逸 assets 根目录的文件', async (t) => {
  const roots = createRoots(t)
  const documentId = 'writer-12345678'
  const assetsPath = join(roots.writingRoot, 'documents', documentId, 'assets')
  const outsidePath = join(roots.writingRoot, 'outside.png')
  mkdirSync(assetsPath, { recursive: true })
  writeFileSync(outsidePath, 'not an image')
  symlinkSync(outsidePath, join(assetsPath, 'escape.png'))

  const { resolveLuminaResourceFile } = await import('./luminaProtocolResolver')
  const result = await resolveLuminaResourceFile(
    `lumina://writing/${documentId}/assets/escape.png`,
    roots
  )

  assert.equal(result.success, false)
})
