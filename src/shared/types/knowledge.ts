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
