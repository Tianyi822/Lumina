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
  role: 'system' | 'user' | 'assistant' | 'tool'
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
  createdAt: string
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
 * MCP 工具输入 Schema
 */
interface MCPToolInputSchema {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

/**
 * MCP 工具定义
 */
interface MCPTool {
  name: string
  description: string
  inputSchema: MCPToolInputSchema
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
  type: 'connected' | 'disconnected' | 'error' | 'tools_updated'
  serverName: string
  data?: unknown
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
  resetConfig: () => Promise<{ success: boolean; config?: PromptConfig; error?: string }>
}

/**
 * 窗口控制 API
 */
interface WindowApi {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void
}

/**
 * 嵌入向量结果
 */
interface EmbeddingResult {
  embedding: number[]
  model: string
  usage?: {
    prompt_tokens: number
    total_tokens: number
  }
}

/**
 * 批量嵌入向量结果
 */
interface BatchEmbeddingResult {
  embeddings: number[][]
  model: string
  usage?: {
    prompt_tokens: number
    total_tokens: number
  }
}

/**
 * 连接测试结果
 */
interface ConnectionTestResult {
  success: boolean
  error?: string
  model?: string
  dimensions?: number
}

/**
 * 嵌入模型提供商类型
 */
type EmbeddingProviderType = 'openai' | 'aliyun' | 'ollama' | 'custom'

/**
 * 嵌入配置
 */
interface EmbeddingConfig {
  provider: string
  baseUrl: string
  apiKey?: string
  model: string
  dimensions: number
  enabled?: boolean
}

/**
 * 嵌入模型配置（扩展版）
 */
interface EmbeddingModelConfig {
  /** 提供商类型 */
  provider?: EmbeddingProviderType
  /** API 基础 URL（OpenAI 兼容接口） */
  baseUrl: string
  /** API 密钥 */
  apiKey?: string
  /** 模型名称 */
  model: string
  /** 向量维度 */
  dimensions: number
  /** 是否启用 */
  enabled?: boolean
  /** 模型显示名称 */
  displayName?: string
  /** 创建时间 */
  createdAt?: string
}

/**
 * 嵌入 API
 */
interface EmbeddingApi {
  getPresets: () => Promise<{
    success: boolean
    data?: Record<string, { name: string; dimension: number }>
    error?: string
  }>
  createFromPreset: (
    presetId: string,
    customConfig?: Partial<EmbeddingConfig>
  ) => Promise<{ success: boolean; data?: EmbeddingConfig; error?: string }>
  getConfig: () => Promise<{ success: boolean; data?: EmbeddingConfig | null; error?: string }>
  setConfig: (config: EmbeddingConfig) => Promise<{ success: boolean; error?: string }>
  testConnection: () => Promise<ConnectionTestResult>
  embed: (text: string) => Promise<{ success: boolean; data?: EmbeddingResult; error?: string }>
  embedBatch: (
    texts: string[]
  ) => Promise<{ success: boolean; data?: BatchEmbeddingResult; error?: string }>
}

/**
 * 嵌入模型管理 API
 */
interface EmbeddingModelsApi {
  getAll: () => Promise<{
    success: boolean
    data?: Record<string, EmbeddingModelConfig>
    error?: string
  }>
  getById: (id: string) => Promise<{
    success: boolean
    data?: EmbeddingModelConfig
    error?: string
  }>
  save: (
    id: string,
    config: EmbeddingModelConfig
  ) => Promise<{
    success: boolean
    error?: string
  }>
  delete: (id: string) => Promise<{
    success: boolean
    error?: string
  }>
  test: (id: string) => Promise<ConnectionTestResult>
  setDefault: (id: string) => Promise<{
    success: boolean
    error?: string
  }>
}

/**
 * 文件项 - 统一管理的文件
 */
interface FileItem {
  id: string
  name: string
  filePath: string
  /** 文件的绝对路径，用于直接读取文件内容 */
  absolutePath: string
  fileType: string
  size: number
  uploadedAt: string
  usedByKBIds: string[]
  contentHash?: string
}

/**
 * 知识库嵌入模型配置
 */
interface KnowledgeBaseEmbeddingConfig {
  baseUrl: string
  apiKey?: string
  model: string
  dimensions: number
}

/**
 * 知识库配置
 */
interface KnowledgeBase {
  id: string
  name: string
  description?: string
  embeddingConfig: KnowledgeBaseEmbeddingConfig
  embeddingDimension: number
  chunkSize: number
  chunkOverlap: number
  createdAt: string
  updatedAt: string
  documentCount?: number
  linkedFileIds: string[]
}

/**
 * 搜索结果
 */
interface SearchResult {
  chunkId: number
  fileId: string
  fileName: string
  content: string
  chunkIndex: number
  totalChunks: number
  similarity: number
}

/**
 * 重新索引响应
 */
interface ReindexResponse {
  indexedCount: number
  failedFiles: string[]
  failedErrors?: string[]
}

/**
 * 知识库统计信息
 */
interface KnowledgeBaseStats {
  fileCount: number
  chunkCount: number
  dbSize: number
}

/**
 * 文件处理进度回调
 */
interface FileProcessingProgress {
  fileId: string
  fileName: string
  status: 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
}

/**
 * 文件进度事件数据
 */
interface FileProgressEvent {
  kbId: string
  progress: FileProcessingProgress
}

/**
 * 重新索引进度事件数据
 */
interface ReindexProgressEvent {
  kbId: string
  progress: { current: number; total: number; currentFile?: string }
}

/**
 * 知识库 API
 */
interface KnowledgeApi {
  getAll: () => Promise<{ success: boolean; data?: KnowledgeBase[]; error?: string }>
  getById: (id: string) => Promise<{ success: boolean; data?: KnowledgeBase; error?: string }>
  create: (
    data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<{ success: boolean; data?: KnowledgeBase; error?: string }>
  update: (
    id: string,
    updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>
  ) => Promise<{ success: boolean; data?: KnowledgeBase; error?: string }>
  delete: (id: string) => Promise<{ success: boolean; error?: string }>
  indexFile: (
    kbId: string,
    fileId: string,
    filePath: string,
    fileName: string
  ) => Promise<{ success: boolean; error?: string }>
  removeFileIndex: (kbId: string, fileId: string) => Promise<{ success: boolean; error?: string }>
  reindex: (
    kbId: string,
    files: Array<{ fileId: string; filePath: string; fileName: string }>
  ) => Promise<{ success: boolean; data?: ReindexResponse; error?: string }>
  search: (
    kbId: string,
    query: string,
    limit?: number
  ) => Promise<{ success: boolean; data?: { results?: SearchResult[] }; error?: string }>
  getStats: (
    kbId: string
  ) => Promise<{ success: boolean; data?: KnowledgeBaseStats; error?: string }>
  getDBSize: (
    kbId: string
  ) => Promise<{ success: boolean; data?: { size: number }; error?: string }>
  getIndexingStatus: () => Promise<{
    success: boolean
    data?: {
      isIndexing: boolean
      indexingFiles: Array<{ kbId: string; fileId: string }>
      activeIndexingKbId: string | null
      queueLength: number
    }
    error?: string
  }>
  onFileProgress: (callback: (data: FileProgressEvent) => void) => () => void
  onReindexProgress: (callback: (data: ReindexProgressEvent) => void) => () => void
}

/**
 * 文件上传结果
 */
interface FileUploadResult {
  success: boolean
  file?: FileItem
  error?: string
  isDuplicate?: boolean
}

/**
 * 文件管理 API
 */
interface FileApi {
  list: () => Promise<{ success: boolean; data?: FileItem[]; error?: string }>
  getById: (id: string) => Promise<{ success: boolean; data?: FileItem; error?: string }>
  search: (query: string) => Promise<{ success: boolean; data?: FileItem[]; error?: string }>
  upload: (params: { data: Uint8Array; name: string }) => Promise<FileUploadResult>
  delete: (fileId: string, forceDelete?: boolean) => Promise<{ success: boolean; error?: string }>
  linkToKB: (fileId: string, kbId: string) => Promise<{ success: boolean; error?: string }>
  unlinkFromKB: (fileId: string, kbId: string) => Promise<{ success: boolean; error?: string }>
  getByKBId: (kbId: string) => Promise<{ success: boolean; data?: FileItem[]; error?: string }>
  getUsage: (fileId: string) => Promise<{ success: boolean; data?: string[]; error?: string }>
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
  window: WindowApi
  embedding: EmbeddingApi
  embeddingModels: EmbeddingModelsApi
  knowledge: KnowledgeApi
  file: FileApi
  onFileProgress: (callback: (data: FileProgressEvent) => void) => () => void
  onReindexProgress: (callback: (data: ReindexProgressEvent) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomApi
  }
}
