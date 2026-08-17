import Image from '@tiptap/extension-image'
import type { Editor, JSONContent } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ReactNodeViewRenderer } from '@tiptap/react'
import type {
  WriterAsset,
  WriterJsonDocument,
  WriterJsonNode,
  WriterResult
} from '@shared/types/writer'
import { i18n } from '@renderer/i18n'
import WriterImageView from '../nodes/WriterImageView.tsx'

/** 写作图片只接受 PNG、JPEG、WebP、GIF，SVG 不进入导入路径（主进程同样拒绝）。 */
const WRITER_IMAGE_FILE_PATTERN = /\.(?:png|jpe?g|webp|gif)$/i
/** 与主进程 WriterAssetService 一致的 MIME 白名单。 */
const WRITER_ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
])
/** SVG 无论以 MIME 还是扩展名出现都必须挡在导入路径之外。 */
const WRITER_SVG_FILE_PATTERN = /\.svg$/i
const WRITER_SVG_MIME_TYPE = 'image/svg+xml'

/**
 * 文件选择、粘贴、拖放共用同一道类型过滤。
 * 仅允许 PNG / JPEG / WebP / GIF；SVG、BMP、TIFF、ICO 及其他 image/* 一律拒绝。
 * MIME 为空时仅按扩展名判定；MIME 非空则必须在白名单内（扩展名不能覆盖非法 MIME）。
 */
export function isWriterImageFile(file: Pick<File, 'type' | 'name'>): boolean {
  if (file.type === WRITER_SVG_MIME_TYPE || WRITER_SVG_FILE_PATTERN.test(file.name)) {
    return false
  }
  if (file.type !== '' && WRITER_ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    return true
  }
  if (file.type === '' && WRITER_IMAGE_FILE_PATTERN.test(file.name)) {
    return true
  }
  return false
}

export type WriterImageAlign = 'left' | 'center' | 'right'

export interface WriterImageAttrs extends Record<string, unknown> {
  src: string
  assetPath: string
  alt: string
  caption: string
  width: number
  align: WriterImageAlign
  nodeId: string | null
}

export interface CreateWriterImageAttrsInput {
  documentId?: string
  url: string
  relativePath: string
  alt?: string
  caption?: string
  width?: number
  align?: unknown
  nodeId?: string | null
}

export type WriterImageImport = (
  documentId: string,
  fileName: string,
  declaredMimeType: string,
  bytes: Uint8Array
) => Promise<WriterResult<WriterAsset>>

export interface WriterImageExtensionOptions {
  documentId: string
}

export interface QueueWriterImageImportOptions {
  editor: Editor
  documentId: string
  file: Pick<File, 'arrayBuffer' | 'name' | 'type'>
  importAsset?: WriterImageImport
  onError: (message: string) => void
}

const WRITER_DOCUMENT_ID_PATTERN = /^writer-[a-z0-9-]{8,}$/
const WRITER_ASSET_PATH_PATTERN = /^assets\/[a-z0-9][a-z0-9.-]*\.(?:png|jpg|webp|gif)$/
const WRITER_IMAGE_ALIGNS = new Set<WriterImageAlign>(['left', 'center', 'right'])
let uploadSequence = 0

interface WriterImageUploadMeta {
  action: 'add' | 'remove'
  id: string
  position?: number
}

export const writerImageUploadPluginKey = new PluginKey<DecorationSet>('writerImageUpload')

function parseWriterAssetUrl(rawUrl: string): { documentId: string; relativePath: string } | null {
  try {
    const url = new URL(rawUrl)
    if (
      url.protocol !== 'lumina:' ||
      url.hostname !== 'writing' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname.includes('%')
    ) {
      return null
    }
    const segments = url.pathname.split('/').filter(Boolean)
    if (
      segments.length !== 3 ||
      !WRITER_DOCUMENT_ID_PATTERN.test(segments[0]) ||
      segments[1] !== 'assets'
    ) {
      return null
    }
    const relativePath = `assets/${segments[2]}`
    if (!WRITER_ASSET_PATH_PATTERN.test(relativePath)) {
      return null
    }
    return { documentId: segments[0], relativePath }
  } catch {
    return null
  }
}

