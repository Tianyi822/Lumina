import { create } from 'zustand'
import type {
  KnowledgeFileProcessingProgress,
  KnowledgeFileProgressEvent
} from '@shared/types/knowledge'

export type FileProcessingProgress = KnowledgeFileProcessingProgress
type FileProgressEvent = KnowledgeFileProgressEvent

interface KnowledgeIndexState {
  kbFileProgress: Record<string, Record<string, FileProcessingProgress>>
  activeIndexingKbId: string | null
  reindexingKbIds: Set<string>

  hasActiveIndexing: () => boolean
  isKBIndexing: (kbId: string) => boolean
  isKBReindexing: (kbId: string) => boolean
  getKBIndexingFiles: (kbId: string) => FileProcessingProgress[]
  getKBIndexingFilesMap: (kbId: string) => Record<string, FileProcessingProgress>
  getFileProgress: (kbId: string, fileId: string) => FileProcessingProgress | undefined

  setKBReindexing: (kbId: string, isReindexing: boolean) => void
  updateFileProgress: (kbId: string, progress: FileProcessingProgress) => void
  setFileIndexing: (kbId: string, fileId: string, fileName: string) => void
  setFilesIndexing: (kbId: string, files: Array<{ fileId: string; fileName: string }>) => void
  setFileFailed: (kbId: string, fileId: string, error: string) => void
  clearFileProgress: (kbId: string, fileId: string) => void
  clearKBProgress: (kbId: string) => void
  markIndexCallStarted: (kbId: string, fileId: string) => void
  markIndexCallFinished: (kbId: string, fileId: string) => void
  refreshFromBackend: () => Promise<void>
  restoreStatus: (kbId: string) => Promise<void>
  startRefresh: () => void
  stopRefresh: () => void
  setupIpcListeners: () => void
  cleanupIpcListeners: () => void
}

let progressCleanup: (() => void) | null = null
let refreshTimerId: number | null = null
const activeIndexCalls = new Set<string>()

