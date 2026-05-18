import { create } from 'zustand'
import { formatFileSize } from '@shared/utils'

export interface PendingImage {
  fileName: string
  mimeType: string
  width: number
  height: number
  originalSize: number
  compressedSize: number
  base64Data: string
  thumbnailData: string
}

export interface ProcessingImage {
  tempId: string
  fileName: string
  status: 'compressing' | 'completed' | 'failed'
  error?: string
}

interface PaperChatImageUploadState {
  pendingImages: Map<string, PendingImage[]>
  processingImages: Map<string, ProcessingImage[]>

  getSessionImages: (sessionId: string) => PendingImage[]
  getSessionProcessingImages: (sessionId: string) => ProcessingImage[]
  hasPendingImages: (sessionId: string) => boolean

  initSession: (sessionId: string) => void
  addImages: (
    sessionId: string,
    files: File[]
  ) => Promise<{ added: number; skipped: number; errors: string[] }>
  removeImage: (sessionId: string, index: number) => void
  clearImages: (sessionId: string) => void
  formatFileSize: (bytes: number) => string
}

export const usePaperChatImageUploadStore = create<PaperChatImageUploadState>()((set, get) => ({
  pendingImages: new Map(),
  processingImages: new Map(),

  getSessionImages: (sessionId) => get().pendingImages.get(sessionId) || [],
  getSessionProcessingImages: (sessionId) => get().processingImages.get(sessionId) || [],
  hasPendingImages: (sessionId) => {
    const imgs = get().pendingImages.get(sessionId)
    return imgs !== undefined && imgs.length > 0
  },

  initSession: (sessionId) =>
    set((state) => {
      const nextPending = new Map(state.pendingImages)
      const nextProcessing = new Map(state.processingImages)
      if (!nextPending.has(sessionId)) nextPending.set(sessionId, [])
      if (!nextProcessing.has(sessionId)) nextProcessing.set(sessionId, [])
      return { pendingImages: nextPending, processingImages: nextProcessing }
    }),

  addImages: async (sessionId, files) => {
    get().initSession(sessionId)

    const { compressImage, validateImageFile, normalizeImageFile, IMAGE_MAX_COUNT } =
      await import('../utils/imageCompress')

    const currentCount = (get().pendingImages.get(sessionId) || []).length
    const availableSlots = IMAGE_MAX_COUNT - currentCount
    const errors: string[] = []
    let added = 0
    let skipped = 0

    if (availableSlots <= 0) {
      errors.push(`已达到最大图片数量限制（${IMAGE_MAX_COUNT}张）`)
      return { added: 0, skipped: files.length, errors }
    }

    const filesToProcess = files.slice(0, availableSlots)
    if (files.length > availableSlots) {
      skipped = files.length - availableSlots
      errors.push(`超出数量限制，已忽略 ${skipped} 张图片`)
    }

    for (const [fileIndex, file] of filesToProcess.entries()) {
      const normalizedFile = normalizeImageFile(file, fileIndex)
      const validation = validateImageFile(normalizedFile)
      if (!validation.valid) {
        errors.push(validation.error || `图片 "${normalizedFile.name}" 验证失败`)
        skipped++
        continue
      }

      const tempId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      set((state) => {
        const next = new Map(state.processingImages)
        const list = [...(next.get(sessionId) || [])]
        list.push({ tempId, fileName: normalizedFile.name, status: 'compressing' })
        next.set(sessionId, list)
        return { processingImages: next }
      })

      try {
        const compressed = await compressImage(normalizedFile)

        set((state) => {
          const next = new Map(state.processingImages)
          const list = (next.get(sessionId) || []).map((f) =>
            f.tempId === tempId ? { ...f, status: 'completed' as const } : f
          )
          next.set(sessionId, list)
          return { processingImages: next }
        })

        set((state) => {
          const next = new Map(state.pendingImages)
          const list = [...(next.get(sessionId) || [])]
          list.push({
            fileName: compressed.fileName,
            mimeType: compressed.mimeType,
            width: compressed.width,
            height: compressed.height,
            originalSize: compressed.originalSize,
            compressedSize: compressed.compressedSize,
            base64Data: compressed.base64Data,
            thumbnailData: compressed.thumbnailData
          })
          next.set(sessionId, list)
          return { pendingImages: next }
        })

        added++
      } catch (error) {
        set((state) => {
          const next = new Map(state.processingImages)
          const list = (next.get(sessionId) || []).map((f) =>
            f.tempId === tempId
              ? {
                  ...f,
                  status: 'failed' as const,
                  error: error instanceof Error ? error.message : String(error)
                }
              : f
          )
          next.set(sessionId, list)
          return { processingImages: next }
        })

        const errorMessage = error instanceof Error ? error.message : String(error)
        errors.push(`图片 "${normalizedFile.name}" 压缩失败: ${errorMessage}`)
        skipped++
      } finally {
        setTimeout(() => {
          set((state) => {
            const next = new Map(state.processingImages)
            const list = (next.get(sessionId) || []).filter((f) => f.tempId !== tempId)
            next.set(sessionId, list)
            return { processingImages: next }
          })
        }, 1500)
      }
    }

    return { added, skipped, errors }
  },

  removeImage: (sessionId, index) =>
    set((state) => {
      const next = new Map(state.pendingImages)
      const list = [...(next.get(sessionId) || [])]
      if (index >= 0 && index < list.length) list.splice(index, 1)
      next.set(sessionId, list)
      return { pendingImages: next }
    }),

  clearImages: (sessionId) =>
    set((state) => {
      const next = new Map(state.pendingImages)
      next.set(sessionId, [])
      return { pendingImages: next }
    }),

  formatFileSize
}))

export { isImageFile } from '../utils/imageCompress'
