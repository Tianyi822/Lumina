import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { formatFileSize } from '@shared/utils'

/**
 * 待发送文档信息
 */
export interface PendingDocument {
  /** 文档名称 */
  fileName: string
  /** 文档类型 */
  fileType: string
  /** 文档大小（字节） */
  fileSize: number
  /** 解析后的文本内容 */
  parsedContent: string
}

/**
 * 处理中的文件状态
 */
export interface ProcessingFile {
  /** 临时 ID */
  tempId: string
  /** 文件名 */
  fileName: string
  /** 处理状态 */
  status: 'uploading' | 'parsing' | 'completed' | 'failed'
  /** 错误信息 */
  error?: string
}

/**
 * 文档上传 Store
 * 管理每个 Session 的文档上传和发送状态
 */
export const usePaperChatDocumentUploadStore = defineStore('paperChatDocumentUpload', () => {
  // ==================== State ====================

  // 每个 session 的待发送文档列表
  const pendingDocuments = ref<Map<string, PendingDocument[]>>(new Map())

  // 处理中的文件列表
  const processingFiles = ref<Map<string, ProcessingFile[]>>(new Map())

  // ==================== Getters ====================

  /**
   * 获取指定 session 的待发送文档列表
   */
  const getSessionDocuments = computed(() => {
    return (sessionId: string): PendingDocument[] => {
      return pendingDocuments.value.get(sessionId) || []
    }
  })

  /**
   * 获取指定 session 的处理中文件列表
   */
  const getSessionProcessingFiles = computed(() => {
    return (sessionId: string): ProcessingFile[] => {
      return processingFiles.value.get(sessionId) || []
    }
  })

  /**
   * 检查指定 session 是否有待发送的文档
   */
  const hasPendingDocuments = computed(() => {
    return (sessionId: string): boolean => {
      const docs = pendingDocuments.value.get(sessionId)
      return docs !== undefined && docs.length > 0
    }
  })

  // ==================== Actions ====================

  /**
   * 初始化 session 的文档状态
   */
  function initSession(sessionId: string): void {
    if (!pendingDocuments.value.has(sessionId)) {
      pendingDocuments.value.set(sessionId, [])
    }
    if (!processingFiles.value.has(sessionId)) {
      processingFiles.value.set(sessionId, [])
    }
  }

  /**
   * 上传并解析文档
   * @param sessionId 会话 ID
   * @param file 文件对象
   */
  async function uploadDocument(sessionId: string, file: File): Promise<void> {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // 初始化 session 状态
    initSession(sessionId)

    // 添加到处理中列表
    const processingList = processingFiles.value.get(sessionId)!
    processingList.push({
      tempId,
      fileName: file.name,
      status: 'uploading'
    })

    try {
      // 调用 IPC 上传和解析
      const result = await window.api.document.uploadAndParse(file)

      if (!result.success || !result.data) {
        throw new Error(result.error || '上传失败')
      }

      // 更新状态为完成
      const processingIndex = processingList.findIndex((f) => f.tempId === tempId)
      if (processingIndex !== -1) {
        processingList[processingIndex].status = 'completed'
      }

      // 添加到待发送列表
      const pendingList = pendingDocuments.value.get(sessionId)!
      pendingList.push({
        fileName: result.data.fileName,
        fileType: result.data.fileType,
        fileSize: result.data.fileSize,
        parsedContent: result.data.parsedContent
      })
    } catch (error) {
      // 更新状态为失败
      const processingIndex = processingList.findIndex((f) => f.tempId === tempId)
      if (processingIndex !== -1) {
        processingList[processingIndex].status = 'failed'
        processingList[processingIndex].error =
          error instanceof Error ? error.message : String(error)
      }

      throw error
    } finally {
      // 延迟移除处理中状态（让用户看到完成状态）
      setTimeout(() => {
        const currentList = processingFiles.value.get(sessionId)
        if (currentList) {
          const index = currentList.findIndex((f) => f.tempId === tempId)
          if (index !== -1) {
            currentList.splice(index, 1)
          }
        }
      }, 1500)
    }
  }

  /**
   * 批量上传文档
   * @param sessionId 会话 ID
   * @param files 文件列表
   */
  async function uploadMultipleDocuments(sessionId: string, files: File[]): Promise<void> {
    // 并行上传所有文件
    await Promise.all(files.map((file) => uploadDocument(sessionId, file)))
  }

  /**
   * 移除指定 session 的某个待发送文档
   * @param sessionId 会话 ID
   * @param index 文档索引
   */
  function removePendingDocument(sessionId: string, index: number): void {
    const pendingList = pendingDocuments.value.get(sessionId)
    if (pendingList && index >= 0 && index < pendingList.length) {
      pendingList.splice(index, 1)
    }
  }

  /**
   * 清空指定 session 的所有待发送文档
   * @param sessionId 会话 ID
   */
  function clearPendingDocuments(sessionId: string): void {
    pendingDocuments.value.set(sessionId, [])
  }

  /**
   * 获取指定 session 的所有待发送文档（用于发送消息）
   * @param sessionId 会话 ID
   * @returns 文档列表
   */
  function getPendingDocumentsForSending(sessionId: string): PendingDocument[] {
    return pendingDocuments.value.get(sessionId) || []
  }

  return {
    // State
    pendingDocuments,
    processingFiles,

    // Getters
    getSessionDocuments,
    getSessionProcessingFiles,
    hasPendingDocuments,

    // Actions
    initSession,
    uploadDocument,
    uploadMultipleDocuments,
    removePendingDocument,
    clearPendingDocuments,
    getPendingDocumentsForSending,
    formatFileSize
  }
})