function normalizeWidth(width: number | undefined): number {
  if (typeof width !== 'number' || !Number.isFinite(width)) return 100
  return Math.min(100, Math.max(10, width))
}

function normalizeAlign(align: unknown): WriterImageAlign {
  return WRITER_IMAGE_ALIGNS.has(align as WriterImageAlign) ? (align as WriterImageAlign) : 'center'
}

/** 图片属性只允许指向当前写作文档自身的不可变资源。 */
export function createWriterImageAttrs(input: CreateWriterImageAttrsInput): WriterImageAttrs {
  const parsedUrl = parseWriterAssetUrl(input.url)
  if (
    !parsedUrl ||
    !WRITER_ASSET_PATH_PATTERN.test(input.relativePath) ||
    parsedUrl.relativePath !== input.relativePath ||
    (input.documentId !== undefined && parsedUrl.documentId !== input.documentId)
  ) {
    throw new Error('写作图片资源 URL 无效')
  }

  return {
    src: input.url,
    assetPath: input.relativePath,
    alt: typeof input.alt === 'string' ? input.alt : '',
    caption: typeof input.caption === 'string' ? input.caption : '',
    width: normalizeWidth(input.width),
    align: normalizeAlign(input.align),
    nodeId: typeof input.nodeId === 'string' && input.nodeId ? input.nodeId : null
  }
}

function collectNodeAssets(node: WriterJsonNode, assets: Set<string>): void {
  if (node.type === 'image' && node.attrs) {
    const src = node.attrs.src
    const assetPath = node.attrs.assetPath
    if (typeof src === 'string' && typeof assetPath === 'string') {
      const parsedUrl = parseWriterAssetUrl(src)
      if (parsedUrl?.relativePath === assetPath) {
        assets.add(assetPath)
      }
    }
  }
  for (const child of node.content ?? []) {
    collectNodeAssets(child, assets)
  }
}

/** 从最后成功保存的 JSON 中提取经 URL 与路径双重校验的资源引用。 */
export function collectReferencedWriterAssets(document: WriterJsonDocument): string[] {
  const assets = new Set<string>()
  collectNodeAssets(document, assets)
  return [...assets].sort()
}

/** 文件选择、粘贴和拖放共用同一条安全导入边界。 */
export async function importWriterImage(
  file: Pick<File, 'arrayBuffer' | 'name' | 'type'>,
  documentId: string,
  importAsset: WriterImageImport = (id, fileName, mimeType, bytes) =>
    window.api.writer.importAsset(id, fileName, mimeType, bytes)
): Promise<WriterResult<WriterAsset>> {
  if (!WRITER_DOCUMENT_ID_PATTERN.test(documentId)) {
    return {
      success: false,
      code: 'invalid_input',
      error: i18n.t('notifications.writer.invalidDocumentId')
    }
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await importAsset(documentId, file.name, file.type, bytes)
    if (!result.success || !result.data) {
      return result
    }
    createWriterImageAttrs({
      documentId,
      url: result.data.url,
      relativePath: result.data.relativePath
    })
    return result
  } catch {
    return {
      success: false,
      code: 'invalid_input',
      error: i18n.t('notifications.writer.invalidAssetResponse')
    }
  }
}

function createUploadPlaceholder(): HTMLElement {
  const placeholder = document.createElement('span')
  placeholder.className = 'writer-image-upload-placeholder'
  placeholder.setAttribute('role', 'status')
  placeholder.setAttribute('aria-live', 'polite')
  placeholder.textContent = i18n.t('writer.nodes.imageImporting')
  return placeholder
}

