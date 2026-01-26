/**
 * Token 使用统计
 */
export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens?: number
}

/**
 * ReAct 步骤
 */
export interface ReActStep {
  type: 'tool_call' | 'tool_result'
  toolCall?: ToolCallInfo
  toolResult?: ToolResultInfo
  timestamp: string
}

/**
 * 消息接口（UI层使用）
 */
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  isStreaming?: boolean
  usage?: TokenUsage
  timestamp?: string
  modelName?: string // 模型名称（仅 assistant 消息）
  reactSteps?: ReActStep[] // ReAct 推理步骤
}

/**
 * 会话消息（用于持久化）
 */
export interface SessionMessage {
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
export interface SessionData {
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
  messages: SessionMessage[]
}

/**
 * 会话列表项
 */
export interface SessionListItem {
  sessionId: string
  title: string
  lastMessage?: string
  updatedAt: string
}

/**
 * 聊天消息（用于发送给后端）
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * MCP 工具接口
 */
export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverName: string
}

/**
 * MCP 工具引用（用于发送给后端）
 */
export interface MCPToolReference {
  serverName: string
  toolName: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 工具调用信息
 */
export interface ToolCallInfo {
  id: string
  name: string
  serverName: string
  arguments: Record<string, unknown>
}

/**
 * 工具结果信息
 */
export interface ToolResultInfo {
  id: string
  name: string
  success: boolean
  result?: unknown
  error?: string
}

/**
 * 流式事件
 */
export interface StreamEvent {
  type: 'content' | 'reasoning' | 'tool_call' | 'tool_result' | 'done' | 'error'
  sessionId?: string
  content?: string
  usage?: TokenUsage
  error?: string
  toolCall?: ToolCallInfo
  toolResult?: ToolResultInfo
}

// ==================== LLM 配置相关 ====================

/**
 * LLM 配置项
 */
export interface LLMConfig {
  base_url: string
  api_key: string
  model_name: string
  temperature: number
  max_tokens: number
}

/**
 * LLM 配置集合
 */
export interface LLMConfigs {
  [key: string]: LLMConfig
}

/**
 * 应用配置
 */
export interface AppConfig {
  theme: ThemeConfig
  llm_configs: LLMConfigs
  default_model: string
  compression_threshold: number
  enable_auto_compression: boolean
  mcpServers?: MCPServerConfig[]
}

// ==================== 主题配置相关 ====================

/**
 * 主题颜色配置
 */
export interface ThemeColors {
  background: string
  backgroundSecondary: string
  text: string
  textSecondary: string
  accent: string
  border: string
}

/**
 * 主题配置
 */
export interface ThemeConfig {
  name: string
  colors?: ThemeColors
}

// ==================== MCP 配置相关 ====================

/**
 * MCP 传输类型
 */
export type MCPTransportType = 'stdio' | 'sse' | 'streamableHttp'

/**
 * MCP 服务器配置
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
 * MCP 连接状态
 */
export interface MCPConnectionStatus {
  serverName: string
  connected: boolean
  error?: string
  tools: MCPTool[]
}
