/**
 * 知识库 MCP 服务状态
 */
export interface KnowledgeMCPServerStatus {
  running: boolean
  port: number
  localIP: string
  url: string
  error?: string
}

/**
 * 知识库 MCP 服务配置
 */
export interface KnowledgeMCPConfig {
  enabled: boolean
  port: number
}

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
