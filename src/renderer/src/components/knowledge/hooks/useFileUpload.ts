import { useState, useCallback } from 'react'
import {
  SUPPORTED_DOCUMENT_EXTENSIONS,
  isSupportedDocumentExtension
} from '@shared/constants/document'
import { useFileStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { FileItem } from '@renderer/types'

const SUPPORTED_TYPES = [...SUPPORTED_DOCUMENT_EXTENSIONS]
const MAX_FILE_SIZE = 50 * 1024 * 1024

/** 文件上传结果：成功上传的、已存在的重复文件、错误信息 */
export interface UploadResult {
  uploaded: FileItem[]
  duplicates: FileItem[]
  errors: string[]
}

export interface UploadOptions {
  autoLinkToKB?: boolean
  kbId?: string
  onUploadComplete?: (result: UploadResult) => void
}

/** 文件拖拽/选择上传 Hook，支持格式校验、大小限制和自动挂载知识库 */
export function useFileUpload(options?: UploadOptions) {
  const fileStore = useFileStore()
  const notify = useNotification()

  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const validateFiles = useCallback(
    (fileList: File[]): { validFiles: File[]; errors: string[] } => {
      const validFiles: File[] = []
      const errors: string[] = []

      for (const file of fileList) {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase()
        if (!isSupportedDocumentExtension(ext)) {
          errors.push(`${file.name}: 不支持的文件格式`)
          continue
        }
        if (file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: 文件超过 50MB 限制`)
          continue
        }
        validFiles.push(file)
      }

      return { validFiles, errors }
    },
    []
  )

  const processUpload = useCallback(
    async (fileList: File[]): Promise<UploadResult> => {
      const { validFiles, errors: validationErrors } = validateFiles(fileList)

      if (validFiles.length === 0) {
        if (validationErrors.length > 0) {
          notify.error('文件验证失败', validationErrors.join('\n'), { source: 'file' })
        }
        return { uploaded: [], duplicates: [], errors: validationErrors }
      }

      setIsUploading(true)

      try {
        const result = await fileStore.uploadFiles(validFiles)

        if (options?.autoLinkToKB && options.kbId) {
          for (const file of result.uploaded) {
            await fileStore.linkFileToKB(file.id, options.kbId)
          }
          for (const file of result.duplicates) {
            await fileStore.linkFileToKB(file.id, options.kbId)
          }
        }

        const allErrors = [...validationErrors, ...result.errors]
        const finalResult: UploadResult = {
          uploaded: result.uploaded,
          duplicates: result.duplicates,
          errors: allErrors
        }

        options?.onUploadComplete?.(finalResult)
        return finalResult
      } finally {
        setIsUploading(false)
      }
    },
    [fileStore, notify, options, validateFiles]
  )

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    async (event: React.DragEvent): Promise<UploadResult> => {
      event.preventDefault()
      setIsDragging(false)
      const droppedFiles = Array.from(event.dataTransfer?.files || [])
      return processUpload(droppedFiles)
    },
    [processUpload]
  )

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>): Promise<UploadResult> => {
      const target = event.target
      const selectedFiles = Array.from(target.files || [])
      target.value = ''
      if (selectedFiles.length === 0) {
        return { uploaded: [], duplicates: [], errors: [] }
      }
      return processUpload(selectedFiles)
    },
    [processUpload]
  )

  return {
    isDragging,
    isUploading,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    processUpload,
    validateFiles,
    SUPPORTED_TYPES
  }
}