function createUploadPlugin(): Plugin<DecorationSet> {
  return new Plugin({
    key: writerImageUploadPluginKey,
    state: {
      init: () => DecorationSet.empty,
      apply: (transaction, decorations) => {
        let next = decorations.map(transaction.mapping, transaction.doc)
        const meta = transaction.getMeta(writerImageUploadPluginKey) as
          | WriterImageUploadMeta
          | undefined
        if (!meta) return next
        if (meta.action === 'add' && meta.position !== undefined) {
          next = next.add(transaction.doc, [
            Decoration.widget(meta.position, createUploadPlaceholder, {
              id: meta.id,
              key: meta.id,
              side: 1
            })
          ])
        } else if (meta.action === 'remove') {
          next = next.remove(next.find(undefined, undefined, (spec) => spec.id === meta.id))
        }
        return next
      }
    },
    props: {
      decorations: (state) => writerImageUploadPluginKey.getState(state) ?? null
    }
  })
}

function sanitizeWriterImageJson(content: JSONContent, documentId: string): JSONContent | null {
  if (content.type === 'image') {
    try {
      return {
        type: 'image',
        attrs: createWriterImageAttrs({
          documentId,
          url: typeof content.attrs?.src === 'string' ? content.attrs.src : '',
          relativePath: typeof content.attrs?.assetPath === 'string' ? content.attrs.assetPath : '',
          alt: typeof content.attrs?.alt === 'string' ? content.attrs.alt : '',
          caption: typeof content.attrs?.caption === 'string' ? content.attrs.caption : '',
          width: typeof content.attrs?.width === 'number' ? content.attrs.width : undefined,
          align: content.attrs?.align,
          nodeId: typeof content.attrs?.nodeId === 'string' ? content.attrs.nodeId : null
        })
      }
    } catch {
      return null
    }
  }
  return {
    ...content,
    content: content.content
      ?.map((child) => sanitizeWriterImageJson(child, documentId))
      .filter((child): child is JSONContent => child !== null)
  }
}

/** 创建只解析当前文档 lumina://writing 图片的 Tiptap 节点。 */
export function createWriterImageExtension(options: WriterImageExtensionOptions) {
  return Image.extend({
    onBeforeCreate({ editor }) {
      if (typeof editor.options.content === 'object' && editor.options.content !== null) {
        editor.options.content = sanitizeWriterImageJson(
          editor.options.content as JSONContent,
          options.documentId
        ) ?? {
          type: 'doc',
          content: [{ type: 'paragraph' }]
        }
      }
    },

    addAttributes() {
      return {
        src: { default: '' },
        assetPath: { default: '' },
        alt: { default: '' },
        caption: { default: '' },
        width: { default: 100 },
        align: { default: 'center' },
        nodeId: { default: null }
      }
    },

    addCommands() {
      return {
        ...(this.parent?.() ?? {}),
        setImage:
          (attributes) =>
          ({ commands }) => {
            try {
              const customAttributes = attributes as unknown as Partial<WriterImageAttrs>
              const safeAttributes = createWriterImageAttrs({
                documentId: options.documentId,
                url: attributes.src,
                relativePath:
                  typeof customAttributes.assetPath === 'string' ? customAttributes.assetPath : '',
                alt: typeof attributes.alt === 'string' ? attributes.alt : '',
                caption:
                  typeof customAttributes.caption === 'string' ? customAttributes.caption : '',
                width:
                  typeof customAttributes.width === 'number' ? customAttributes.width : undefined,
                align: customAttributes.align,
                nodeId: typeof customAttributes.nodeId === 'string' ? customAttributes.nodeId : null
              })
              return commands.insertContent({ type: this.name, attrs: safeAttributes })
            } catch {
              return false
            }
          }
      }
    },

    parseHTML() {
      return [
        {
          tag: 'img[src]',
          getAttrs: (element) => {
            if (!(element instanceof HTMLElement)) return false
            const src = element.getAttribute('src') ?? ''
            const parsed = parseWriterAssetUrl(src)
            if (!parsed) return false
            try {
              return createWriterImageAttrs({
                documentId: options.documentId,
                url: src,
                relativePath: parsed.relativePath,
                alt: element.getAttribute('alt') ?? '',
                caption: element.getAttribute('data-caption') ?? '',
                width: Number(element.getAttribute('data-width') ?? 100),
                align: element.getAttribute('data-align'),
                nodeId: element.getAttribute('data-node-id')
              })
            } catch {
              return false
            }
          }
        }
      ]
    },

    renderHTML({ node }) {
      const attrs = createWriterImageAttrs({
        documentId: options.documentId,
        url: String(node.attrs.src),
        relativePath: String(node.attrs.assetPath),
        alt: typeof node.attrs.alt === 'string' ? node.attrs.alt : '',
        caption: typeof node.attrs.caption === 'string' ? node.attrs.caption : '',
        width: Number(node.attrs.width),
        align: node.attrs.align,
        nodeId: typeof node.attrs.nodeId === 'string' ? node.attrs.nodeId : null
      })
      return [
        'img',
        {
          src: attrs.src,
          alt: attrs.alt,
          'data-asset-path': attrs.assetPath,
          'data-caption': attrs.caption,
          'data-width': String(attrs.width),
          'data-align': attrs.align,
          'data-node-id': attrs.nodeId
        }
      ]
    },

    addNodeView() {
      return ReactNodeViewRenderer(WriterImageView)
    },

    addProseMirrorPlugins() {
      return [...(this.parent?.() ?? []), createUploadPlugin()]
    }
  }).configure({ allowBase64: false })
}

