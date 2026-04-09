import type {
  MCPConfigImportResult,
  MCPConfigSaveResult,
  MCPConnectResult,
  MCPConnectionStatus,
  MCPServerConfig,
  MCPStatusChangeEvent,
  MCPTool,
  MCPToolCallParams,
  MCPToolCallResult
} from '@shared/types/mcp'

export type {
  MCPConfigFile,
  MCPConfigImportResult,
  MCPConfigSaveResult,
  MCPConnectResult,
  MCPConnectionStatus,
  MCPServerConfig,
  MCPStatusChangeEvent,
  MCPTool,
  MCPToolCallParams,
  MCPToolCallResult,
  MCPToolInputSchema,
  MCPTransportType
} from '@shared/types/mcp'

/**
 * MCP 相关的 API
 */
export interface MCPApi {
  listConfigs: () => Promise<MCPServerConfig[]>
  getConfig: (name: string) => Promise<MCPServerConfig | null>
  saveConfig: (config: MCPServerConfig) => Promise<MCPConfigSaveResult>
  deleteConfig: (name: string) => Promise<MCPConfigSaveResult>
  importConfigs: (jsonContent: string) => Promise<MCPConfigImportResult>
  exportConfigs: () => Promise<string>
  connect: (name: string) => Promise<MCPConnectResult>
  disconnect: (name: string) => Promise<{ success: boolean }>
  reconnect: (name: string) => Promise<MCPConnectResult>
  getStatus: (serverName?: string) => Promise<MCPConnectionStatus[]>
  listTools: (serverName?: string) => Promise<MCPTool[]>
  listToolsByServer: () => Promise<Record<string, MCPTool[]>>
  callTool: (params: MCPToolCallParams) => Promise<MCPToolCallResult>
  testConnection: (config: MCPServerConfig) => Promise<MCPConnectResult>
  connectAll: () => Promise<MCPConnectResult[]>
  disconnectAll: () => Promise<{ success: boolean }>
  getConnectedServers: () => Promise<string[]>
  onStatusChange: (callback: (event: MCPStatusChangeEvent) => void) => () => void
}
