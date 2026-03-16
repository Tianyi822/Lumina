import type { SelectedPptTemplate } from './ppt'

/**
 * 聊天消息的结构
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  reasoning_content?: string
  tool_calls?: ToolCallMessage[]
  tool_call_id?: string
}

/**
 * 工具调用的信息
 */
export interface ToolCallMessage {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * 表示用户选中的 MCP 工具引用
 */
export interface MCPToolReference {
  serverName: string
  toolName: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 表示用户选中的知识库引用
 */
export interface KnowledgeBaseReference {
  id: string
  name: string
  description?: string
  documentCount: number
}

/**
 * 知识库搜索操作的信息
 */
export interface KnowledgeSearchInfo {
  knowledgeBaseId: string
  knowledgeBaseName: string
  query: string
}

/**
 * 知识库搜索的结果信息
 */
export interface KnowledgeResultInfo {
  knowledgeBaseId: string
  knowledgeBaseName: string
  query: string
  results: Array<{
    chunkId: number
    fileId: string
    fileName: string
    content: string
    similarity: number
  }>
}

/**
 * 用户交互选项
 */
export interface UserInteractionOption {
  value: string
  label: string
  description?: string
}

/**
 * 用户交互请求
 */
export interface UserInteractionRequest {
  question: string
  options: UserInteractionOption[]
  interactionType?: 'generic' | 'presentation_template'
  initialVisibleCount?: number
}

/**
 * 发起聊天请求所需的参数
 */
export interface ChatRequest {
  messages: ChatMessage[]
  modelKey: string
  sessionId: string
  enableThinking?: boolean
  selectedTools?: MCPToolReference[]
  selectedKnowledgeBases?: KnowledgeBaseReference[]
  maxReactIterations?: number
  enableSandboxTools?: boolean
  selectedPptTemplate?: SelectedPptTemplate | null
}

/**
 * 聊天请求的执行结果
 */
export interface ChatResult {
  success: boolean
  error?: string
}

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
 * 工具调用的信息
 */
export interface ToolCallInfo {
  id: string
  name: string
  serverName: string
  arguments: Record<string, unknown>
}

/**
 * 工具调用的结果
 */
export interface ToolResultInfo {
  id: string
  name: string
  success: boolean
  result?: unknown
  error?: string
}

/**
 * 流式传输事件的类型
 */
export interface StreamEvent {
  type:
    | 'content'
    | 'reasoning'
    | 'tool_call'
    | 'tool_result'
    | 'tool_progress'
    | 'knowledge_search'
    | 'knowledge_result'
    | 'user_interaction'
    | 'react_iteration_start'
    | 'done'
    | 'error'
  sessionId?: string
  content?: string
  usage?: TokenUsage
  error?: string
  toolCall?: ToolCallInfo
  toolResult?: ToolResultInfo
  toolProgress?: {
    current: number
    total: number
    message?: string
  }
  knowledgeSearch?: KnowledgeSearchInfo
  knowledgeResult?: KnowledgeResultInfo
  userInteraction?: UserInteractionRequest
}

/**
 * 聊天相关的 API
 */
export interface ChatApi {
  send: (request: ChatRequest) => Promise<ChatResult>
  stop: (sessionId?: string) => Promise<void>
  onStream: (callback: (event: StreamEvent) => void) => () => void
}
