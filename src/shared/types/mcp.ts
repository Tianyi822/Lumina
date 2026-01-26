/**
 * MCP (Model Context Protocol) 类型定义
 */

/**
 * MCP 传输类型
 */
export type MCPTransportType = 'stdio' | 'sse' | 'streamableHttp'

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
  /** 服务名称 */
  name: string
  /** 传输类型 */
  transport: MCPTransportType
  /** 是否启用 */
  enabled: boolean
  /** stdio 执行命令 */
  command?: string
  /** stdio 命令参数 */
  args?: string[]
  /** stdio 环境变量 */
  env?: Record<string, string>
  /** HTTP/SSE 服务地址 */
  url?: string
  /** HTTP/SSE 认证头 */
  headers?: Record<string, string>
}

/**
 * MCP 工具输入 Schema
 */
export interface MCPToolInputSchema {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 输入参数 Schema */
  inputSchema: MCPToolInputSchema
  /** 所属服务器名称 */
  serverName: string
}

/**
 * MCP 连接状态
 */
export interface MCPConnectionStatus {
  /** 服务器名称 */
  serverName: string
  /** 是否已连接 */
  connected: boolean
  /** 错误信息 */
  error?: string
  /** 工具列表 */
  tools: MCPTool[]
}

/**
 * MCP 配置保存结果
 */
export interface MCPConfigSaveResult {
  success: boolean
  error?: string
}

/**
 * MCP 配置导入结果
 */
export interface MCPConfigImportResult {
  success: boolean
  imported: number
  errors: string[]
}

/**
 * MCP 连接结果
 */
export interface MCPConnectResult {
  success: boolean
  serverName: string
  tools?: MCPTool[]
  error?: string
}

/**
 * MCP 工具调用参数
 */
export interface MCPToolCallParams {
  serverName: string
  toolName: string
  args: Record<string, unknown>
}

/**
 * MCP 工具调用结果
 */
export interface MCPToolCallResult {
  success: boolean
  content?: unknown
  error?: string
}

/**
 * 标准 MCP 配置文件格式（用于导入）
 */
export interface MCPConfigFile {
  mcpServers: {
    [name: string]: {
      command?: string
      args?: string[]
      env?: Record<string, string>
      url?: string
      headers?: Record<string, string>
    }
  }
}

/**
 * MCP 状态变更事件
 */
export interface MCPStatusChangeEvent {
  type: 'connected' | 'disconnected' | 'error' | 'tools_updated'
  serverName: string
  data?: unknown
}
