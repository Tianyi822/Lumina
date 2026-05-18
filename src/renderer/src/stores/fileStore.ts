import { create } from 'zustand'
import type { FileItem } from '@renderer/types'
import { formatFileSize } from '@shared/utils'

interface FileState {
  files: FileItem[]
  loading: boolean
  searchQuery: string

  filteredFiles: () => FileItem[]

  loadFiles: () => Promise<void>
  searchFiles: (query: string) => void
  uploadFile: (
    file: File
  ) => Promise<{ success: boolean; file?: FileItem; isDuplicate?: boolean; error?: string }>
  uploadFiles: (
    filesParam: File[]
  ) => Promise<{ success: boolean; uploaded: FileItem[]; errors: string[]; duplicates: FileItem[] }>
  deleteFile: (
    fileId: string,
    forceDelete?: boolean
  ) => Promise<{ success: boolean; error?: string }>
  linkFileToKB: (fileId: string, kbId: string) => Promise<{ success: boolean; error?: string }>
  unlinkFileFromKB: (fileId: string, kbId: string) => Promise<{ success: boolean; error?: string }>
  getFilesByKBId: (kbId: string) => Promise<FileItem[]>
  getFileUsage: (fileId: string) => Promise<string[]>
  formatDate: (dateStr: string) => string
  formatFileSize: (bytes: number) => string
}

function logError(message: string, error: unknown, context?: Record<string, unknown>): void {
  window.api.logger.error(`[FileStore] ${message}`, {
    ...context,
    error: error instanceof Error ? error.message : String(error)
  })
}

export const useFileStore = create<FileState>()((set, get) => ({
  files: [],
  loading: false,
  searchQuery: '',

  filteredFiles: () => {
    const state = get()
    if (!state.searchQuery.trim()) {
      return state.files
    }
    const query = state.searchQuery.toLowerCase()
    return state.files.filter((file) => {
      const searchableText = [
        file.name,
        file.sourceKind,
        file.origin?.paperName,
        file.origin?.displayName,
        file.origin?.summary
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return searchableText.includes(query)
    })
  },

  loadFiles: async () => {
    try {
      set({ loading: true })
      const result = await window.api.file.list()
      if (result.success && result.data) {
        set({ files: result.data })
      } else {
        window.api.logger.error('[FileStore] 加载文件列表失败', { error: result.error })
      }
    } catch (error) {
      logError('加载文件列表失败', error)
    } finally {
      set({ loading: false })
    }
  },

  searchFiles: (query) => set({ searchQuery: query }),

  uploadFile: async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const result = await window.api.file.upload({
        data: uint8Array,
        name: file.name
      })

      if (result.success && result.file) {
        if (!result.isDuplicate) {
          set((state) => ({ files: [result.file!, ...state.files] }))
        }
        return { success: true, file: result.file, isDuplicate: result.isDuplicate }
      }

      return { success: false, error: result.error || '上传失败' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logError('上传文件失败', error, { fileName: file.name })
      return { success: false, error: errorMessage }
    }
  },

  uploadFiles: async (filesParam) => {
    const uploaded: FileItem[] = []
    const errors: string[] = []
    const duplicates: FileItem[] = []

    for (const file of filesParam) {
      const result = await get().uploadFile(file)
      if (result.success) {
        if (result.isDuplicate && result.file) {
          duplicates.push(result.file)
        } else if (result.file) {
          uploaded.push(result.file)
        }
      } else {
        errors.push(`${file.name}: ${result.error || '上传失败'}`)
      }
    }

    return {
      success: uploaded.length > 0 || duplicates.length > 0,
      uploaded,
      errors,
      duplicates
    }
  },

  deleteFile: async (fileId, forceDelete) => {
    try {
      const result = await window.api.file.delete(fileId, forceDelete)
      if (result.success) {
        set((state) => ({ files: state.files.filter((f) => f.id !== fileId) }))
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logError('删除文件失败', error, { fileId })
      return { success: false, error: errorMessage }
    }
  },

  linkFileToKB: async (fileId, kbId) => {
    try {
      const result = await window.api.file.linkToKB(fileId, kbId)
      if (result.success) {
        const file = get().files.find((f) => f.id === fileId)
        if (file && !file.usedByKBIds.includes(kbId)) {
          file.usedByKBIds.push(kbId)
        }
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logError('关联文件失败', error, { fileId, kbId })
      return { success: false, error: errorMessage }
    }
  },

  unlinkFileFromKB: async (fileId, kbId) => {
    try {
      const result = await window.api.file.unlinkFromKB(fileId, kbId)
      if (result.success) {
        const file = get().files.find((f) => f.id === fileId)
        if (file) {
          file.usedByKBIds = file.usedByKBIds.filter((id) => id !== kbId)
        }
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logError('取消关联失败', error, { fileId, kbId })
      return { success: false, error: errorMessage }
    }
  },

  getFilesByKBId: async (kbId) => {
    try {
      const result = await window.api.file.getByKBId(kbId)
      if (result.success && result.data) {
        return result.data
      }
      window.api.logger.error('[FileStore] 获取知识库文件列表失败', { kbId, error: result.error })
      return []
    } catch (error) {
      logError('获取知识库文件列表失败', error, { kbId })
      return []
    }
  },

  getFileUsage: async (fileId) => {
    try {
      const result = await window.api.file.getUsage(fileId)
      if (result.success && result.data) {
        return result.data
      }
      return []
    } catch (error) {
      logError('获取文件使用情况失败', error, { fileId })
      return []
    }
  },

  formatDate: (dateStr) => {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}/${month}/${day}`
  },

  formatFileSize
}))
