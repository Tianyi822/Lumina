/**
 * MCP 协议相关的类型定义
 */

/**
 * MCP 支持的传输方式
 */
export type MCPTransportType = 'stdio' | 'sse' | 'streamableHttp'

/**
 * MCP 服务器的配置信息
 */
export interface MCPServerConfig {
  /** 服务器的名称 */
  name: string
  /** 使用的传输方式 */
  transport: MCPTransportType
  /** 该服务器是否启用 */
  enabled: boolean
  /** stdio 传输方式下执行的命令 */
  command?: string
  /** stdio 传输方式下命令的参数 */
  args?: string[]
  /** stdio 传输方式下的环境变量 */
  env?: Record<string, string>
  /** HTTP 或 SSE 传输方式下的服务地址 */
  url?: string
  /** HTTP 或 SSE 传输方式下的认证请求头 */
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
 * MCP 工具的完整定义
 */
export interface MCPTool {
  /** 工具的名称 */
  name: string
  /** 工具的描述 */
  description: string
  /** 工具输入参数的结构定义 */
  inputSchema: MCPToolInputSchema
  /** 所属的 MCP 服务器名称 */
  serverName: string
}

/**
 * MCP 服务器的连接状态
 */
export interface MCPConnectionStatus {
  /** MCP 服务器的名称 */
  serverName: string
  /** 是否已连接 */
  connected: boolean
  /** 连接失败时的错误信息 */
  error?: string
  /** 该服务器提供的工具列表 */
  tools: MCPTool[]
}

/**
 * MCP 配置保存操作的结果
 */
export interface MCPConfigSaveResult {
  /** 配置是否保存成功 */
  success: boolean
  /** 保存失败时的错误信息 */
  error?: string
}

/**
 * MCP 配置导入操作的结果
 */
export interface MCPConfigImportResult {
  /** 导入是否成功 */
  success: boolean
  /** 成功导入的服务器数量 */
  imported: number
  /** 导入过程中的错误信息列表 */
  errors: string[]
}

/**
 * MCP 连接操作的结果
 */
export interface MCPConnectResult {
  /** 连接是否成功 */
  success: boolean
  /** 服务器名称 */
  serverName: string
  /** 连接成功后获取到的工具列表 */
  tools?: MCPTool[]
  /** 连接失败时的错误信息 */
  error?: string
}

/**
 * MCP 工具调用的参数
 */
export interface MCPToolCallParams {
  /** MCP 服务器的名称 */
  serverName: string
  /** 工具的名称 */
  toolName: string
  /** 传递给工具的参数 */
  args: Record<string, unknown>
}

/**
 * MCP 工具调用的结果
 */
export interface MCPToolCallResult {
  /** 工具调用是否成功 */
  success: boolean
  /** 工具返回的内容 */
  content?: unknown
  /** 工具调用失败时的错误信息 */
  error?: string
}

/**
 * 标准 MCP 配置文件的格式
 * 用于从外部配置文件导入服务器配置
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
  /** MCP 服务器名称 */
  serverName: string
  /** 当前最新连接状态快照 */
  status: MCPConnectionStatus
}
