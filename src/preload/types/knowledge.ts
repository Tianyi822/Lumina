/**
 * 文件的基本信息
 */
export interface FileItem {
  id: string
  name: string
  filePath: string
  /** 文件的绝对路径，用于直接读取文件内容 */
  absolutePath: string
  fileType: string
  size: number
  uploadedAt: string
  usedByKBIds: string[]
  contentHash?: string
}

/**
 * 知识库绑定的嵌入模型配置
 */
export interface KnowledgeBaseEmbeddingConfig {
  baseUrl: string
  apiKey?: string
  displayName?: string
  model: string
  dimensions: number
}

/**
 * 知识库的配置
 */
export interface KnowledgeBase {
  id: string
  name: string
  description?: string
  embeddingConfig: KnowledgeBaseEmbeddingConfig
  embeddingDimension: number
  chunkSize: number
  chunkOverlap: number
  createdAt: string
  updatedAt: string
  documentCount?: number
  linkedFileIds: string[]
}

/**
 * 搜索结果
 */
export interface SearchResult {
  chunkId: number
  fileId: string
  fileName: string
  content: string
  chunkIndex: number
  totalChunks: number
  similarity: number
}

/**
 * 重新索引的响应
 */
export interface ReindexResponse {
  indexedCount: number
  failedFiles: string[]
  failedErrors?: string[]
}

/**
 * 知识库的统计信息
 */
export interface KnowledgeBaseStats {
  fileCount: number
  chunkCount: number
  dbSize: number
}

/**
 * 文件处理的进度
 */
export interface FileProcessingProgress {
  fileId: string
  fileName: string
  status: 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
}

/**
 * 文件进度事件的数据
 */
export interface FileProgressEvent {
  kbId: string
  progress: FileProcessingProgress
}

/**
 * 重新索引进度事件的数据
 */
export interface ReindexProgressEvent {
  kbId: string
  progress: { current: number; total: number; currentFile?: string }
}

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
  indexFile: (
    kbId: string,
    fileId: string,
    filePath: string,
    fileName: string
  ) => Promise<{ success: boolean; error?: string }>
  removeFileIndex: (kbId: string, fileId: string) => Promise<{ success: boolean; error?: string }>
  reindex: (
    kbId: string,
    files: Array<{ fileId: string; filePath: string; fileName: string }>
  ) => Promise<{ success: boolean; data?: ReindexResponse; error?: string }>
  search: (
    kbId: string,
    query: string,
    limit?: number
  ) => Promise<{ success: boolean; data?: { results?: SearchResult[] }; error?: string }>
  getStats: (
    kbId: string
  ) => Promise<{ success: boolean; data?: KnowledgeBaseStats; error?: string }>
  getDBSize: (
    kbId: string
  ) => Promise<{ success: boolean; data?: { size: number }; error?: string }>
  getIndexingStatus: () => Promise<{
    success: boolean
    data?: {
      isIndexing: boolean
      indexingFiles: Array<{
        kbId: string
        fileId: string
        fileName?: string
        progress?: number
        status?: string
      }>
      activeIndexingKbId: string | null
      queueLength: number
    }
    error?: string
  }>
  stopIndexing: (
    kbId: string
  ) => Promise<{ success: boolean; data?: { stopped: boolean }; error?: string }>
  onFileProgress: (callback: (data: FileProgressEvent) => void) => () => void
  onReindexProgress: (callback: (data: ReindexProgressEvent) => void) => () => void
}