export const useKnowledgeIndexStore = create<KnowledgeIndexState>()((set, get) => ({
  kbFileProgress: {},
  activeIndexingKbId: null,
  reindexingKbIds: new Set(),

  hasActiveIndexing: () => {
    return Object.values(get().kbFileProgress).some((files) =>
      Object.values(files).some((f) => f.status === 'processing')
    )
  },

  isKBIndexing: (kbId) => {
    const files = get().kbFileProgress[kbId]
    if (!files) return false
    return Object.values(files).some((f) => f.status === 'processing')
  },

  isKBReindexing: (kbId) => get().reindexingKbIds.has(kbId),

  getKBIndexingFiles: (kbId) => {
    const files = get().kbFileProgress[kbId]
    if (!files) return []
    return Object.values(files)
  },

  getKBIndexingFilesMap: (kbId) => get().kbFileProgress[kbId] || {},

  getFileProgress: (kbId, fileId) => get().kbFileProgress[kbId]?.[fileId],

  setKBReindexing: (kbId, isReindexing) =>
    set((state) => {
      const next = new Set(state.reindexingKbIds)
      if (isReindexing) next.add(kbId)
      else next.delete(kbId)
      return { reindexingKbIds: next }
    }),

  updateFileProgress: (kbId, progress) => {
    const state = get()
    const kbFiles = state.kbFileProgress[kbId] || {}
    const existing = kbFiles[progress.fileId]

    const newProgress: FileProcessingProgress = {
      ...progress,
      progress: Math.max(existing?.progress ?? 0, progress.progress ?? 0)
    }

    set({
      kbFileProgress: {
        ...state.kbFileProgress,
        [kbId]: { ...kbFiles, [progress.fileId]: newProgress }
      }
    })

    if (progress.status === 'completed' || progress.status === 'failed') {
      setTimeout(() => {
        get().clearFileProgress(kbId, progress.fileId)
      }, 1000)
    }
  },

  setFileIndexing: (kbId, fileId, fileName) => {
    const state = get()
    const kbFiles = state.kbFileProgress[kbId] || {}

    set({
      kbFileProgress: {
        ...state.kbFileProgress,
        [kbId]: {
          ...kbFiles,
          [fileId]: { fileId, fileName, status: 'processing' }
        }
      }
    })
  },

  setFilesIndexing: (kbId, files) => {
    const state = get()
    const kbFiles = state.kbFileProgress[kbId] || {}
    const newFiles: Record<string, FileProcessingProgress> = {}

    for (const file of files) {
      newFiles[file.fileId] = { fileId: file.fileId, fileName: file.fileName, status: 'processing' }
    }

    set({
      kbFileProgress: {
        ...state.kbFileProgress,
        [kbId]: { ...kbFiles, ...newFiles }
      }
    })
  },

  setFileFailed: (kbId, fileId, error) => {
    const state = get()
    const entry = state.kbFileProgress[kbId]?.[fileId]
    if (!entry) return

    set({
      kbFileProgress: {
        ...state.kbFileProgress,
        [kbId]: {
          ...state.kbFileProgress[kbId],
          [fileId]: { ...entry, status: 'failed', error }
        }
      }
    })

    setTimeout(() => {
      get().clearFileProgress(kbId, fileId)
    }, 1000)
  },

  markIndexCallStarted: (kbId, fileId) => {
    activeIndexCalls.add(`${kbId}:${fileId}`)
  },

  markIndexCallFinished: (kbId, fileId) => {
    activeIndexCalls.delete(`${kbId}:${fileId}`)
  },

  clearFileProgress: (kbId, fileId) => {
    const state = get()
    const kbFiles = state.kbFileProgress[kbId]
    if (!kbFiles?.[fileId]) return

    const newKbFiles = { ...kbFiles }
    delete newKbFiles[fileId]
    const next = { ...state.kbFileProgress, [kbId]: newKbFiles }

    set({ kbFileProgress: next })

    if (Object.keys(newKbFiles).length === 0 && !get().hasActiveIndexing()) {
      get().stopRefresh()
    }
  },

  clearKBProgress: (kbId) => {
    const next = { ...get().kbFileProgress }
    delete next[kbId]
    set({ kbFileProgress: next })
  },

  refreshFromBackend: async () => {
    try {
      const result = await window.api.knowledge.getIndexingStatus()
      if (!result.success || !result.data) return

      const { indexingFiles, activeIndexingKbId: activeKbId } = result.data
      set({ activeIndexingKbId: activeKbId })

      const groupedByKb: Record<string, FileProcessingProgress[]> = {}
      for (const file of indexingFiles) {
        if (!groupedByKb[file.kbId]) groupedByKb[file.kbId] = []
        groupedByKb[file.kbId].push({
          fileId: file.fileId,
          fileName: file.fileName || file.fileId,
          status: (file.status as FileProcessingProgress['status']) || 'processing',
          progress: file.progress
        })
      }

      const state = get()
      const nextProgress = { ...state.kbFileProgress }

      for (const [kbId, files] of Object.entries(groupedByKb)) {
        if (!nextProgress[kbId]) nextProgress[kbId] = {}

        for (const file of files) {
          const existing = nextProgress[kbId][file.fileId]
          nextProgress[kbId][file.fileId] = {
            ...file,
            progress: Math.max(existing?.progress ?? 0, file.progress ?? 0)
          }
        }
      }

      for (const [kbId, files] of Object.entries(nextProgress)) {
        const activeFileIds = new Set(groupedByKb[kbId]?.map((f) => f.fileId) || [])
        for (const [fileId, progress] of Object.entries(files)) {
          if (
            !activeFileIds.has(fileId) &&
            progress.status === 'processing' &&
            !activeIndexCalls.has(`${kbId}:${fileId}`)
          ) {
            nextProgress[kbId][fileId] = { ...progress, status: 'completed', progress: 100 }
            setTimeout(() => {
              get().clearFileProgress(kbId, fileId)
            }, 1000)
          }
        }
      }

      set({ kbFileProgress: nextProgress })
    } catch (error) {
      window.api.logger.error('[KnowledgeIndexStore] 刷新索引状态失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  restoreStatus: async (kbId) => {
    await get().refreshFromBackend()
    if (get().isKBIndexing(kbId)) {
      get().startRefresh()
    }
  },

  startRefresh: () => {
    if (refreshTimerId !== null) clearInterval(refreshTimerId)

    refreshTimerId = window.setInterval(async () => {
      if (get().hasActiveIndexing()) {
        await get().refreshFromBackend()
      } else {
        get().stopRefresh()
      }
    }, 2000)
  },

  stopRefresh: () => {
    if (refreshTimerId !== null) {
      clearInterval(refreshTimerId)
      refreshTimerId = null
    }
  },

  setupIpcListeners: () => {
    if (progressCleanup) return
    progressCleanup = window.api.onFileProgress((data: FileProgressEvent) => {
      get().updateFileProgress(data.kbId, data.progress)
    })
  },

  cleanupIpcListeners: () => {
    if (progressCleanup) {
      progressCleanup()
      progressCleanup = null
    }
    get().stopRefresh()
  }
}))

// 自动设置监听器
useKnowledgeIndexStore.getState().setupIpcListeners()
