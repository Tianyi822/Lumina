/**
 * 知识库 MCP 服务相关类型定义
 */

/**
 * 知识库 MCP 服务配置
 */
export interface KnowledgeMCPConfig {
  /** 是否启用 MCP 服务 */
  enabled: boolean
  /** 服务监听端口 */
  port: number
}

/**
 * 知识库 MCP 服务状态
 */
export interface KnowledgeMCPServerStatus {
  /** 服务是否正在运行 */
  running: boolean
  /** 服务监听端口 */
  port: number
  /** 本机 IP 地址 */
  localIP: string
  /** 完整的服务 URL */
  url: string
  /** 错误信息（如果有） */
  error?: string
}

/**
 * MCP 客户端配置格式
 * 用于外部工具连接
 * @public preload/types/knowledgeMCP.ts 重导出作为 KnowledgeMCPApi 公共契约（knip 跨 barrel 假阳性）
 */
export interface MCPClientConfig {
  mcpServers: {
    [name: string]: {
      transport: 'streamableHttp'
      url: string
    }
  }
}

/**
 * 知识库搜索工具参数
 * @public preload/types/knowledgeMCP.ts 重导出作为 KnowledgeMCPApi 公共契约（knip 跨 barrel 假阳性）
 */
export interface KnowledgeSearchToolArgs {
  /** 搜索查询文本 */
  query: string
  /** 知识库ID（可选，不指定则搜索所有知识库） */
  knowledgeBaseId?: string
  /** 返回结果数量限制 */
  limit?: number
}

/**
 * 知识库搜索结果（用于 MCP 工具返回）
 */
export interface KnowledgeSearchResult {
  /** 知识库名称 */
  knowledgeBaseName: string
  /** 知识库ID */
  knowledgeBaseId: string
  /** 文件名 */
  fileName: string
  /** 内容片段 */
  content: string
  /** 相似度分数 */
  score: number
  /** 块索引（可选） */
  chunkIndex?: number
}

/**
 * 知识库列表项（用于 MCP 工具返回）
 */
export interface KnowledgeBaseListItem {
  /** 知识库ID */
  id: string
  /** 知识库名称 */
  name: string
  /** 知识库描述 */
  description?: string
  /** 文档数量 */
  documentCount: number
  /** 创建时间 */
  createdAt: string
}

/**
 * 知识库文档列表项（用于 MCP 工具返回）
 */
export interface KnowledgeDocumentListItem {
  /** 文档名称 */
  documentName: string
  /** 文档大小（格式化后的字符串，如 "1.5 MB"） */
  size: string
  /** 文档大小（原始字节数） */
  sizeBytes: number
  /** 上传时间 */
  uploadTime: string
  /** 文档类型 */
  documentType: string
}

/**
 * 默认配置
 */
export const DEFAULT_KNOWLEDGE_MCP_CONFIG: KnowledgeMCPConfig = {
  enabled: false,
  port: 3100
}
