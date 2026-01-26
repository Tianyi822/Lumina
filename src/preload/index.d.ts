import { ElectronAPI } from '@electron-toolkit/preload'

/**
 * 配置加载状态
 */
interface ConfigStatus {
  loaded: boolean
  success: boolean
  error: string | null
  exists: boolean
}

/**
 * 配置加载结果
 */
interface ConfigLoadResult {
  success: boolean
  config: unknown
  error?: string
}

/**
 * 保存/更新结果
 */
interface ConfigSaveResult {
  success: boolean
  error?: string
}

/**
 * 配置 API
 */
interface ConfigApi {
  getStatus: () => Promise<ConfigStatus>
  getConfig: () => Promise<unknown>
  getLoadResult: () => Promise<ConfigLoadResult>
  saveConfig: (config: unknown) => Promise<ConfigSaveResult>
  updateConfig: (partialConfig: unknown) => Promise<ConfigSaveResult>
  exists: () => Promise<boolean>
}

/**
 * 聊天消息
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  reasoning_content?: string
  tool_calls?: ToolCallMessage[]
  tool_call_id?: string
}

/**
 * 工具调用消息
 */
interface ToolCallMessage {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * MCP 工具引用（用于传递选中的工具）
 */
interface MCPToolReference {
  serverName: string
  toolName: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 聊天请求
 */
interface ChatRequest {
  messages: ChatMessage[]
  modelKey: string
  sessionId: string
  enableThinking?: boolean
  selectedTools?: MCPToolReference[]
  maxReactIterations?: number
}

/**
 * 聊天结果
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
 * 工具调用信息
 */
interface ToolCallInfo {
  id: string
  name: string
  serverName: string
  arguments: Record<string, unknown>
}

/**
 * 工具结果信息
 */
interface ToolResultInfo {
  id: string
  name: string
  success: boolean
  result?: unknown
  error?: string
}

/**
 * 流式事件
 */
interface StreamEvent {
  type: 'content' | 'reasoning' | 'tool_call' | 'tool_result' | 'done' | 'error'
  sessionId?: string
  content?: string
  usage?: TokenUsage
  error?: string
  toolCall?: ToolCallInfo
  toolResult?: ToolResultInfo
}

/**
 * 聊天 API
 */
interface ChatApi {
  send: (request: ChatRequest) => Promise<ChatResult>
  stop: (sessionId?: string) => Promise<void>
  onStream: (callback: (event: StreamEvent) => void) => () => void
}

/**
 * 会话消息
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
 * 会话数据
 */
interface SessionData {
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
  messages: SessionMessage[]
}

/**
 * 会话列表项
 */
interface SessionListItem {
  sessionId: string
  title: string
  lastMessage?: string
  updatedAt: string
}

/**
 * 会话操作结果
 */
interface SessionResult {
  success: boolean
  error?: string
}

/**
 * 会话 API
 */
interface SessionApi {
  create: (title?: string) => Promise<SessionData>
  save: (data: SessionData) => Promise<SessionResult>
  load: (sessionId: string) => Promise<SessionData | null>
  list: () => Promise<SessionListItem[]>
  delete: (sessionId: string) => Promise<SessionResult>
  rename: (sessionId: string, newTitle: string) => Promise<SessionResult>
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
 * MCP API
 */
interface MCPApi {
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

/**
 * 日志级别
 */
interface LogLevelEnum {
  readonly DEBUG: 0
  readonly INFO: 1
  readonly WARN: 2
  readonly ERROR: 3
  readonly FATAL: 4
}

/**
 * 日志结果
 */
interface LogResult {
  success: boolean
  error?: string
}

/**
 * 日志配置
 */
interface LoggerConfig {
  minLevel: number
  enableConsole: boolean
  enableFile: boolean
}

/**
 * 日志 API
 */
interface LoggerApi {
  debug: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  info: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  warn: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  error: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  fatal: (message: string, context?: Record<string, unknown>) => Promise<LogResult>
  log: (level: number, message: string, context?: Record<string, unknown>) => Promise<LogResult>
  setLevel: (level: number) => Promise<void>
  getConfig: () => Promise<LoggerConfig>
  getLogPath: () => Promise<string>
  LogLevel: LogLevelEnum
}

/**
 * 工具描述详细程度
 */
type ToolDescriptionLevel = 'basic' | 'detailed' | 'minimal'

/**
 * 提示词配置
 */
interface PromptConfig {
  /** 是否启用增强版提示词 */
  enableEnhancedPrompt?: boolean
  /** 工具描述详细程度 */
  toolDescriptionLevel?: ToolDescriptionLevel
  /** Few-shot 示例数量 (0-5) */
  fewShotCount?: number
  /** 自定义系统提示词（覆盖默认提示词） */
  customSystemPrompt?: string
}

/**
 * 提示词配置 API
 */
interface PromptApi {
  getConfig: () => Promise<PromptConfig | undefined>
  updateConfig: (config: PromptConfig) => Promise<ConfigSaveResult>
}

/**
 * 自定义 API
 */
interface CustomApi {
  config: ConfigApi
  logger: LoggerApi
  chat: ChatApi
  session: SessionApi
  mcp: MCPApi
  prompt: PromptApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomApi
  }
}
