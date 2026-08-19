import assert from 'node:assert/strict'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
// @ts-expect-error 测试通过 Node loader 跨项目验证主进程真实服务
import { WriterAssetService } from '@main/services/writer/WriterAssetService'
// @ts-expect-error 测试通过 Node loader 跨项目验证主进程真实服务
import { WriterFlushCoordinator } from '@main/services/writer/WriterFlushCoordinator'
// @ts-expect-error 测试通过 Node loader 跨项目验证主进程真实服务
import { WriterService } from '@main/services/writer/WriterService'
// @ts-expect-error 测试通过 Node loader 跨项目验证主进程真实服务
import { WriterStorageService } from '@main/services/writer/WriterStorageService'
import { initI18n } from '@renderer/i18n'
import type { WriterAsset, WriterResult } from '@shared/types/writer'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { parseHTML } from 'linkedom'
import {
  collectReferencedWriterAssets,
  createWriterImageExtension,
  createWriterImageAttrs,
  importWriterImage,
  isWriterImageFile,
  queueWriterImageImport,
  runWriterDocumentCloseGc,
  writerImageUploadPluginKey
} from './writerImage'

const DOCUMENT_ID = 'writer-12345678'
const { window: testWindow } = parseHTML('<html><head></head><body></body></html>')
for (const [name, value] of Object.entries({
  window: testWindow,
  document: testWindow.document,
  DOMParser: testWindow.DOMParser,
  HTMLElement: testWindow.HTMLElement,
  Node: testWindow.Node,
  innerHeight: 800,
  pageYOffset: 0,
  scrollTo: () => undefined
})) {
  Object.defineProperty(globalThis, name, { configurable: true, value })
}
testWindow.getSelection = () =>
  ({
    removeAllRanges: () => undefined,
    addRange: () => undefined
  }) as unknown as Selection
testWindow.document.getSelection = testWindow.getSelection

// importWriterImage 错误文案改走 i18n.t：先初始化（测试环境默认 zh，既有中文断言不变）
await initI18n()

test('图片节点只接受当前写作文档的安全资源并提取垃圾回收引用', () => {
  const safe = createWriterImageAttrs({
    documentId: DOCUMENT_ID,
    url: `lumina://writing/${DOCUMENT_ID}/assets/hash.png`,
    relativePath: 'assets/hash.png'
  })

  assert.deepEqual(safe, {
    src: `lumina://writing/${DOCUMENT_ID}/assets/hash.png`,
    assetPath: 'assets/hash.png',
    alt: '',
    caption: '',
    width: 100,
    align: 'center',
    nodeId: null
  })
  assert.throws(() =>
    createWriterImageAttrs({
      documentId: DOCUMENT_ID,
      url: 'https://example.com/tracker.png',
      relativePath: 'assets/tracker.png'
    })
  )
  assert.throws(() =>
    createWriterImageAttrs({
      documentId: DOCUMENT_ID,
      url: 'data:image/png;base64,AAAA',
      relativePath: 'assets/tracker.png'
    })
  )
  assert.throws(() =>
    createWriterImageAttrs({
      documentId: DOCUMENT_ID,
      url: 'blob:https://example.com/asset',
      relativePath: 'assets/tracker.png'
    })
  )
  assert.throws(() =>
    createWriterImageAttrs({
      documentId: DOCUMENT_ID,
      url: 'lumina://writing/writer-87654321/assets/hash.png',
      relativePath: 'assets/hash.png'
    })
  )
  assert.deepEqual(
    collectReferencedWriterAssets({
      type: 'doc',
      content: [
        { type: 'image', attrs: safe },
        { type: 'paragraph', content: [{ type: 'image', attrs: safe }] },
        {
          type: 'image',
          attrs: {
            ...safe,
            src: 'https://example.com/tracker.png',
            assetPath: 'assets/tracker.png'
          }
        }
      ]
    }),
    ['assets/hash.png']
  )
})

