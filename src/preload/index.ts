import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * 日志级别枚举（与主进程保持一致）
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
} as const

/**
 * 日志结果类型
 */
interface LogResult {
  success: boolean
  error?: string
}

/**
 * 日志相关的 API
 */
const loggerApi = {
  /**
   * 记录 DEBUG 级别日志
   */
  debug: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:debug', message, context)
  },

  /**
   * 记录 INFO 级别日志
   */
  info: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:info', message, context)
  },

  /**
   * 记录 WARN 级别日志
   */
  warn: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:warn', message, context)
  },

  /**
   * 记录 ERROR 级别日志
   */
  error: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:error', message, context)
  },

  /**
   * 记录 FATAL 级别日志
   */
  fatal: (message: string, context?: Record<string, unknown>): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:fatal', message, context)
  },

  /**
   * 通用日志记录方法
   */
  log: (
    level: (typeof LogLevel)[keyof typeof LogLevel],
    message: string,
    context?: Record<string, unknown>
  ): Promise<LogResult> => {
    return ipcRenderer.invoke('logger:log', { level, message, context })
  },

  /**
   * 设置最低日志级别
   */
  setLevel: (level: (typeof LogLevel)[keyof typeof LogLevel]): Promise<void> => {
    return ipcRenderer.invoke('logger:setLevel', level)
  },

  /**
   * 获取当前日志配置
   */
  getConfig: (): Promise<{
    minLevel: number
    enableConsole: boolean
    enableFile: boolean
  }> => {
    return ipcRenderer.invoke('logger:getConfig')
  },

  /**
   * 获取当前日志文件路径
   */
  getLogPath: (): Promise<string> => {
    return ipcRenderer.invoke('logger:getLogPath')
  },

  /**
   * 日志级别常量
   */
  LogLevel
}

/**
 * 聊天消息类型
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 聊天请求类型
 */
interface ChatRequest {
  messages: ChatMessage[]
  modelKey: string
  sessionId: string
  enableThinking?: boolean
}

/**
 * 聊天结果类型
 */
interface ChatResult {
  success: boolean
  error?: string
}

/**
 * Token 使用统计
 */
interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens?: number
}

/**
 * 流式事件类型
 */
interface StreamEvent {
  type: 'content' | 'reasoning' | 'done' | 'error'
  sessionId?: string
  content?: string
  usage?: TokenUsage
  error?: string
}

/**
 * 聊天相关的 API
 */
const chatApi = {
  /**
   * 发送聊天消息
   */
  send: (request: ChatRequest): Promise<ChatResult> => {
    return ipcRenderer.invoke('chat:send', request)
  },

  /**
   * 中止请求
   * @param sessionId 可选的会话标识。如果提供，只中止该会话的请求；否则中止所有请求
   */
  stop: (sessionId?: string): Promise<void> => {
    return ipcRenderer.invoke('chat:stop', sessionId)
  },

  /**
   * 监听流式响应
   * @returns 取消监听的函数
   */
  onStream: (callback: (event: StreamEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: StreamEvent): void => {
      callback(data)
    }
    ipcRenderer.on('chat:stream', listener)
    return () => {
      ipcRenderer.removeListener('chat:stream', listener)
    }
  }
}

/**
 * 会话消息类型
 */
interface SessionMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  reasoning?: string
  timestamp: string
  modelName?: string
  usage?: TokenUsage
}

/**
 * 会话数据类型
 */
interface SessionData {
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
  messages: SessionMessage[]
}

/**
 * 会话列表项类型
 */
interface SessionListItem {
  sessionId: string
  title: string
  lastMessage?: string
  updatedAt: string
}

/**
 * 会话操作结果类型
 */
interface SessionResult {
  success: boolean
  error?: string
}

/**
 * 会话相关的 API
 */
const sessionApi = {
  /**
   * 创建新会话
   */
  create: (title?: string): Promise<SessionData> => {
    return ipcRenderer.invoke('session:create', title)
  },

  /**
   * 保存会话
   */
  save: (data: SessionData): Promise<SessionResult> => {
    return ipcRenderer.invoke('session:save', data)
  },

  /**
   * 加载会话
   */
  load: (sessionId: string): Promise<SessionData | null> => {
    return ipcRenderer.invoke('session:load', sessionId)
  },

  /**
   * 获取会话列表
   */
  list: (): Promise<SessionListItem[]> => {
    return ipcRenderer.invoke('session:list')
  },

  /**
   * 删除会话
   */
  delete: (sessionId: string): Promise<SessionResult> => {
    return ipcRenderer.invoke('session:delete', sessionId)
  },

  /**
   * 重命名会话
   */
  rename: (sessionId: string, newTitle: string): Promise<SessionResult> => {
    return ipcRenderer.invoke('session:rename', sessionId, newTitle)
  }
}

