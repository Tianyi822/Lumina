import { basename } from 'path'
import { saveWriterDocumentRequestSchema } from '@shared/schemas/writerSchema'
import { isValidWriterDocumentId } from '@main/services/writer/writerPaths'
import type { SaveWriterDocumentRequest, WriterAssetImportInput } from '@shared/types/writer'

const MAX_WRITER_ASSET_BYTES = 20 * 1024 * 1024
const SUPPORTED_WRITER_ASSET_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
])
const WRITER_FOLDER_ID_PATTERN = /^folder-[a-z0-9-]{8,}$/

export interface ImportWriterAssetPayload extends WriterAssetImportInput {
  documentId: string
}

/** 校验写作文档 ID，避免把路径或空值带入永久删除 */
export function validateDeleteWriterPayload(documentId: unknown): string | null {
  return typeof documentId === 'string' && isValidWriterDocumentId(documentId)
    ? null
    : '无效的文档 ID'
}

/** 校验跨 IPC 传入的图片资源，较大载荷在进入服务前立即拒绝 */
export function validateImportWriterAssetPayload(payload: unknown): string | null {
  if (!isObject(payload)) {
    return '无效的图片导入请求'
  }
  const documentIdError = validateDeleteWriterPayload(payload.documentId)
  if (documentIdError) {
    return documentIdError
  }
  if (
    typeof payload.fileName !== 'string' ||
    payload.fileName.length === 0 ||
    basename(payload.fileName) !== payload.fileName ||
    payload.fileName.includes('\\') ||
    payload.fileName.includes('\0')
  ) {
    return '无效的图片文件名'
  }
  if (
    typeof payload.declaredMimeType !== 'string' ||
    !SUPPORTED_WRITER_ASSET_MIME_TYPES.has(payload.declaredMimeType.toLowerCase())
  ) {
    return '不支持的图片 MIME 类型'
  }
  if (!(payload.bytes instanceof Uint8Array)) {
    return '无效的图片字节'
  }
  if (payload.bytes.byteLength > MAX_WRITER_ASSET_BYTES) {
    return '单张图片不能超过 20MB'
  }
  return null
}

export function validateWriterTitle(title: unknown, optional = false): string | null {
  if (optional && title === undefined) {
    return null
  }
  if (typeof title !== 'string') {
    return '无效的文档标题'
  }
  if (!optional && title.trim().length === 0) {
    return '文档标题不能为空'
  }
  return title.length <= 200 ? null : '文档标题不能超过 200 个字符'
}

export function validateSaveWriterPayload(payload: unknown): payload is SaveWriterDocumentRequest {
  return saveWriterDocumentRequestSchema.safeParse(payload).success
}

export function validateWriterFolderId(folderId: unknown, optional = false): string | null {
  if (optional && folderId === undefined) {
    return null
  }
  return typeof folderId === 'string' && WRITER_FOLDER_ID_PATTERN.test(folderId)
    ? null
    : '无效的文件夹 ID'
}

export function validateWriterFolderName(name: unknown): string | null {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 100
    ? null
    : '无效的文件夹名称'
}

export function validateWriterFavorite(favorite: unknown): string | null {
  return typeof favorite === 'boolean' ? null : '无效的收藏状态'
}

/** 校验导出格式；Task 14 起 IPC 层先拒绝未知取值 */
export function validateWriterExportFormat(format: unknown): string | null {
  return format === 'markdown' || format === 'docx' || format === 'pdf' ? null : '无效的导出格式'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
