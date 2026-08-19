import { basename } from 'path'
import { t } from '@main/services/i18n'
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
    : t('notifications.writer.invalidId')
}

/** 校验跨 IPC 传入的图片资源，较大载荷在进入服务前立即拒绝 */
export function validateImportWriterAssetPayload(payload: unknown): string | null {
  if (!isObject(payload)) {
    return t('notifications.writer.invalidAssetImportRequest')
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
    return t('notifications.writer.invalidImageFileName')
  }
  if (
    typeof payload.declaredMimeType !== 'string' ||
    !SUPPORTED_WRITER_ASSET_MIME_TYPES.has(payload.declaredMimeType.toLowerCase())
  ) {
    return t('notifications.writer.unsupportedImageMime')
  }
  if (!(payload.bytes instanceof Uint8Array)) {
    return t('notifications.writer.invalidImageBytes')
  }
  if (payload.bytes.byteLength > MAX_WRITER_ASSET_BYTES) {
    return t('notifications.writer.imageTooLarge', { max: 20 })
  }
  return null
}

export function validateWriterTitle(title: unknown, optional = false): string | null {
  if (optional && title === undefined) {
    return null
  }
  if (typeof title !== 'string') {
    return t('notifications.writer.invalidTitle')
  }
  if (!optional && title.trim().length === 0) {
    return t('notifications.writer.titleRequired')
  }
  return title.length <= 200 ? null : t('notifications.writer.titleTooLong', { max: 200 })
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
    : t('notifications.writer.invalidFolderId')
}

export function validateWriterFolderName(name: unknown): string | null {
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 100
    ? null
    : t('notifications.writer.invalidFolderName')
}

export function validateWriterFavorite(favorite: unknown): string | null {
  return typeof favorite === 'boolean' ? null : t('notifications.writer.invalidFavorite')
}

/** 校验导出格式；Task 14 起 IPC 层先拒绝未知取值 */
export function validateWriterExportFormat(format: unknown): string | null {
  return format === 'markdown' || format === 'docx' || format === 'pdf'
    ? null
    : t('notifications.writer.invalidExportFormat')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
