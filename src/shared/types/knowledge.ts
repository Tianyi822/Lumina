/**
 * 表示一个被统一管理的文件
 */
export interface FileItem {
  /** 文件的唯一标识 */
  id: string
  /** 文件名 */
  name: string
  /** 文件的相对路径 */
  filePath: string
  /** 文件的绝对路径，用于直接读取文件内容 */
  absolutePath: string
  /** 文件类型 */
  fileType: string
  /** 文件大小，单位字节 */
  size: number
  /** 文件上传的时间 */
  uploadedAt: string
  /** 使用该文件的知识库 ID 列表 */
  usedByKBIds: string[]
  /** 文件内容的哈希值，用于去重 */
  contentHash?: string
}

/**
 * 知识库绑定的嵌入模型完整配置
 * 知识库创建时绑定，不依赖全局配置
 */
export interface KnowledgeBaseEmbeddingConfig {
  /** API 基础地址 */
  baseUrl: string
  /** 调用 API 需要的密钥 */
  apiKey?: string
  /** 使用的模型名称 */
  model: string
  /** 模型生成的向量维度 */
  dimensions: number
}

/**
 * 知识库的配置信息
 */
export interface KnowledgeBase {
  /** 知识库的唯一标识 */
  id: string
  /** 知识库名称 */
  name: string
  /** 知识库的描述信息 */
  description?: string
  /** 嵌入模型的完整配置，创建知识库时绑定 */
  embeddingConfig: KnowledgeBaseEmbeddingConfig
  /** 嵌入模型的向量维度 */
  embeddingDimension: number
  /** 文档分块的大小 */
  chunkSize: number
  /** 文档分块的重叠大小 */
  chunkOverlap: number
  /** 知识库创建时间 */
  createdAt: string
  /** 知识库最后更新时间 */
  updatedAt: string
  /** 文档数量，用于 UI 显示 */
  documentCount?: number
  /** 关联的文件 ID 列表 */
  linkedFileIds: string[]
}

/**
 * 文档的基本信息
 */
export interface Document {
  /** 文档的唯一标识 */
  id: string
  /** 所属知识库的 ID */
  kbId: string
  /** 文档名称 */
  name: string
  /** 文档类型 */
  fileType: string
  /** 文件大小，单位字节 */
  fileSize: number
  /** 文档分块后的块数量 */
  chunkCount: number
  /** 文档处理状态 */
  status: 'pending' | 'processing' | 'completed' | 'failed'
  /** 处理失败时的错误信息 */
  errorMessage?: string
  /** 文档创建时间 */
  createdAt: string
  /** 文档最后更新时间 */
  updatedAt: string
}

/**
 * 知识库引用信息
 * 用于聊天时传递用户选中的知识库
 */
export interface KnowledgeBaseReference {
  /** 知识库的唯一标识 */
  id: string
  /** 知识库的名称 */
  name: string
  /** 知识库的描述信息 */
  description?: string
  /** 知识库中包含的文档数量 */
  documentCount: number
}
