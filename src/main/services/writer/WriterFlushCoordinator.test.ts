import test from 'node:test'
import assert from 'node:assert/strict'
import {
  acknowledgeWriterFlushFromEvent,
  handleWriterWindowClose,
  sendWriterFlushRequestToWindow,
  WriterFlushCoordinator
} from './WriterFlushCoordinator'
import { WriterService } from './WriterService'
import type { WriterStoragePort } from './WriterService'
import type { SaveWriterDocumentRequest, WriterDocument } from '@shared/types/writer'

const writerDocument: WriterDocument = {
  schemaVersion: 1,
  id: 'writer-12345678',
  revision: 0,
  title: '初稿',
  content: { type: 'doc', content: [] },
  favorite: false,
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z'
}

function createStoragePort(overrides: Partial<WriterStoragePort> = {}): WriterStoragePort {
  return {
    initialize: async () => ({
      success: true,
      data: { schemaVersion: 1, folders: [], documents: [], recentDocumentIds: [] }
    }),
    createDocument: async () => ({ success: true, data: writerDocument }),
    listDocuments: async () => ({
      success: true,
      data: { schemaVersion: 1, folders: [], documents: [], recentDocumentIds: [] }
    }),
    getDocument: async () => ({ success: true, data: writerDocument }),
    saveDocument: async () => ({ success: true, data: writerDocument }),
    deleteDocument: async () => ({ success: true }),
    createFolder: async () => ({ success: false, code: 'io_error', error: '测试未使用' }),
    renameFolder: async () => ({ success: false, code: 'io_error', error: '测试未使用' }),
    deleteFolder: async () => ({ success: true }),
    moveDocument: async () => ({ success: true, data: writerDocument }),
    setFavorite: async () => ({ success: true, data: writerDocument }),
    ...overrides
  }
}

function createFlushCoordinator(): WriterFlushCoordinator {
  return new WriterFlushCoordinator({
    send: () => true,
    timeoutMs: 1_500
  })
}

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

test('导入图片先确认文档存在且不存在时不创建资源', async () => {
  let imported = false
  const service = new WriterService({
    storageService: createStoragePort({
      getDocument: async () => ({
        success: false,
        code: 'not_found',
        error: '写作文档不存在'
      })
    }),
    assetService: {
      importBytes: async () => {
        imported = true
        return {
          success: true,
          data: {
            assetId: 'asset',
            fileName: 'image.png',
            relativePath: 'assets/image.png',
            mimeType: 'image/png',
            size: 8,
            sha256: 'hash',
            url: 'lumina://writing/writer-12345678/assets/image.png'
          }
        }
      }
    },
    flushCoordinator: createFlushCoordinator(),
    getWebContentsIds: () => []
  })

  const result = await service.importAsset(writerDocument.id, {
    fileName: 'image.png',
    declaredMimeType: 'image/png',
    bytes: new Uint8Array([137, 80, 78, 71])
  })

  assert.equal(result.code, 'not_found')
  assert.equal(imported, false)
})

test('永久删除与图片导入串行且删除后不会重建资源目录', async () => {
  let documentExists = true
  let imported = false
  let releaseDelete: (() => void) | undefined
  const deleteGate = new Promise<void>((resolve) => {
    releaseDelete = resolve
  })
  const service = new WriterService({
    storageService: createStoragePort({
      deleteDocument: async () => {
        await deleteGate
        documentExists = false
        return { success: true }
      },
      getDocument: async () =>
        documentExists
          ? { success: true, data: writerDocument }
          : { success: false, code: 'not_found', error: '写作文档不存在' }
    }),
    assetService: {
      importBytes: async () => {
        imported = true
        return {
          success: true,
          data: {
            assetId: 'asset',
            fileName: 'image.png',
            relativePath: 'assets/image.png',
            mimeType: 'image/png',
            size: 8,
            sha256: 'hash',
            url: 'lumina://writing/writer-12345678/assets/image.png'
          }
        }
      }
    },
    flushCoordinator: createFlushCoordinator(),
    getWebContentsIds: () => []
  })

  const deleting = service.deleteDocument(writerDocument.id)
  const importing = service.importAsset(writerDocument.id, {
    fileName: 'image.png',
    declaredMimeType: 'image/png',
    bytes: new Uint8Array([137, 80, 78, 71])
  })
  await Promise.resolve()
  assert.equal(imported, false)

  releaseDelete?.()
  await deleting
  const importResult = await importing

  assert.equal(importResult.code, 'not_found')
  assert.equal(imported, false)
})

test('flush ACK 只使用 event.sender.id 且重复或伪造确认不会结束其他窗口等待', async () => {
  const coordinator = new WriterFlushCoordinator({
    send: () => true,
    timeoutMs: 1_500
  })
  let completed = false
  const pending = coordinator.requestFlush([42, 43]).then(() => {
    completed = true
  })
  const acknowledge = (webContentsId: number): void => coordinator.acknowledge(webContentsId)

  assert.deepEqual(acknowledgeWriterFlushFromEvent({ sender: { id: 99 } }, acknowledge), {
    success: true
  })
  acknowledgeWriterFlushFromEvent({ sender: { id: 42 } }, acknowledge)
  acknowledgeWriterFlushFromEvent({ sender: { id: 42 } }, acknowledge)
  await Promise.resolve()
  assert.equal(completed, false)

  acknowledgeWriterFlushFromEvent({ sender: { id: 43 } }, acknowledge)
  await pending
  assert.equal(completed, true)
})

test('发送 flush 请求时拒绝已销毁窗口或已销毁 webContents', () => {
  const sent: string[] = []
  const windows = [
    {
      isDestroyed: () => true,
      webContents: {
        id: 41,
        isDestroyed: () => false,
        send: (channel: string) => sent.push(channel)
      }
    },
    {
      isDestroyed: () => false,
      webContents: {
        id: 42,
        isDestroyed: () => true,
        send: (channel: string) => sent.push(channel)
      }
    },
    {
      isDestroyed: () => false,
      webContents: {
        id: 43,
        isDestroyed: () => false,
        send: (channel: string) => sent.push(channel)
      }
    }
  ]

  assert.equal(sendWriterFlushRequestToWindow(windows, 41, 'writer:flush-request'), false)
  assert.equal(sendWriterFlushRequestToWindow(windows, 42, 'writer:flush-request'), false)
  assert.equal(sendWriterFlushRequestToWindow(windows, 43, 'writer:flush-request'), true)
  assert.deepEqual(sent, ['writer:flush-request'])
})

test('窗口首次 close 阻止销毁并请求退出，再次 close 不递归请求', () => {
  let shutdownRequested = false
  let requestCount = 0
  let preventCount = 0
  const options = {
    isShutdownRequested: () => shutdownRequested,
    isQuittingForUpdate: () => false,
    requestShutdown: () => {
      requestCount += 1
      shutdownRequested = true
    }
  }
  const event = {
    preventDefault: () => {
      preventCount += 1
    }
  }

  handleWriterWindowClose(event, options)
  handleWriterWindowClose(event, options)

  assert.equal(preventCount, 1)
  assert.equal(requestCount, 1)
})
