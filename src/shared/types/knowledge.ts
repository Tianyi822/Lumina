/**
 * 文件项 - 统一管理的文件
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
  /** 使用此文件的知识库 ID 列表 */
  usedByKBIds: string[]
  /** 文件内容哈希，用于去重 */
  contentHash?: string
}

/**
 * 嵌入模型配置（知识库绑定的完整配置）
 */
export interface KnowledgeBaseEmbeddingConfig {
  /** API 基础 URL */
  baseUrl: string
  /** API 密钥 */
  apiKey?: string
  /** 模型名称 */
  model: string
  /** 向量维度 */
  dimensions: number
}

/**
 * 知识库配置
 */
export interface KnowledgeBase {
  id: string
  name: string
  description?: string
  /** 嵌入模型完整配置（创建时绑定，不依赖全局配置） */
  embeddingConfig: KnowledgeBaseEmbeddingConfig
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

/**
 * 知识库引用（用于聊天时传递选中的知识库）
 */
export interface KnowledgeBaseReference {
  /** 知识库 ID */
  id: string
  /** 知识库名称 */
  name: string
  /** 知识库描述 */
  description?: string
  /** 文档数量 */
  documentCount: number
}
