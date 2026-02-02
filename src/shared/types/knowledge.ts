/**
 * 文件项 - 统一管理的文件
 */
export interface FileItem {
  id: string
  name: string
  filePath: string
  fileType: string
  size: number
  uploadedAt: string
  /** 使用此文件的知识库 ID 列表 */
  usedByKBIds: string[]
  /** 文件内容哈希，用于去重 */
  contentHash?: string
}

/**
 * 知识库配置
 */
export interface KnowledgeBase {
  id: string
  name: string
  description?: string
  embeddingModel: string
  embeddingDimension: number
  chunkSize: number
  chunkOverlap: number
  createdAt: string
  updatedAt: string
  documentCount?: number // UI 用的统计信息
  /** 关联的文件 ID 列表 */
  linkedFileIds: string[]
}

/**
 * 文档信息
 */
export interface Document {
  id: string
  kbId: string
  name: string
  fileType: string
  fileSize: number
  chunkCount: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage?: string
  createdAt: string
  updatedAt: string
}
