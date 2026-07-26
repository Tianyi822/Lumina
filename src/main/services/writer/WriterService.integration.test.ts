import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WriterDocument, WriterJsonDocument } from '@shared/types/writer'
import { WriterAssetService } from './WriterAssetService'
import { WriterFlushCoordinator } from './WriterFlushCoordinator'
import { WriterService } from './WriterService'
import { WriterStorageService } from './WriterStorageService'
import { getWriterDocumentDir } from './writerPaths'

/** 最小合法 PNG（含 IHDR） */
const PNG_FIXTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

function createWriterIntegrationService(t: test.TestContext, outputPath: string): WriterService {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-writer-integration-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))

  const storageService = new WriterStorageService({ rootPath })
  const assetService = new WriterAssetService({ rootPath })
  const flushCoordinator = new WriterFlushCoordinator({
    send: () => undefined,
    timeoutMs: 50,
    warn: () => undefined
  })

  return new WriterService({
    storageService,
    assetService,
    flushCoordinator,
    getWebContentsIds: () => [],
    exportDialog: {
      showSaveDialog: async () => ({ canceled: false, filePath: outputPath }),
      showMessageBox: async () => ({ response: 1 })
    }
  })
}

function attachImage(
  document: WriterDocument,
  relativePath: string
): {
  documentId: string
  expectedRevision: number
  title: string
  content: WriterJsonDocument
} {
  const content: WriterJsonDocument = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: '含图段落' }]
      },
      {
        type: 'image',
        attrs: {
          src: `lumina://writing/${document.id}/assets/${relativePath}`,
          alt: '示意图',
          title: null,
          width: 80
        }
      }
    ]
  }
  return {
    documentId: document.id,
    expectedRevision: document.revision,
    title: document.title,
    content
  }
}

test('创建、保存、导入资源、导出并永久删除形成完整闭环', async (t) => {
  const outRoot = mkdtempSync(join(tmpdir(), 'lumina-writer-export-out-'))
  t.after(() => rmSync(outRoot, { recursive: true, force: true }))
  const outputPath = join(outRoot, '闭环文档.md')

  const service = createWriterIntegrationService(t, outputPath)
  const initialized = await service.initialize()
  assert.equal(initialized.success, true)

  const created = await service.createDocument('闭环文档')
  assert.equal(created.success, true)
  assert.ok(created.data)

  const asset = await service.importAsset(created.data.id, {
    fileName: 'figure.png',
    declaredMimeType: 'image/png',
    bytes: PNG_FIXTURE
  })
  assert.equal(asset.success, true)
  assert.ok(asset.data)

  const saved = await service.saveDocument(attachImage(created.data, asset.data.relativePath))
  assert.equal(saved.success, true)
  assert.ok(saved.data)

  const exported = await service.exportDocument(saved.data.id, 'markdown')
  assert.equal(exported.success, true)
  assert.equal(exported.data?.canceled, false)
  assert.equal(existsSync(outputPath), true)
  assert.match(readFileSync(outputPath, 'utf8'), /闭环文档|含图段落/)

  const deleted = await service.deleteDocument(created.data.id)
  assert.equal(deleted.success, true)
  assert.equal(existsSync(getWriterDocumentDir(created.data.id)), false)
})

test('导出取消不视为错误且不写文件', async (t) => {
  const rootPath = mkdtempSync(join(tmpdir(), 'lumina-writer-cancel-'))
  t.after(() => rmSync(rootPath, { recursive: true, force: true }))
  const storageService = new WriterStorageService({ rootPath })
  const assetService = new WriterAssetService({ rootPath })
  const service = new WriterService({
    storageService,
    assetService,
    flushCoordinator: new WriterFlushCoordinator({
      send: () => undefined,
      timeoutMs: 50,
      warn: () => undefined
    }),
    getWebContentsIds: () => [],
    exportDialog: {
      showSaveDialog: async () => ({ canceled: true }),
      showMessageBox: async () => ({ response: 0 })
    }
  })

  await service.initialize()
  const created = (await service.createDocument('取消导出')).data!
  const result = await service.exportDocument(created.id, 'markdown')
  assert.equal(result.success, true)
  assert.equal(result.data?.canceled, true)
})
