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
  getStatus: () => Promise<KnowledgeMCPServerStatus>
  start: (port?: number) => Promise<{ success: boolean; error?: string }>
  stop: () => Promise<{ success: boolean }>
  getConfig: () => Promise<string>
  getLocalIP: () => Promise<string>
  updateConfig: (config: Partial<KnowledgeMCPConfig>) => Promise<{ success: boolean }>
  getCurrentConfig: () => Promise<KnowledgeMCPConfig>
  onStatusChange: (callback: (status: KnowledgeMCPServerStatus) => void) => () => void
}
