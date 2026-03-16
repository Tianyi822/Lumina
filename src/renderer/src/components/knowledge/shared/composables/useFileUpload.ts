/**
 * 文件上传 composable
 * 提供拖拽上传和点击上传的通用逻辑
 */

import { ref, type Ref } from 'vue'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'

/** 支持的文件类型 */
const SUPPORTED_TYPES = ['.txt', '.md', '.pdf', '.doc', '.docx', '.csv']

/** 最大文件大小 50MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024

/** 上传结果 */
export interface UploadResult {
  /** 上传成功的文件 */
  uploaded: FileItem[]
  /** 重复的文件 */
  duplicates: FileItem[]
  /** 错误信息 */
  errors: string[]
}

/** 上传选项 */
export interface UploadOptions {
  /** 上传成功后是否自动关联到知识库 */
  autoLinkToKB?: boolean
  /** 知识库 ID（用于自动关联） */
  kbId?: string
  /** 上传完成回调 */
  onUploadComplete?: (result: UploadResult) => void
}

/**
 * useFileUpload composable
 * @param options 上传选项
 */
export function useFileUpload(options?: UploadOptions): {
  isDragging: Ref<boolean>
  isUploading: Ref<boolean>
  handleDragOver: (event: DragEvent) => void
  handleDragLeave: (event: DragEvent) => void
  handleDrop: (event: DragEvent) => Promise<UploadResult>
  handleFileSelect: (event: Event) => Promise<UploadResult>
  processUpload: (fileList: File[]) => Promise<UploadResult>
  validateFiles: (fileList: File[]) => { validFiles: File[]; errors: string[] }
  SUPPORTED_TYPES: string[]
} {
  const fileStore = useFileStore()

  /** 是否正在拖拽 */
  const isDragging = ref(false)

  /** 是否正在上传 */
  const isUploading = ref(false)

  /**
   * 验证文件类型和大小
   * @param fileList 文件列表
   * @returns 有效的文件列表
   */
  function validateFiles(fileList: File[]): { validFiles: File[]; errors: string[] } {
    const validFiles: File[] = []
    const errors: string[] = []

    for (const file of fileList) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()

      // 检查文件类型
      if (!SUPPORTED_TYPES.includes(ext)) {
        errors.push(`${file.name}: 不支持的文件格式`)
        continue
      }

      // 检查文件大小
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: 文件超过 50MB 限制`)
        continue
      }

      validFiles.push(file)
    }

    return { validFiles, errors }
  }

  /**
   * 处理拖拽进入
   */
  function handleDragOver(event: DragEvent): void {
    event.preventDefault()
    isDragging.value = true
  }

  /**
   * 处理拖拽离开
   */
  function handleDragLeave(event: DragEvent): void {
    event.preventDefault()
    isDragging.value = false
  }

  /**
   * 处理拖拽放下
   */
  async function handleDrop(event: DragEvent): Promise<UploadResult> {
    event.preventDefault()
    isDragging.value = false

    const droppedFiles = Array.from(event.dataTransfer?.files || [])
    return processUpload(droppedFiles)
  }

  /**
   * 处理文件选择
   */
  async function handleFileSelect(event: Event): Promise<UploadResult> {
    const target = event.target as HTMLInputElement
    const selectedFiles = Array.from(target.files || [])
    // 重置 input 以便可以再次选择相同的文件
    target.value = ''

    if (selectedFiles.length === 0) {
      return { uploaded: [], duplicates: [], errors: [] }
    }

    return processUpload(selectedFiles)
  }

  /**
   * 执行上传
   */
  async function processUpload(fileList: File[]): Promise<UploadResult> {
    const { validFiles, errors: validationErrors } = validateFiles(fileList)

    if (validFiles.length === 0) {
      if (validationErrors.length > 0) {
        alert(`文件验证失败：\n${validationErrors.join('\n')}`)
      }
      return { uploaded: [], duplicates: [], errors: validationErrors }
    }

    // 如果有无效文件，提示用户
    if (validationErrors.length > 0 && validFiles.length < fileList.length) {
      alert(`部分文件格式不支持。仅支持 .txt、.md、.pdf、.doc、.docx 和 .csv 文件。`)
    }

    isUploading.value = true

    try {
      const result = await fileStore.uploadFiles(validFiles)

      // 如果配置了自动关联
      if (options?.autoLinkToKB && options.kbId) {
        // 关联新上传的文件
        for (const file of result.uploaded) {
          await fileStore.linkFileToKB(file.id, options.kbId)
        }
        // 关联重复的文件（如果未关联）
        for (const file of result.duplicates) {
          await fileStore.linkFileToKB(file.id, options.kbId)
        }
      }

      // 合并验证错误和上传错误
      const allErrors = [...validationErrors, ...result.errors]

      const finalResult: UploadResult = {
        uploaded: result.uploaded,
        duplicates: result.duplicates,
        errors: allErrors
      }

      // 调用完成回调
      options?.onUploadComplete?.(finalResult)

      return finalResult
    } finally {
      isUploading.value = false
    }
  }

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