test('图片属性钳制宽度、归一对齐并保留空 alt', () => {
  const narrow = createWriterImageAttrs({
    documentId: DOCUMENT_ID,
    url: `lumina://writing/${DOCUMENT_ID}/assets/narrow.webp`,
    relativePath: 'assets/narrow.webp',
    alt: '',
    caption: '图 1',
    width: -20,
    align: 'left',
    nodeId: 'node-1'
  })
  const wide = createWriterImageAttrs({
    documentId: DOCUMENT_ID,
    url: `lumina://writing/${DOCUMENT_ID}/assets/wide.gif`,
    relativePath: 'assets/wide.gif',
    width: 900,
    align: 'justify'
  })

  assert.equal(narrow.width, 10)
  assert.equal(narrow.align, 'left')
  assert.equal(narrow.alt, '')
  assert.equal(narrow.caption, '图 1')
  assert.equal(narrow.nodeId, 'node-1')
  assert.equal(wide.width, 100)
  assert.equal(wide.align, 'center')
})

test('图片导入只返回当前文档的安全资源且不接受跨文档响应', async () => {
  const calls: Array<{
    documentId: string
    fileName: string
    mimeType: string
    bytes: number[]
  }> = []
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'figure.png', {
    type: 'image/png'
  })
  const safeAsset: WriterAsset = {
    assetId: 'hash',
    fileName: 'figure.png',
    relativePath: 'assets/hash.png',
    mimeType: 'image/png',
    size: 4,
    sha256: 'hash',
    url: `lumina://writing/${DOCUMENT_ID}/assets/hash.png`
  }
  const importAsset = async (
    documentId: string,
    fileName: string,
    mimeType: string,
    bytes: Uint8Array
  ): Promise<WriterResult<WriterAsset>> => {
    calls.push({ documentId, fileName, mimeType, bytes: [...bytes] })
    return { success: true, data: safeAsset }
  }

  const result = await importWriterImage(file, DOCUMENT_ID, importAsset)

  assert.deepEqual(result, { success: true, data: safeAsset })
  assert.deepEqual(calls, [
    {
      documentId: DOCUMENT_ID,
      fileName: 'figure.png',
      mimeType: 'image/png',
      bytes: [137, 80, 78, 71]
    }
  ])

  const unsafe = await importWriterImage(file, DOCUMENT_ID, async () => ({
    success: true,
    data: {
      ...safeAsset,
      url: 'lumina://writing/writer-87654321/assets/hash.png'
    }
  }))
  assert.equal(unsafe.success, false)
  assert.equal(unsafe.code, 'invalid_input')
})

test('退出清理只依据最后成功保存的 JSON 保留真实资源', async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), 'lumina-writer-image-'))
  t.after(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })
  const storageService = new WriterStorageService({ rootPath })
  const assetService = new WriterAssetService({ rootPath })
  const service = new WriterService({
    storageService,
    assetService,
    flushCoordinator: new WriterFlushCoordinator({ send: () => true, timeoutMs: 10 }),
    getWebContentsIds: () => []
  })
  await service.initialize()
  const created = await service.createDocument('图片清理')
  assert.equal(created.success, true)
  assert.ok(created.data)
  const document = created.data

  const kept = await service.importAsset(document.id, {
    fileName: 'kept.png',
    declaredMimeType: 'image/png',
    bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])
  })
  const orphan = await service.importAsset(document.id, {
    fileName: 'orphan.png',
    declaredMimeType: 'image/png',
    bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 2])
  })
  assert.ok(kept.data)
  assert.ok(orphan.data)

  const saved = await service.saveDocument({
    documentId: document.id,
    expectedRevision: 0,
    title: document.title,
    content: {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: createWriterImageAttrs({
            documentId: document.id,
            url: kept.data.url,
            relativePath: kept.data.relativePath
          })
        }
      ]
    }
  })
  assert.equal(saved.success, true)
  const failedSave = await service.saveDocument({
    documentId: document.id,
    expectedRevision: 0,
    title: document.title,
    content: {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: createWriterImageAttrs({
            documentId: document.id,
            url: orphan.data.url,
            relativePath: orphan.data.relativePath
          })
        }
      ]
    }
  })
  assert.equal(failedSave.code, 'revision_conflict')

  await service.flushPendingSaves()

  const documentRoot = join(rootPath, 'documents', document.id)
  await access(join(documentRoot, kept.data.relativePath))
  await assert.rejects(access(join(documentRoot, orphan.data.relativePath)))
})

