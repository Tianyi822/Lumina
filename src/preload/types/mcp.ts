/**
 * MCP 支持的传输方式
 */
export type MCPTransportType = 'stdio' | 'sse' | 'streamableHttp'

/**
 * MCP 服务器的配置
 */
export interface MCPServerConfig {
  name: string
  transport: MCPTransportType
  enabled: boolean
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

/**
 * MCP 工具输入参数的结构定义
 */
export interface MCPToolInputSchema {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

/**
 * MCP 工具的定义
 */
export interface MCPTool {
  name: string
  description: string
  inputSchema: MCPToolInputSchema
  serverName: string
}

/**
 * MCP 服务器的连接状态
 */
export interface MCPConnectionStatus {
  serverName: string
  connected: boolean
  error?: string
  tools: MCPTool[]
}

/**
 * MCP 连接的结果
 */
export interface MCPConnectResult {
  success: boolean
  serverName: string
  tools?: MCPTool[]
  error?: string
}

/**
 * MCP 配置保存的结果
 */
export interface MCPConfigSaveResult {
  success: boolean
  error?: string
}

/**
 * MCP 配置导入的结果
 */
export interface MCPConfigImportResult {
  success: boolean
  imported: number
  errors: string[]
}

/**
 * MCP 工具调用的参数
 */
export interface MCPToolCallParams {
  serverName: string
  toolName: string
  args: Record<string, unknown>
}

/**
 * MCP 工具调用的结果
 */
export interface MCPToolCallResult {
  success: boolean
  content?: unknown
  error?: string
}

/**
 * MCP 状态变更的事件
 */
export interface MCPStatusChangeEvent {
  type: 'connected' | 'disconnected' | 'error' | 'tools_updated'
  serverName: string
  data?: unknown
}

/**
 * MCP 相关的 API
 */
export interface MCPApi {
  listConfigs: () => Promise<MCPServerConfig[]>
  getConfig: (name: string) => Promise<MCPServerConfig | null>
  saveConfig: (config: MCPServerConfig) => Promise<MCPConfigSaveResult>
  deleteConfig: (name: string) => Promise<MCPConfigSaveResult>
  importConfigs: (jsonContent: string) => Promise<MCPConfigImportResult>
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
