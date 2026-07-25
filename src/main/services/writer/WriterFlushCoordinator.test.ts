import test from 'node:test'
import assert from 'node:assert/strict'
import { WriterFlushCoordinator } from './WriterFlushCoordinator'
import { WriterService } from './WriterService'
import type { WriterStoragePort } from './WriterService'
import type { SaveWriterDocumentRequest, WriterDocument } from '@shared/types/writer'

test('Renderer flush 收到确认后结束等待', async () => {
  const sent: string[] = []
  const coordinator = new WriterFlushCoordinator({
    send: (_webContentsId, channel) => {
      sent.push(channel)
      return true
    },
    timeoutMs: 1_500
  })
  const pending = coordinator.requestFlush([42])
  coordinator.acknowledge(42)
  await pending
  assert.deepEqual(sent, ['writer:flush-request'])
})

test('并发 flush 复用同一轮请求且重复确认安全', async () => {
  const sent: number[] = []
  const coordinator = new WriterFlushCoordinator({
    send: (webContentsId) => {
      sent.push(webContentsId)
      return true
    },
    timeoutMs: 1_500
  })

  const first = coordinator.requestFlush([42])
  const second = coordinator.requestFlush([42])
  coordinator.acknowledge(42)
  coordinator.acknowledge(42)
  await Promise.all([first, second])

  assert.deepEqual(sent, [42])
})

test('无窗口时立即结束且不发送请求', async () => {
  const sent: number[] = []
  const coordinator = new WriterFlushCoordinator({
    send: (webContentsId) => {
      sent.push(webContentsId)
      return true
    },
    timeoutMs: 1_500
  })

  await coordinator.requestFlush([])

  assert.deepEqual(sent, [])
})

test('窗口已销毁或超时都结束等待并记录警告', async () => {
  const warnings: Array<{ webContentsId: number; reason: string }> = []
  const coordinator = new WriterFlushCoordinator({
    send: (webContentsId) => webContentsId !== 1,
    warn: (webContentsId, reason) => warnings.push({ webContentsId, reason }),
    timeoutMs: 10
  })

  await coordinator.requestFlush([1, 2])

  assert.deepEqual(warnings, [
    { webContentsId: 1, reason: 'destroyed' },
    { webContentsId: 2, reason: 'timeout' }
  ])
})

test('保存请求串行执行且 flushPendingSaves 等待当前队列', async () => {
  let revision = 0
  let releaseFirstSave: (() => void) | undefined
  const firstSaveGate = new Promise<void>((resolve) => {
    releaseFirstSave = resolve
  })
  const saveCalls: number[] = []
  const initialDocument: WriterDocument = {
    schemaVersion: 1,
    id: 'writer-12345678',
    revision: 0,
    title: '初稿',
    content: { type: 'doc', content: [] },
    favorite: false,
    createdAt: '2026-07-25T00:00:00.000Z',
    updatedAt: '2026-07-25T00:00:00.000Z'
  }
  const storageService: WriterStoragePort = {
    initialize: async () => ({
      success: true,
      data: { schemaVersion: 1, folders: [], documents: [], recentDocumentIds: [] }
    }),
    createDocument: async () => ({ success: true, data: initialDocument }),
    listDocuments: async () => ({
      success: true,
      data: { schemaVersion: 1, folders: [], documents: [], recentDocumentIds: [] }
    }),
    getDocument: async () => ({ success: true, data: { ...initialDocument, revision } }),
    saveDocument: async (request: SaveWriterDocumentRequest) => {
      saveCalls.push(request.expectedRevision)
      if (saveCalls.length === 1) {
        await firstSaveGate
      }
      if (request.expectedRevision !== revision) {
        return {
          success: false,
          code: 'revision_conflict' as const,
          error: '文档已被其他保存更新'
        }
      }
      revision += 1
      return {
        success: true,
        data: { ...initialDocument, revision, title: request.title, content: request.content }
      }
    },
    deleteDocument: async () => ({ success: true }),
    createFolder: async () => ({
      success: false,
      code: 'io_error',
      error: '测试未使用'
    }),
    renameFolder: async () => ({
      success: false,
      code: 'io_error',
      error: '测试未使用'
    }),
    deleteFolder: async () => ({ success: true }),
    moveDocument: async () => ({ success: true, data: initialDocument }),
    setFavorite: async () => ({ success: true, data: initialDocument })
  }
  const coordinator = new WriterFlushCoordinator({
    send: () => true,
    timeoutMs: 1_500
  })
  const service = new WriterService({
    storageService,
    assetService: {
      importBytes: async () => ({ success: false, code: 'io_error', error: '测试未使用' })
    },
    flushCoordinator: coordinator,
    getWebContentsIds: () => []
  })
  const request: SaveWriterDocumentRequest = {
    documentId: initialDocument.id,
    expectedRevision: 0,
    title: '第一版',
    content: initialDocument.content
  }

  const first = service.saveDocument(request)
  const second = service.saveDocument({ ...request, title: '旧请求' })
  await Promise.resolve()
  assert.deepEqual(saveCalls, [0])

  let flushed = false
  const pendingFlush = service.flushPendingSaves().then(() => {
    flushed = true
  })
  await Promise.resolve()
  assert.equal(flushed, false)

  releaseFirstSave?.()
  const [firstResult, secondResult] = await Promise.all([first, second])
  await pendingFlush

  assert.equal(firstResult.data?.revision, 1)
  assert.equal(secondResult.code, 'revision_conflict')
  assert.deepEqual(saveCalls, [0, 0])
  assert.equal(flushed, true)
})