/** 上传只在安全响应返回后写入图片节点；占位是 Decoration，不进入保存 JSON。 */
export async function queueWriterImageImport(
  options: QueueWriterImageImportOptions
): Promise<boolean> {
  const { editor, documentId, file, onError } = options
  const uploadId = `writer-image-upload-${++uploadSequence}`
  const position = editor.state.selection.from
  editor.view.dispatch(
    editor.state.tr
      .setMeta(writerImageUploadPluginKey, {
        action: 'add',
        id: uploadId,
        position
      } satisfies WriterImageUploadMeta)
      .setMeta('addToHistory', false)
  )

  const result = await importWriterImage(file, documentId, options.importAsset)
  if (editor.isDestroyed) return false

  if (!result.success || !result.data) {
    editor.view.dispatch(
      editor.state.tr
        .setMeta(writerImageUploadPluginKey, {
          action: 'remove',
          id: uploadId
        } satisfies WriterImageUploadMeta)
        .setMeta('addToHistory', false)
    )
    onError(result.error ?? i18n.t('notifications.writer.imageImportFailed'))
    return false
  }

  const attrs = createWriterImageAttrs({
    documentId,
    url: result.data.url,
    relativePath: result.data.relativePath
  })
  const decoration = writerImageUploadPluginKey
    .getState(editor.state)
    ?.find(undefined, undefined, (spec) => spec.id === uploadId)[0]
  const insertionPosition = decoration?.from ?? editor.state.selection.from
  const inserted = editor
    .chain()
    .command(({ tr }) => {
      tr.setMeta(writerImageUploadPluginKey, {
        action: 'remove',
        id: uploadId
      } satisfies WriterImageUploadMeta)
      return true
    })
    .insertContentAt(insertionPosition, {
      type: 'image',
      attrs
    } satisfies JSONContent)
    .run()
  if (!inserted) {
    onError(i18n.t('notifications.writer.imageInsertUnavailable'))
  }
  return inserted
}

/** 文档关闭 GC 的依赖集合，便于在纯函数中按调用顺序断言。 */
export interface WriterDocumentCloseGcDeps {
  /** 等待最后一次自动保存真正落盘，确保 GC 读取的是最新 JSON。 */
  flush: () => Promise<void>
  /** 触发主进程对该文档的资源回收。 */
  collectGarbage: (documentId: string) => Promise<WriterResult<unknown>>
}

/**
 * 文档关闭时触发图片资源回收。
 *
 * 关键顺序约束：必须先等待最后一次自动保存落盘，再触发 GC。否则正在写入的资源
 * 可能被回收，而稍后保存又会把它写回磁盘，导致该资源永远逃过 GC。GC 失败保持静默，
 * 与退出路径一致——下次启动时的全量 GC 会兜底。
 */
export async function runWriterDocumentCloseGc(
  documentId: string,
  deps: WriterDocumentCloseGcDeps
): Promise<void> {
  await deps.flush()
  await deps.collectGarbage(documentId)
}
