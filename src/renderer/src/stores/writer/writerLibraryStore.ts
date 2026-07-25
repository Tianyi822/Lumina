import { create } from 'zustand'
import type { WriterDocument, WriterDocumentSummary, WriterFolder } from '@shared/types/writer'

export type WriterSidebarMode = 'documents' | 'outline'
export type WriterCollection = 'all' | 'favorites' | 'recent' | string

export interface WriterDocumentVirtualizationConfig {
  enabled: boolean
  scrollContainer: 'document-list'
  measureRows: boolean
}

export interface WriterSidebarDocumentRenderBucket {
  id: string
  placement: 'root' | 'folder' | 'collection'
  documents: WriterDocumentSummary[]
  virtualized: boolean
}

/** 返回文档列表的虚拟化策略，滚动容器只包裹可虚拟化的文档项。 */
export function getWriterDocumentVirtualizationConfig(
  documentCount: number
): WriterDocumentVirtualizationConfig {
  return {
    enabled: documentCount > 200,
    scrollContainer: 'document-list',
    measureRows: true
  }
}

/** 按文件夹分组，供侧边栏展开节点直接渲染其子文档。 */
export function groupWriterFolderDocuments(
  documents: WriterDocumentSummary[],
  folders: WriterFolder[]
): Array<{ folderId: string; documents: WriterDocumentSummary[] }> {
  return folders.map((folder) => ({
    folderId: folder.id,
    documents: sortDocuments(documents.filter((document) => document.folderId === folder.id))
  }))
}

/**
 * 为侧边栏生成互斥文档渲染节点：全部视图只在根节点和已展开文件夹间分配文档，
 * 收藏/最近视图则只有一个集合节点，避免同一文档出现多个操作入口。
 */
export function getWriterSidebarDocumentRenderPlan({
  documents,
  folders,
  collection,
  expandedFolderIds
}: {
  documents: WriterDocumentSummary[]
  folders: WriterFolder[]
  collection: WriterCollection
  expandedFolderIds: ReadonlySet<string>
}): WriterSidebarDocumentRenderBucket[] {
  if (collection !== 'all') {
    return [
      {
        id: 'collection',
        placement: 'collection',
        documents,
        virtualized: getWriterDocumentVirtualizationConfig(documents.length).enabled
      }
    ]
  }

  const rootDocuments = sortDocuments(documents.filter((document) => !document.folderId))
  const folderBuckets = folders
    .filter((folder) => expandedFolderIds.has(folder.id))
    .map((folder) => {
      const folderDocuments = sortDocuments(
        documents.filter((document) => document.folderId === folder.id)
      )
      return {
        id: folder.id,
        placement: 'folder' as const,
        documents: folderDocuments,
        virtualized: getWriterDocumentVirtualizationConfig(folderDocuments.length).enabled
      }
    })

  return [
    {
      id: 'root',
      placement: 'root',
      documents: rootDocuments,
      virtualized: getWriterDocumentVirtualizationConfig(rootDocuments.length).enabled
    },
    ...folderBuckets
  ]
}

export interface WriterLibraryStore {
  documents: WriterDocumentSummary[]
  folders: WriterFolder[]
  recentDocumentIds: string[]
  currentDocumentId: string | null
  searchQuery: string
  sidebarMode: WriterSidebarMode
  activeCollection: WriterCollection
  isLoading: boolean
  error: string | null

  load: () => Promise<void>
  createAndOpen: () => Promise<void>
  deletePermanently: (documentId: string) => Promise<boolean>
  deleteFolder: (folderId: string) => Promise<boolean>
  rename: (documentId: string, title: string) => Promise<boolean>
  move: (documentId: string, folderId?: string) => Promise<boolean>
  toggleFavorite: (documentId: string) => Promise<boolean>
  setSearchQuery: (query: string) => void
  setSidebarMode: (mode: WriterSidebarMode) => void
  setActiveCollection: (collection: WriterCollection) => void
  setCurrentDocumentId: (documentId: string | null) => void
  visibleDocuments: () => WriterDocumentSummary[]
}

function toSummary(document: WriterDocument): WriterDocumentSummary {
  return {
    id: document.id,
    revision: document.revision,
    title: document.title,
    folderId: document.folderId,
    favorite: document.favorite,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  }
}

function sortDocuments(documents: WriterDocumentSummary[]): WriterDocumentSummary[] {
  return [...documents].sort((left, right) => {
    if (left.favorite !== right.favorite) return left.favorite ? -1 : 1
    const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt)
    return byUpdatedAt !== 0 ? byUpdatedAt : left.id.localeCompare(right.id)
  })
}

function resultError(error: string | undefined, fallback: string): string {
  return error || fallback
}

