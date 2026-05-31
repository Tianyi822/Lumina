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
  listConfigs: () => Promise<{ success: boolean; data?: MCPServerConfig[]; error?: string }>
  getConfig: (
    name: string
  ) => Promise<{ success: boolean; data?: MCPServerConfig | null; error?: string }>
  saveConfig: (config: MCPServerConfig) => Promise<MCPConfigSaveResult>
  deleteConfig: (name: string) => Promise<MCPConfigSaveResult>
  importConfigs: (jsonContent: string) => Promise<MCPConfigImportResult>
  exportConfigs: () => Promise<{ success: boolean; data?: string; error?: string }>
  connect: (name: string) => Promise<MCPConnectResult>
  disconnect: (name: string) => Promise<{ success: boolean; error?: string }>
  reconnect: (name: string) => Promise<MCPConnectResult>
  getStatus: (
    serverName?: string
  ) => Promise<{ success: boolean; data?: MCPConnectionStatus[]; error?: string }>
  listTools: (
    serverName?: string
  ) => Promise<{ success: boolean; data?: MCPTool[]; error?: string }>
  listToolsByServer: () => Promise<{
    success: boolean
    data?: Record<string, MCPTool[]>
    error?: string
  }>
  callTool: (params: MCPToolCallParams) => Promise<MCPToolCallResult>
  testConnection: (config: MCPServerConfig) => Promise<MCPConnectResult>
  connectAll: () => Promise<{ success: boolean; data?: MCPConnectResult[]; error?: string }>
  disconnectAll: () => Promise<{ success: boolean; error?: string }>
  getConnectedServers: () => Promise<{ success: boolean; data?: string[]; error?: string }>
  onStatusChange: (callback: (event: MCPStatusChangeEvent) => void) => () => void
}
