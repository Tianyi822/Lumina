import { ipcRenderer } from 'electron'
import { createIpcListener } from './base'

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
 * MCP 工具的定义
 */
export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
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
  serverName: string
  status: MCPConnectionStatus
}

/**
 * MCP 相关的 API
 */
export const mcpApi = {
  /**
   * 获取所有 MCP 服务器配置
   */
  listConfigs: (): Promise<MCPServerConfig[]> => {
    return ipcRenderer.invoke('mcp:listConfigs')
  },

  /**
   * 获取单个 MCP 服务器配置
   */
  getConfig: (name: string): Promise<MCPServerConfig | null> => {
    return ipcRenderer.invoke('mcp:getConfig', name)
  },

  /**
   * 保存 MCP 服务器配置
   */
  saveConfig: (config: MCPServerConfig): Promise<MCPConfigSaveResult> => {
    return ipcRenderer.invoke('mcp:saveConfig', config)
  },

  /**
   * 删除 MCP 服务器配置
   */
  deleteConfig: (name: string): Promise<MCPConfigSaveResult> => {
    return ipcRenderer.invoke('mcp:deleteConfig', name)
  },

  /**
   * 批量导入 MCP 服务器配置
   */
  importConfigs: (jsonContent: string): Promise<MCPConfigImportResult> => {
    return ipcRenderer.invoke('mcp:importConfigs', jsonContent)
  },

  /**
   * 导出所有 MCP 服务器配置
   */
  exportConfigs: (): Promise<string> => {
    return ipcRenderer.invoke('mcp:exportConfigs')
  },

  /**
   * 连接 MCP 服务器
   */
  connect: (name: string): Promise<MCPConnectResult> => {
    return ipcRenderer.invoke('mcp:connect', name)
  },

  /**
   * 断开 MCP 服务器连接
   */
  disconnect: (name: string): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('mcp:disconnect', name)
  },

  /**
   * 重新连接 MCP 服务器
   */
  reconnect: (name: string): Promise<MCPConnectResult> => {
    return ipcRenderer.invoke('mcp:reconnect', name)
  },

  /**
   * 获取连接状态
   */
  getStatus: (serverName?: string): Promise<MCPConnectionStatus[]> => {
    return ipcRenderer.invoke('mcp:getStatus', serverName)
  },

  /**
   * 获取工具列表
   */
  listTools: (serverName?: string): Promise<MCPTool[]> => {
    return ipcRenderer.invoke('mcp:listTools', serverName)
  },

  /**
   * 按服务器分组获取工具
   */
  listToolsByServer: (): Promise<Record<string, MCPTool[]>> => {
    return ipcRenderer.invoke('mcp:listToolsByServer')
  },

  /**
   * 调用 MCP 工具
   */
  callTool: (params: MCPToolCallParams): Promise<MCPToolCallResult> => {
    return ipcRenderer.invoke('mcp:callTool', params)
  },

  /**
   * 测试 MCP 连接
   */
  testConnection: (config: MCPServerConfig): Promise<MCPConnectResult> => {
    return ipcRenderer.invoke('mcp:testConnection', config)
  },

  /**
   * 连接所有已启用的服务器
   */
  connectAll: (): Promise<MCPConnectResult[]> => {
    return ipcRenderer.invoke('mcp:connectAll')
  },

  /**
   * 断开所有连接
   */
  disconnectAll: (): Promise<{ success: boolean }> => {
    return ipcRenderer.invoke('mcp:disconnectAll')
  },

  /**
   * 获取已连接的服务器名称列表
   */
  getConnectedServers: (): Promise<string[]> => {
    return ipcRenderer.invoke('mcp:getConnectedServers')
  },

  /**
   * 监听 MCP 状态变更
   */
  onStatusChange: (callback: (event: MCPStatusChangeEvent) => void): (() => void) => {
    return createIpcListener<MCPStatusChangeEvent>('mcp:statusChange', callback)
  }
}
