import type { AttachedDocument, AttachedImage } from '@shared/types/chat'
import { SUPPORTED_DOCUMENT_ACCEPT } from '@shared/constants/document'
import { formatFileSize } from '@shared/utils'
import type { PendingDocument } from '@renderer/stores/paperChatDocumentUploadStore'
import type { PendingImage } from '@renderer/stores/paperChatImageUploadStore'

export const SUPPORTED_DOC_ACCEPT = SUPPORTED_DOCUMENT_ACCEPT
export { formatFileSize }

/** 将待发送文档列表转换为消息附件格式，供发送 API 使用 */
export function toPaperChatAttachedDocuments(documents: PendingDocument[]): AttachedDocument[] {
  return documents.map((doc) => ({
    fileName: doc.fileName,
    fileType: doc.fileType,
    fileSize: doc.fileSize,
    parsedContent: doc.parsedContent
  }))
}

/** 将待发送图片列表转换为消息附件格式，供发送 API 使用 */
export function toPaperChatAttachedImages(images: PendingImage[]): AttachedImage[] {
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
