import type { AttachedDocument, AttachedImage } from '@shared/types/chat'
import {
  SUPPORTED_DOCUMENT_ACCEPT,
  SUPPORTED_DOCUMENT_EXTENSIONS
} from '@shared/constants/document'
import { formatFileSize } from '@shared/utils'
import type { PendingDocument } from '@renderer/stores/documentUploadStore'
import type { PendingImage } from '@renderer/stores/imageUploadStore'

export const DOC_MAX_SIZE = 10 * 1024 * 1024
export const SUPPORTED_DOC_TYPES = [...SUPPORTED_DOCUMENT_EXTENSIONS]
export const SUPPORTED_DOC_ACCEPT = SUPPORTED_DOCUMENT_ACCEPT
export { formatFileSize }

/**
 * 将待发送文档转换为消息附件
 */
export function toAttachedDocuments(documents: PendingDocument[]): AttachedDocument[] {
  return documents.map((doc) => ({
    fileName: doc.fileName,
    fileType: doc.fileType,
    fileSize: doc.fileSize,
    parsedContent: doc.parsedContent
  }))
}

/**
 * 将待发送图片转换为消息附件
 */
export function toAttachedImages(images: PendingImage[]): AttachedImage[] {
  return images.map((img) => ({
    fileName: img.fileName,
    mimeType: img.mimeType,
    width: img.width,
    height: img.height,
    originalSize: img.originalSize,
    compressedSize: img.compressedSize,
    base64Data: img.base64Data
  }))
}
