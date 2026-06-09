import type { KnowledgeMCPConfig, KnowledgeMCPServerStatus } from '@shared/types/knowledgeMCP'

export type {
  DEFAULT_KNOWLEDGE_MCP_CONFIG,
  KnowledgeBaseListItem,
  KnowledgeDocumentListItem,
  KnowledgeMCPConfig,
  KnowledgeMCPServerStatus,
  KnowledgeSearchResult as KnowledgeMCPSearchResult,
  KnowledgeSearchToolArgs,
  MCPClientConfig
} from '@shared/types/knowledgeMCP'

/**
 * 知识库 MCP 服务 API
 */
export interface KnowledgeMCPApi {
  /** 获取知识库 MCP 服务的运行状态 */
  getStatus: () => Promise<KnowledgeMCPServerStatus>
  /** 启动知识库 MCP 服务 */
  start: (port?: number) => Promise<{ success: boolean; error?: string }>
  /** 停止知识库 MCP 服务 */
  stop: () => Promise<{ success: boolean }>
  /** 获取 MCP 配置 JSON（用于外部工具连接） */
  getConfig: () => Promise<string>
  /** 获取本机 IP 地址 */
  getLocalIP: () => Promise<string>
  /** 更新服务配置 */
  updateConfig: (config: Partial<KnowledgeMCPConfig>) => Promise<{ success: boolean }>
  /** 获取当前配置 */
  getCurrentConfig: () => Promise<KnowledgeMCPConfig>
  /** 监听服务状态变更事件 */
  onStatusChange: (callback: (status: KnowledgeMCPServerStatus) => void) => () => void
}
