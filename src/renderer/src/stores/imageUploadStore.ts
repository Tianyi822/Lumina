import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  isImageFile,
  validateImageFile,
  compressImage,
  IMAGE_MAX_COUNT,
  normalizeImageFile
} from '../utils/imageCompress'
import type { CompressedImage } from '../utils/imageCompress'

/**
 * 待发送图片信息
 */
export interface PendingImage {
  /** 原始文件名 */
  fileName: string
  /** MIME 类型 */
  mimeType: string
  /** 压缩后宽度 */
  width: number
  /** 压缩后高度 */
  height: number
  /** 原始文件大小（字节） */
  originalSize: number
  /** 压缩后大小（字节） */
  compressedSize: number
  /** 完整 data URL */
  base64Data: string
  /** 缩略图 data URL */
  thumbnailData: string
}

/**
 * 处理中的图片状态
 */
export interface ProcessingImage {
  /** 临时 ID */
  tempId: string
  /** 文件名 */
  fileName: string
  /** 处理状态 */
  status: 'compressing' | 'completed' | 'failed'
  /** 错误信息 */
  error?: string
}

/**
 * 图片上传 Store
 * 管理每个 Session 的图片上传和发送状态
 */
export const useImageUploadStore = defineStore('imageUpload', () => {
  // ==================== State ====================

  // 每个 session 的待发送图片列表
  const pendingImages = ref<Map<string, PendingImage[]>>(new Map())

  // 处理中的图片列表
  const processingImages = ref<Map<string, ProcessingImage[]>>(new Map())

  // ==================== Getters ====================

  /**
   * 获取指定 session 的待发送图片列表
   */
  const getSessionImages = computed(() => {
    return (sessionId: string): PendingImage[] => {
      return pendingImages.value.get(sessionId) || []
    }
  })

  /**
   * 获取指定 session 的处理中图片列表
   */
  const getSessionProcessingImages = computed(() => {
    return (sessionId: string): ProcessingImage[] => {
      return processingImages.value.get(sessionId) || []
    }
  })

  /**
   * 检查指定 session 是否有待发送的图片
   */
  const hasPendingImages = computed(() => {
    return (sessionId: string): boolean => {
      const imgs = pendingImages.value.get(sessionId)
      return imgs !== undefined && imgs.length > 0
    }
  })

  // ==================== Actions ====================

  /**
   * 初始化 session 的图片状态
   */
  function initSession(sessionId: string): void {
    if (!pendingImages.value.has(sessionId)) {
      pendingImages.value.set(sessionId, [])
    }
    if (!processingImages.value.has(sessionId)) {
      processingImages.value.set(sessionId, [])
    }
  }

  /**
   * 添加多张图片
   * 验证数量限制后逐张压缩（串行避免内存峰值）
   * @param sessionId 会话 ID
   * @param files 文件列表（已经过 isImageFile 筛选）
   * @returns 添加结果信息
   */
  async function addImages(
    sessionId: string,
    files: File[]
  ): Promise<{ added: number; skipped: number; errors: string[] }> {
    initSession(sessionId)

    const currentCount = (pendingImages.value.get(sessionId) || []).length
    const availableSlots = IMAGE_MAX_COUNT - currentCount
    const errors: string[] = []
    let added = 0
    let skipped = 0

    if (availableSlots <= 0) {
      errors.push(`已达到最大图片数量限制（${IMAGE_MAX_COUNT}张）`)
      return { added: 0, skipped: files.length, errors }
    }

    // 截取可添加的文件数量
    const filesToProcess = files.slice(0, availableSlots)
    if (files.length > availableSlots) {
      skipped = files.length - availableSlots
      errors.push(`超出数量限制，已忽略 ${skipped} 张图片`)
    }

    // 逐张压缩（串行，避免内存峰值）
    for (const [fileIndex, file] of filesToProcess.entries()) {
      const normalizedFile = normalizeImageFile(file, fileIndex)

      // 验证文件
      const validation = validateImageFile(normalizedFile)
      if (!validation.valid) {
        errors.push(validation.error || `图片 "${normalizedFile.name}" 验证失败`)
        skipped++
        continue
      }

      const tempId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const processingList = processingImages.value.get(sessionId)!

      // 添加到处理中列表
      processingList.push({
        tempId,
        fileName: normalizedFile.name,
        status: 'compressing'
      })

      try {
        const compressed: CompressedImage = await compressImage(normalizedFile)

        // 更新状态为完成
        const processingIndex = processingList.findIndex((f) => f.tempId === tempId)
        if (processingIndex !== -1) {
          processingList[processingIndex].status = 'completed'
        }

        // 添加到待发送列表
        const pendingList = pendingImages.value.get(sessionId)!
        pendingList.push({
          fileName: compressed.fileName,
          mimeType: compressed.mimeType,
          width: compressed.width,
          height: compressed.height,
          originalSize: compressed.originalSize,
          compressedSize: compressed.compressedSize,
          base64Data: compressed.base64Data,
          thumbnailData: compressed.thumbnailData
        })

        added++
      } catch (error) {
        // 更新状态为失败
        const processingIndex = processingList.findIndex((f) => f.tempId === tempId)
        if (processingIndex !== -1) {
          processingList[processingIndex].status = 'failed'
          processingList[processingIndex].error =
            error instanceof Error ? error.message : String(error)
        }

        const errorMessage = error instanceof Error ? error.message : String(error)
        errors.push(`图片 "${normalizedFile.name}" 压缩失败: ${errorMessage}`)
        skipped++
      } finally {
        // 延迟移除处理中状态
        setTimeout(() => {
          const currentList = processingImages.value.get(sessionId)
          if (currentList) {
            const index = currentList.findIndex((f) => f.tempId === tempId)
            if (index !== -1) {
              currentList.splice(index, 1)
            }
          }
        }, 1500)
      }
    }

    return { added, skipped, errors }
  }

  /**
   * 移除指定 session 的某张待发送图片
   * @param sessionId 会话 ID
   * @param index 图片索引
   */
  function removeImage(sessionId: string, index: number): void {
    const pendingList = pendingImages.value.get(sessionId)
    if (pendingList && index >= 0 && index < pendingList.length) {
      pendingList.splice(index, 1)
    }
  }

  /**
   * 清空指定 session 的所有待发送图片
   * @param sessionId 会话 ID
   */
  function clearImages(sessionId: string): void {
    pendingImages.value.set(sessionId, [])
  }

  /**
   * 格式化文件大小
   */
  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return {
    // State
    pendingImages,
    processingImages,

    // Getters
    getSessionImages,
    getSessionProcessingImages,
    hasPendingImages,

    // Actions
    initSession,
    addImages,
    removeImage,
    clearImages,
    formatFileSize
  }
})

// 重新导出工具函数供外部使用
export { isImageFile }