test('导入失败会移除上传占位且不让不安全 URL 进入 JSON', async () => {
  let resolveImport: ((result: WriterResult<WriterAsset>) => void) | undefined
  const importResult = new Promise<WriterResult<WriterAsset>>((resolve) => {
    resolveImport = resolve
  })
  const errors: string[] = []
  const editor = new Editor({
    element: document.createElement('div'),
    injectCSS: false,
    extensions: [
      StarterKit,
      createWriterImageExtension({
        documentId: DOCUMENT_ID
      })
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] }
  })
  const file = new File([new Uint8Array([1])], 'bad.png', { type: 'image/png' })

  const importing = queueWriterImageImport({
    editor,
    documentId: DOCUMENT_ID,
    file,
    importAsset: async () => importResult,
    onError: (message) => errors.push(message)
  })
  const pendingDecorations = writerImageUploadPluginKey.getState(editor.state)
  assert.equal(pendingDecorations?.find().length, 1)

  resolveImport?.({
    success: true,
    data: {
      assetId: 'bad',
      fileName: 'bad.png',
      relativePath: 'assets/bad.png',
      mimeType: 'image/png',
      size: 1,
      sha256: 'bad',
      url: 'https://example.com/tracker.png'
    }
  })
  assert.equal(await importing, false)

  const settledDecorations = writerImageUploadPluginKey.getState(editor.state)
  assert.equal(settledDecorations?.find().length, 0)
  assert.deepEqual(editor.getJSON(), {
    type: 'doc',
    content: [{ type: 'paragraph' }]
  })
  assert.deepEqual(errors, ['图片资源响应无效'])
  editor.destroy()
})

test('导入成功才以安全属性插入图片并移除上传占位', async () => {
  const editor = new Editor({
    element: document.createElement('div'),
    injectCSS: false,
    extensions: [
      StarterKit,
      createWriterImageExtension({
        documentId: DOCUMENT_ID
      })
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] }
  })
  const file = new File([new Uint8Array([1])], 'safe.png', { type: 'image/png' })
  const safeAsset: WriterAsset = {
    assetId: 'safe',
    fileName: 'safe.png',
    relativePath: 'assets/safe.png',
    mimeType: 'image/png',
    size: 1,
    sha256: 'safe',
    url: `lumina://writing/${DOCUMENT_ID}/assets/safe.png`
  }
  let transactionCount = 0
  editor.on('transaction', () => {
    transactionCount += 1
  })

  const inserted = await queueWriterImageImport({
    editor,
    documentId: DOCUMENT_ID,
    file,
    importAsset: async () => ({ success: true, data: safeAsset }),
    onError: () => assert.fail('安全图片不应报告错误')
  })

  assert.equal(inserted, true)
  assert.equal(transactionCount, 2)
  assert.equal(writerImageUploadPluginKey.getState(editor.state)?.find().length, 0)
  const image = editor.getJSON().content?.find((node) => node.type === 'image')
  assert.deepEqual(
    { ...image?.attrs },
    {
      src: safeAsset.url,
      assetPath: safeAsset.relativePath,
      alt: '',
      caption: '',
      width: 100,
      align: 'center',
      nodeId: null
    }
  )
  editor.destroy()
})

test('初始 JSON 与富文本插入都不能把外链图片带入文档', () => {
  const editor = new Editor({
    element: document.createElement('div'),
    injectCSS: false,
    extensions: [
      StarterKit,
      createWriterImageExtension({
        documentId: DOCUMENT_ID
      })
    ],
    content: {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: {
            src: 'https://example.com/tracker.png',
            assetPath: 'assets/tracker.png'
          }
        },
        { type: 'paragraph', content: [{ type: 'text', text: '正文' }] }
      ]
    }
  })

  assert.equal(
    editor.getJSON().content?.some((node) => node.type === 'image'),
    false
  )
  assert.equal(editor.commands.setImage({ src: 'https://example.com/command.png' }), false)
  assert.equal(
    editor.getJSON().content?.some((node) => node.type === 'image'),
    false
  )
  editor.commands.insertContent('<img src="file:///Users/test/private.png"><p>末尾</p>')
  assert.equal(
    editor.getJSON().content?.some((node) => node.type === 'image'),
    false
  )
  assert.match(editor.getText(), /正文/)
  assert.match(editor.getText(), /末尾/)
  editor.destroy()
})

