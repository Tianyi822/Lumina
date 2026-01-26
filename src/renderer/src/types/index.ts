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
