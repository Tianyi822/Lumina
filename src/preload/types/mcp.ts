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
  /** 获取所有 MCP 服务器配置列表 */
  listConfigs: () => Promise<{ success: boolean; data?: MCPServerConfig[]; error?: string }>
  /** 获取单个 MCP 服务器配置 */
  getConfig: (
    name: string
  ) => Promise<{ success: boolean; data?: MCPServerConfig | null; error?: string }>
  /** 保存 MCP 服务器配置 */
  saveConfig: (config: MCPServerConfig) => Promise<MCPConfigSaveResult>
  /** 删除 MCP 服务器配置 */
  deleteConfig: (name: string) => Promise<MCPConfigSaveResult>
  /** 批量导入 MCP 服务器配置 */
  importConfigs: (jsonContent: string) => Promise<MCPConfigImportResult>
  /** 导出所有 MCP 配置到 JSON */
  exportConfigs: () => Promise<{ success: boolean; data?: string; error?: string }>
  /** 连接 MCP 服务器 */
  connect: (name: string) => Promise<MCPConnectResult>
  /** 断开 MCP 服务器连接 */
  disconnect: (name: string) => Promise<{ success: boolean; error?: string }>
  /** 重新连接 MCP 服务器 */
  reconnect: (name: string) => Promise<MCPConnectResult>
  /** 获取连接状态 */
  getStatus: (
    serverName?: string
  ) => Promise<{ success: boolean; data?: MCPConnectionStatus[]; error?: string }>
  /** 获取工具列表 */
  listTools: (
    serverName?: string
  ) => Promise<{ success: boolean; data?: MCPTool[]; error?: string }>
  /** 按服务器分组获取工具 */
  listToolsByServer: () => Promise<{
    success: boolean
    data?: Record<string, MCPTool[]>
    error?: string
  }>
  /** 调用 MCP 工具 */
  callTool: (params: MCPToolCallParams) => Promise<MCPToolCallResult>
  /** 测试 MCP 服务器连接 */
  testConnection: (config: MCPServerConfig) => Promise<MCPConnectResult>
  /** 连接所有已启用的服务器 */
  connectAll: () => Promise<{ success: boolean; data?: MCPConnectResult[]; error?: string }>
  /** 断开所有服务器连接 */
  disconnectAll: () => Promise<{ success: boolean; error?: string }>
  /** 获取已连接的服务器名称列表 */
  getConnectedServers: () => Promise<{ success: boolean; data?: string[]; error?: string }>
  /** 监听 MCP 状态变更事件 */
  onStatusChange: (callback: (event: MCPStatusChangeEvent) => void) => () => void
}