/** 写作文档库状态，仅通过 preload 的 Result 契约更新本地列表。 */
export const useWriterLibraryStore = create<WriterLibraryStore>((set, get) => {
  function updateDocument(document: WriterDocument): void {
    const next = toSummary(document)
    set((state) => ({
      documents: sortDocuments([next, ...state.documents.filter((item) => item.id !== document.id)])
    }))
  }

  return {
    documents: [],
    folders: [],
    recentDocumentIds: [],
    currentDocumentId: null,
    searchQuery: '',
    sidebarMode: 'documents',
    activeCollection: 'all',
    isLoading: false,
    error: null,

    load: async () => {
      set({ isLoading: true, error: null })
      try {
        const result = await window.api.writer.list()
        if (!result.success || !result.data) {
          set({ isLoading: false, error: resultError(result.error, '加载文档失败') })
          return
        }
        const index = result.data
        set((state) => ({
          documents: sortDocuments(index.documents),
          folders: [...index.folders],
          recentDocumentIds: [...index.recentDocumentIds],
          currentDocumentId: index.documents.some((item) => item.id === state.currentDocumentId)
            ? state.currentDocumentId
            : null,
          isLoading: false,
          error: null
        }))
      } catch (error) {
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : '加载文档失败'
        })
      }
    },

    createAndOpen: async () => {
      set({ error: null })
      try {
        const result = await window.api.writer.create()
        if (!result.success || !result.data) {
          set({ error: resultError(result.error, '创建文档失败') })
          return
        }
        updateDocument(result.data)
        set({ currentDocumentId: result.data.id, error: null })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '创建文档失败' })
      }
    },

    deletePermanently: async (documentId) => {
      set({ error: null })
      try {
        const result = await window.api.writer.delete(documentId)
        if (!result.success) {
          set({ error: resultError(result.error, '删除文档失败') })
          return false
        }
        set((state) => ({
          documents: state.documents.filter((item) => item.id !== documentId),
          recentDocumentIds: state.recentDocumentIds.filter((item) => item !== documentId),
          currentDocumentId:
            state.currentDocumentId === documentId ? null : state.currentDocumentId,
          error: null
        }))
        return true
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '删除文档失败' })
        return false
      }
    },

    deleteFolder: async (folderId) => {
      set({ error: null })
      try {
        const result = await window.api.writer.deleteFolder(folderId)
        if (!result.success) {
          set({ error: resultError(result.error, '删除文件夹失败') })
          return false
        }
        set((state) => ({
          folders: state.folders.filter((folder) => folder.id !== folderId),
          documents: state.documents.map((document) =>
            document.folderId === folderId ? { ...document, folderId: undefined } : document
          ),
          activeCollection: state.activeCollection === folderId ? 'all' : state.activeCollection,
          error: null
        }))
        return true
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '删除文件夹失败' })
        return false
      }
    },

    rename: async (documentId, title) => {
      set({ error: null })
      try {
        const result = await window.api.writer.rename(documentId, title)
        if (!result.success || !result.data) {
          set({ error: resultError(result.error, '重命名文档失败') })
          return false
        }
        updateDocument(result.data)
        return true
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '重命名文档失败' })
        return false
      }
    },

    move: async (documentId, folderId) => {
      set({ error: null })
      try {
        const result = await window.api.writer.move(documentId, folderId)
        if (!result.success || !result.data) {
          set({ error: resultError(result.error, '移动文档失败') })
          return false
        }
        updateDocument(result.data)
        return true
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '移动文档失败' })
        return false
      }
    },

    toggleFavorite: async (documentId) => {
      const document = get().documents.find((item) => item.id === documentId)
      if (!document) {
        set({ error: '文档不存在' })
        return false
      }
      set({ error: null })
      try {
        const result = await window.api.writer.setFavorite(documentId, !document.favorite)
        if (!result.success || !result.data) {
          set({ error: resultError(result.error, '更新收藏失败') })
          return false
        }
        updateDocument(result.data)
        return true
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '更新收藏失败' })
        return false
      }
    },

    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setSidebarMode: (sidebarMode) => set({ sidebarMode }),
    setActiveCollection: (activeCollection) => set({ activeCollection }),
    setCurrentDocumentId: (currentDocumentId) => set({ currentDocumentId }),
    visibleDocuments: () => {
      const state = get()
      let documents = state.documents
      if (state.activeCollection === 'favorites') {
        documents = documents.filter((document) => document.favorite)
      } else if (state.activeCollection === 'recent') {
        const recentOrder = new Map(
          state.recentDocumentIds.map((documentId, index) => [documentId, index])
        )
        documents = documents
          .filter((document) => recentOrder.has(document.id))
          .sort((left, right) => recentOrder.get(left.id)! - recentOrder.get(right.id)!)
      } else if (state.activeCollection !== 'all') {
        documents = documents.filter((document) => document.folderId === state.activeCollection)
      }

      const query = state.searchQuery.trim().toLocaleLowerCase()
      if (query) {
        documents = documents.filter((document) =>
          document.title.toLocaleLowerCase().includes(query)
        )
      }
      return state.activeCollection === 'recent' ? documents : sortDocuments(documents)
    }
  }
})
