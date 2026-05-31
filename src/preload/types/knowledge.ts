import type {
  KnowledgeBase,
  KnowledgeBaseStats,
  KnowledgeIndexingStatus,
  KnowledgeReindexOptions,
  KnowledgeReindexSummary,
  KnowledgeSearchResponse
} from '@shared/types/knowledge'

export type {
  FileItem,
  FileOriginInfo,
  FilePreviewData,
  FileSourceKind,
  KnowledgeBase,
  KnowledgeBaseEmbeddingConfig,
  KnowledgeBaseReference,
  KnowledgeBaseStats,
  KnowledgeFileProcessingProgress,
  KnowledgeFileProgressEvent,
  KnowledgeIndexInvalidatedFile,
  KnowledgeIndexInvalidationReason,
  KnowledgeIndexInvalidationState,
  KnowledgeIndexingFile,
  KnowledgeIndexingStatus,
  KnowledgeReindexOptions,
  KnowledgeReindexProgress,
  KnowledgeReindexProgressEvent,
  KnowledgeReindexScope,
  KnowledgeReindexSummary,
  KnowledgeSearchHit,
  KnowledgeSearchResponse
} from '@shared/types/knowledge'

/**
 * 知识库相关的 API
 */
export interface KnowledgeApi {
  getAll: () => Promise<{ success: boolean; data?: KnowledgeBase[]; error?: string }>
  getById: (id: string) => Promise<{ success: boolean; data?: KnowledgeBase; error?: string }>
  create: (
    data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<{ success: boolean; data?: KnowledgeBase; error?: string }>
  update: (
    id: string,
    updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>
  ) => Promise<{ success: boolean; data?: KnowledgeBase; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  indexFile: (kbId: string, fileId: string) => Promise<{ success: boolean; error?: string }>
  removeFileIndex: (kbId: string, fileId: string) => Promise<{ success: boolean; error?: string }>
  reindex: (
    kbId: string,
    fileIds: string[],
    options?: KnowledgeReindexOptions
  ) => Promise<{ success: boolean; data?: KnowledgeReindexSummary; error?: string }>
  search: (
    kbId: string,
    query: string,
    limit?: number
  ) => Promise<{ success: boolean; data?: KnowledgeSearchResponse; error?: string }>
  getStats: (
    kbId: string
  ) => Promise<{ success: boolean; data?: KnowledgeBaseStats; error?: string }>
  getDBSize: (
    kbId: string
  ) => Promise<{ success: boolean; data?: { size: number }; error?: string }>
  getIndexingStatus: () => Promise<{
    success: boolean
    data?: KnowledgeIndexingStatus
    error?: string
  }>
  stopIndexing: (
    kbId: string
  ) => Promise<{ success: boolean; data?: { stopped: boolean }; error?: string }>
}
