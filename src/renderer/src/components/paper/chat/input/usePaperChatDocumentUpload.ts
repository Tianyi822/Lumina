import { computed, type ComputedRef } from 'vue'
import { getFileExtension, isSupportedDocumentExtension } from '@shared/constants/document'
import {
  usePaperChatDocumentUploadStore,
  type PendingDocument,
  type ProcessingFile
} from '@renderer/stores/paperChatDocumentUploadStore'
import { DOC_MAX_SIZE, formatFileSize } from './attachmentUtils'

interface UseDocumentUploadReturn {
  pendingDocs: ComputedRef<PendingDocument[]>
  processingFiles: ComputedRef<ProcessingFile[]>
  uploadDocuments: (files: File[]) => Promise<string[]>
  removePendingDoc: (index: number) => void
  clearPendingDocs: () => void
}

/**
 * 文档上传逻辑
 */
export function usePaperChatDocumentUpload(
  sessionId: ComputedRef<string>
): UseDocumentUploadReturn {
  const documentStore = usePaperChatDocumentUploadStore()

  const pendingDocs = computed(() => documentStore.getSessionDocuments(sessionId.value))
  const processingFiles = computed(() => documentStore.getSessionProcessingFiles(sessionId.value))

  async function uploadDocuments(files: File[]): Promise<string[]> {
    const errors: string[] = []

    for (const file of files) {
      const extension = getFileExtension(file.name)

      if (!isSupportedDocumentExtension(extension)) {
        errors.push(`文件 "${file.name}" 格式不支持`)
        continue
      }

      if (file.size > DOC_MAX_SIZE) {
        window.api.logger.warn('[PaperChatInput] 文件过大', {
          fileName: file.name,
          size: file.size
        })
        errors.push(`文件 "${file.name}" 过大（${formatFileSize(file.size)}），最大支持 10MB`)
        continue
      }

      try {
        await documentStore.uploadDocument(sessionId.value, file)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        window.api.logger.error('[PaperChatInput] 上传文档失败', {
          fileName: file.name,
          error: errorMessage
        })
        errors.push(`上传文档 "${file.name}" 失败: ${errorMessage}`)
      }
    }

    return errors
  }

  function removePendingDoc(index: number): void {
    documentStore.removePendingDocument(sessionId.value, index)
  }

  function clearPendingDocs(): void {
    documentStore.clearPendingDocuments(sessionId.value)
  }

  return {
    pendingDocs,
    processingFiles,
    uploadDocuments,
    removePendingDoc,
    clearPendingDocs
  }
}
