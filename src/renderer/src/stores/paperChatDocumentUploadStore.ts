import { create } from 'zustand'
import { formatFileSize } from '@shared/utils'

export interface PendingDocument {
  fileName: string
  fileType: string
  fileSize: number
  parsedContent: string
}

export interface ProcessingFile {
  tempId: string
  fileName: string
  status: 'uploading' | 'parsing' | 'completed' | 'failed'
  error?: string
}

// 未初始化会话必须复用同一空数组，否则 useSyncExternalStore 每次取到新引用会无限重渲染
const EMPTY_DOCUMENTS: PendingDocument[] = []
const EMPTY_PROCESSING_FILES: ProcessingFile[] = []

interface PaperChatDocumentUploadState {
  pendingDocuments: Map<string, PendingDocument[]>
  processingFiles: Map<string, ProcessingFile[]>

  getSessionDocuments: (sessionId: string) => PendingDocument[]
  getSessionProcessingFiles: (sessionId: string) => ProcessingFile[]
  hasPendingDocuments: (sessionId: string) => boolean

  initSession: (sessionId: string) => void
  uploadDocument: (sessionId: string, file: File) => Promise<void>
  uploadMultipleDocuments: (sessionId: string, files: File[]) => Promise<void>
  removePendingDocument: (sessionId: string, index: number) => void
  clearPendingDocuments: (sessionId: string) => void
  getPendingDocumentsForSending: (sessionId: string) => PendingDocument[]
  formatFileSize: (bytes: number) => string
}

export const usePaperChatDocumentUploadStore = create<PaperChatDocumentUploadState>()(
  (set, get) => ({
    pendingDocuments: new Map(),
    processingFiles: new Map(),

    getSessionDocuments: (sessionId) => get().pendingDocuments.get(sessionId) || EMPTY_DOCUMENTS,
    getSessionProcessingFiles: (sessionId) =>
      get().processingFiles.get(sessionId) || EMPTY_PROCESSING_FILES,
    hasPendingDocuments: (sessionId) => {
      const docs = get().pendingDocuments.get(sessionId)
      return docs !== undefined && docs.length > 0
    },

    initSession: (sessionId) =>
      set((state) => {
        const nextPending = new Map(state.pendingDocuments)
        const nextProcessing = new Map(state.processingFiles)
        if (!nextPending.has(sessionId)) nextPending.set(sessionId, [])
        if (!nextProcessing.has(sessionId)) nextProcessing.set(sessionId, [])
        return { pendingDocuments: nextPending, processingFiles: nextProcessing }
      }),

    uploadDocument: async (sessionId, file) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      get().initSession(sessionId)

      set((state) => {
        const next = new Map(state.processingFiles)
        const list = [...(next.get(sessionId) || [])]
        list.push({ tempId, fileName: file.name, status: 'uploading' })
        next.set(sessionId, list)
        return { processingFiles: next }
      })

      try {
        const result = await window.api.document.uploadAndParse(file)

        if (!result.success || !result.data) {
          throw new Error(result.error || '上传失败')
        }

        set((state) => {
          const next = new Map(state.processingFiles)
          const list = (next.get(sessionId) || []).map((f) =>
            f.tempId === tempId ? { ...f, status: 'completed' as const } : f
          )
          next.set(sessionId, list)
          return { processingFiles: next }
        })

        set((state) => {
          const next = new Map(state.pendingDocuments)
          const list = [...(next.get(sessionId) || [])]
          list.push({
            fileName: result.data!.fileName,
            fileType: result.data!.fileType,
            fileSize: result.data!.fileSize,
            parsedContent: result.data!.parsedContent
          })
          next.set(sessionId, list)
          return { pendingDocuments: next }
        })
      } catch (error) {
        set((state) => {
          const next = new Map(state.processingFiles)
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
          return { processingFiles: next }
        })
        throw error
      } finally {
        setTimeout(() => {
          set((state) => {
            const next = new Map(state.processingFiles)
            const list = (next.get(sessionId) || []).filter((f) => f.tempId !== tempId)
            next.set(sessionId, list)
            return { processingFiles: next }
          })
        }, 1500)
      }
    },

    uploadMultipleDocuments: async (sessionId, files) => {
      await Promise.all(files.map((file) => get().uploadDocument(sessionId, file)))
    },

    removePendingDocument: (sessionId, index) =>
      set((state) => {
        const next = new Map(state.pendingDocuments)
        const list = [...(next.get(sessionId) || [])]
        if (index >= 0 && index < list.length) list.splice(index, 1)
        next.set(sessionId, list)
        return { pendingDocuments: next }
      }),

    clearPendingDocuments: (sessionId) =>
      set((state) => {
        const next = new Map(state.pendingDocuments)
        next.set(sessionId, [])
        return { pendingDocuments: next }
      }),

    getPendingDocumentsForSending: (sessionId) => get().pendingDocuments.get(sessionId) || [],

    formatFileSize
  })
)