test('图片选择器拒绝 SVG 且只接受 PNG/JPEG/WebP/GIF', () => {
  // SVG 不进入图片导入路径，必须被文件过滤器挡下
  assert.equal(isWriterImageFile({ name: 'diagram.svg', type: 'image/svg+xml' }), false)
  // 没有正确 MIME 时按扩展名判定，SVG 仍被拒绝
  assert.equal(isWriterImageFile({ name: 'icon.SVG', type: '' }), false)

  // 四种受支持 MIME 与对应扩展名
  assert.equal(isWriterImageFile({ name: 'figure.png', type: 'image/png' }), true)
  assert.equal(isWriterImageFile({ name: 'photo.JPG', type: 'image/jpeg' }), true)
  assert.equal(isWriterImageFile({ name: 'motion.webp', type: 'image/webp' }), true)
  assert.equal(isWriterImageFile({ name: 'loop.gif', type: 'image/gif' }), true)
  // 受支持 MIME 但扩展名缺失仍放行（粘贴场景常见）
  assert.equal(isWriterImageFile({ name: 'screenshot', type: 'image/png' }), true)
  // MIME 为空时仅按扩展名判定
  assert.equal(isWriterImageFile({ name: 'legacy.jpeg', type: '' }), true)
  // 明确是 SVG 的 MIME 即便扩展名伪装也被拒绝
  assert.equal(isWriterImageFile({ name: 'trick.png', type: 'image/svg+xml' }), false)
  // 其他 image/*（BMP、TIFF 等）一律拒绝
  assert.equal(isWriterImageFile({ name: 'scan.bmp', type: 'image/bmp' }), false)
  assert.equal(isWriterImageFile({ name: 'page.tiff', type: 'image/tiff' }), false)
  assert.equal(isWriterImageFile({ name: 'icon.ico', type: 'image/x-icon' }), false)
  // MIME 为空且无受支持扩展名时拒绝
  assert.equal(isWriterImageFile({ name: 'screenshot', type: '' }), false)
  // 非法 MIME 不能靠扩展名伪装通过
  assert.equal(isWriterImageFile({ name: 'fake.png', type: 'image/bmp' }), false)
})

test('文档关闭 GC 必须在最后一次自动保存落盘后才调用', async () => {
  const events: string[] = []
  const flushCompleted = createDeferred()
  const collectGarbageCalls: string[] = []
  const collectStarted = createDeferred()
  const collectCompleted = createDeferred()

  // 不在顶部 await：先启动流程，再用 deferred 驱动并断言中间顺序
  const done = runWriterDocumentCloseGc(DOCUMENT_ID, {
    flush: async () => {
      events.push('flush:start')
      await flushCompleted.promise
      events.push('flush:end')
    },
    collectGarbage: async (documentId) => {
      collectGarbageCalls.push(documentId)
      events.push('gc:start')
      collectStarted.resolve()
      await collectCompleted.promise
      events.push('gc:end')
      return { success: true, data: 0 }
    }
  })
  await Promise.resolve()
  await Promise.resolve()

  // flush 未完成前 collectGarbage 绝不能被调用
  assert.deepEqual(events, ['flush:start'])
  assert.deepEqual(collectGarbageCalls, [])

  flushCompleted.resolve()
  await collectStarted.promise
  assert.deepEqual(events, ['flush:start', 'flush:end', 'gc:start'])
  assert.deepEqual(collectGarbageCalls, [DOCUMENT_ID])

  collectCompleted.resolve()
  await done
  assert.deepEqual(events, ['flush:start', 'flush:end', 'gc:start', 'gc:end'])
})

test('文档关闭 GC 在 GC 失败时不抛出，交由下次启动兜底', async () => {
  const collectGarbageCalls: string[] = []

  // 失败结果不应导致 runWriterDocumentCloseGc 抛出（调用方以 void fire-and-forget 触发）
  await runWriterDocumentCloseGc(DOCUMENT_ID, {
    flush: async () => undefined,
    collectGarbage: async (documentId) => {
      collectGarbageCalls.push(documentId)
      return { success: false, code: 'io_error', error: '清理失败' }
    }
  })

  assert.deepEqual(collectGarbageCalls, [DOCUMENT_ID])
})

// 共用 deferred 工具，避免在文件顶部为两个 GC 用例重复定义
function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