/**
 * MCP 传输类型
 */
type MCPTransportType = 'stdio' | 'sse' | 'streamableHttp'

/**
 * MCP 服务器配置
 */
interface MCPServerConfig {
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
 * MCP 工具定义
 */
interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverName: string
}

/**
 * MCP 连接状态
 */
interface MCPConnectionStatus {
  serverName: string
  connected: boolean
  error?: string
  tools: MCPTool[]
}

/**
 * MCP 连接结果
 */
interface MCPConnectResult {
  success: boolean
  serverName: string
  tools?: MCPTool[]
  error?: string
}

/**
 * MCP 配置保存结果
 */
interface MCPConfigSaveResult {
  success: boolean
  error?: string
}

/**
 * MCP 配置导入结果
 */
interface MCPConfigImportResult {
  success: boolean
  imported: number
  errors: string[]
}

/**
 * MCP 工具调用参数
 */
interface MCPToolCallParams {
  serverName: string
  toolName: string
  args: Record<string, unknown>
}

/**
 * MCP 工具调用结果
 */
interface MCPToolCallResult {
  success: boolean
  content?: unknown
  error?: string
}

/**
 * MCP 状态变更事件
 */
interface MCPStatusChangeEvent {
  serverName: string
  status: MCPConnectionStatus
}

/**
 * MCP 相关的 API
 */
const mcpApi = {
  /**
   * 获取所有 MCP 配置
   */
  listConfigs: (): Promise<MCPServerConfig[]> => {
    return ipcRenderer.invoke('mcp:listConfigs')
  },

  /**
   * 获取单个 MCP 配置
   */
  getConfig: (name: string): Promise<MCPServerConfig | null> => {
    return ipcRenderer.invoke('mcp:getConfig', name)
  },

  /**
   * 保存 MCP 配置
   */
  saveConfig: (config: MCPServerConfig): Promise<MCPConfigSaveResult> => {
    return ipcRenderer.invoke('mcp:saveConfig', config)
  },

  /**
   * 删除 MCP 配置
   */
  deleteConfig: (name: string): Promise<MCPConfigSaveResult> => {
    return ipcRenderer.invoke('mcp:deleteConfig', name)
  },

  /**
   * 批量导入 MCP 配置
   */
  importConfigs: (jsonContent: string): Promise<MCPConfigImportResult> => {
    return ipcRenderer.invoke('mcp:importConfigs', jsonContent)
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
   * 重连 MCP 服务器
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
   * @returns 取消监听的函数
   */
  onStatusChange: (callback: (event: MCPStatusChangeEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: MCPStatusChangeEvent): void => {
      callback(data)
    }
    ipcRenderer.on('mcp:statusChange', listener)
    return () => {
      ipcRenderer.removeListener('mcp:statusChange', listener)
    }
  }
}

/**
 * 配置相关的 API
 */
const configApi = {
  /**
   * 获取配置加载状态
   */
  getStatus: (): Promise<{
    loaded: boolean
    success: boolean
    error: string | null
    exists: boolean
  }> => {
    return ipcRenderer.invoke('config:getStatus')
  },

  /**
   * 获取配置
   */
  getConfig: (): Promise<unknown> => {
    return ipcRenderer.invoke('config:get')
  },

  /**
   * 获取配置加载结果
   */
  getLoadResult: (): Promise<{
    success: boolean
    config: unknown
    error?: string
  }> => {
    return ipcRenderer.invoke('config:getLoadResult')
  },

  /**
   * 保存配置
   */
  saveConfig: (config: unknown): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('config:save', config)
  },

  /**
   * 更新配置（部分更新）
   */
  updateConfig: (partialConfig: unknown): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('config:update', partialConfig)
  },

  /**
   * 检查配置是否存在
   */
  exists: (): Promise<boolean> => {
    return ipcRenderer.invoke('config:exists')
  }
}

// 自定义渲染器 API
const api = {
  config: configApi,
  logger: loggerApi,
  chat: chatApi,
  session: sessionApi,
  mcp: mcpApi
}

// 使用 `contextBridge` API 向渲染器暴露 Electron API
// 仅在启用了上下文隔离时使用，否则直接添加到 DOM 全局对象
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (在 dts 中定义)
  window.electron = electronAPI
  // @ts-ignore (在 dts 中定义)
  window.api = api
}
