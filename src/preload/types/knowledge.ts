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
  KnowledgeBase,
  KnowledgeBaseEmbeddingConfig,
  KnowledgeBaseReference,
  KnowledgeBaseStats,
  KnowledgeFileProcessingProgress,
  KnowledgeFileProgressEvent,
  KnowledgeIndexInvalidatedFile,
  KnowledgeIndexInvalidationState,
  KnowledgeIndexingStatus,
  KnowledgeReindexOptions,
  KnowledgeReindexProgressEvent,
  KnowledgeReindexSummary,
  KnowledgeSearchHit,
  KnowledgeSearchResponse
} from '@shared/types/knowledge'

/**
 * 知识库相关的 API
 */
export interface KnowledgeApi {
  /** 获取所有知识库列表 */
  getAll: () => Promise<{ success: boolean; data?: KnowledgeBase[]; error?: string }>
  /** 根据 ID 获取知识库详情 */
  getById: (id: string) => Promise<{ success: boolean; data?: KnowledgeBase; error?: string }>
  /** 创建新知识库 */
  create: (
    data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<{ success: boolean; data?: KnowledgeBase; error?: string }>
  /** 更新知识库信息 */
  update: (
    id: string,
    updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>
  ) => Promise<{ success: boolean; data?: KnowledgeBase; error?: string }>
  /** 删除知识库 */
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  /** 将文件索引到知识库 */
  indexFile: (kbId: string, fileId: string) => Promise<{ success: boolean; error?: string }>
  /** 从知识库移除文件索引 */
  removeFileIndex: (kbId: string, fileId: string) => Promise<{ success: boolean; error?: string }>
  /** 重新索引知识库中的文件 */
  reindex: (
    kbId: string,
    fileIds: string[],
    options?: KnowledgeReindexOptions
  ) => Promise<{ success: boolean; data?: KnowledgeReindexSummary; error?: string }>
  /** 在知识库中搜索相关内容 */
  search: (
    kbId: string,
    query: string,
    limit?: number
  ) => Promise<{ success: boolean; data?: KnowledgeSearchResponse; error?: string }>
  /** 获取知识库的统计信息 */
  getStats: (
    kbId: string
  ) => Promise<{ success: boolean; data?: KnowledgeBaseStats; error?: string }>
  /** 获取知识库向量数据库的大小 */
  getDBSize: (
    kbId: string
  ) => Promise<{ success: boolean; data?: { size: number }; error?: string }>
  /** 获取当前索引状态 */
  getIndexingStatus: () => Promise<{
    success: boolean
    data?: KnowledgeIndexingStatus
    error?: string
  }>
  /** 停止知识库的索引操作 */
  stopIndexing: (
    kbId: string
  ) => Promise<{ success: boolean; data?: { stopped: boolean }; error?: string }>
}
