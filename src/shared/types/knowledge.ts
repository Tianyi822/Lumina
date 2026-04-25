/**
 * 文件资源来源类型
 */
export type FileSourceKind = 'uploaded' | 'paper_file' | 'paper_note'

/**
 * 文件资源来源元信息
 */
export interface FileOriginInfo {
  /** 来源论文 ID */
  paperId?: string
  /** 来源论文批注 ID */
  annotationId?: string
  /** 来源论文名称 */
  paperName?: string
  /** 来源显示名称 */
  displayName?: string
  /** 列表与预览中展示的摘要 */
  summary?: string
  /** 论文笔记生成的索引内容 */
  noteContent?: string
  /** 资源能否用系统默认程序打开 */
  allowExternalOpen?: boolean
  /** 资源能否在文件管理中直接删除 */
  allowDelete?: boolean
  /** 论文笔记选中的原文或译文 */
  selectedText?: string
  /** 论文笔记创建视图 */
  viewKind?: 'original' | 'translation'
  /** 最近更新时间 */
  updatedAt?: string
}

/**
 * 表示一个被统一管理的知识库资源
 */
export interface FileItem {
  /** 文件的唯一标识 */
  id: string
  /** 文件名 */
  name: string
  /** 文件的相对路径或虚拟资源路径 */
  filePath: string
  /** 文件的绝对路径，用于直接读取文件内容；虚拟资源可为空 */
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
  /** 文件资源来源 */
  sourceKind: FileSourceKind
  /** 来源元信息 */
  origin?: FileOriginInfo
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
  /** 创建知识库时选中的模型显示名称 */
  displayName?: string
  /** 使用的模型名称 */
  model: string
  /** 模型生成的向量维度 */
  dimensions: number
}

/**
 * 知识库索引失效原因
 */
export type KnowledgeIndexInvalidationReason = 'paper_note_updated'

/**
 * 导致索引失效的文件信息
 */
export interface KnowledgeIndexInvalidatedFile {
  /** 文件 ID */
  fileId: string
  /** 文件名 */
  fileName: string
  /** 来源论文 ID */
  paperId?: string
  /** 来源论文批注 ID */
  annotationId?: string
  /** 文件最近更新时间 */
  updatedAt: string
}

/**
 * 知识库索引失效状态
 */
export interface KnowledgeIndexInvalidationState {
  /** 是否需要重新索引 */
  needsReindex: boolean
  /** 失效原因 */
  reason: KnowledgeIndexInvalidationReason
  /** 标记时间 */
  markedAt: string
  /** 受影响文件列表 */
  files: KnowledgeIndexInvalidatedFile[]
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
  /** 索引失效状态 */
  indexInvalidation?: KnowledgeIndexInvalidationState
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

/**
 * 文件预览数据
 */
export interface FilePreviewData {
  /** 文件提取的文本内容 */
  content: string
  /** 文件名 */
  fileName: string
  /** 文件类型 */
  fileType: string
  /** 文件大小（字节） */
  fileSize: number
  /** 文件上传时间 */
  uploadedAt: string
  /** 内容是否因过长而截断 */
  isTruncated: boolean
}

/**
 * 知识库搜索命中的文档块
 */
export interface KnowledgeSearchHit {
  /** 向量索引中的块 ID */
  chunkId: number
  /** 文件 ID */
  fileId: string
  /** 文件名 */
  fileName: string
  /** 命中的文档内容 */
  content: string
  /** 块在原文中的序号 */
  chunkIndex: number
  /** 原文总块数 */
  totalChunks: number
  /** 相似度分数 */
  similarity: number
}

/**
 * 知识库搜索结果包装结构
 */
export interface KnowledgeSearchResponse {
  results?: KnowledgeSearchHit[]
}

/**
 * 重新索引完成后的汇总结果
 */
export interface KnowledgeReindexSummary {
  indexedCount: number
  failedFiles: string[]
  failedErrors?: string[]
}

/**
 * 知识库统计信息
 */
export interface KnowledgeBaseStats {
  fileCount: number
  chunkCount: number
  dbSize: number
}

/**
 * 文件索引进度
 */
export interface KnowledgeFileProcessingProgress {
  fileId: string
  fileName: string
  status: 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
}

/**
 * 文件索引进度事件
 */
export interface KnowledgeFileProgressEvent {
  kbId: string
  progress: KnowledgeFileProcessingProgress
}

/**
 * 重建索引进度
 */
export interface KnowledgeReindexProgress {
  current: number
  total: number
  currentFile?: string
}

/**
 * 重建索引进度事件
 */
export interface KnowledgeReindexProgressEvent {
  kbId: string
  progress: KnowledgeReindexProgress
}

/**
 * 当前索引中的文件条目
 */
export interface KnowledgeIndexingFile {
  kbId: string
  fileId: string
  fileName?: string
  progress?: number
  status?: KnowledgeFileProcessingProgress['status']
}

/**
 * 全局索引状态
 */
export interface KnowledgeIndexingStatus {
  isIndexing: boolean
  indexingFiles: KnowledgeIndexingFile[]
  activeIndexingKbId: string | null
  queueLength: number
}
