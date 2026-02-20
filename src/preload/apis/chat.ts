import { ipcRenderer } from 'electron'
import { createIpcListener } from './base'

/**
 * 聊天消息的结构
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
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
 * 知识库搜索的完整结果
 */
export interface KnowledgeSearchResult {
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
 * 流式传输事件的类型
 */
export interface StreamEvent {
  type:
    | 'content'
    | 'reasoning'
    | 'tool_call'
    | 'tool_result'
    | 'knowledge_search'
    | 'knowledge_result'
    | 'done'
    | 'error'
  sessionId?: string
  content?: string
  usage?: TokenUsage
  error?: string
  toolCall?: ToolCallInfo
  toolResult?: ToolResultInfo
  knowledgeSearch?: KnowledgeSearchInfo
  knowledgeResult?: KnowledgeResultInfo
}

/**
 * 聊天相关的 API
 */
export const chatApi = {
  /**
   * 发送聊天消息
   */
  send: (request: ChatRequest): Promise<ChatResult> => {
    return ipcRenderer.invoke('chat:send', request)
  },

  /**
   * 停止聊天请求
   */
  stop: (sessionId?: string): Promise<void> => {
    return ipcRenderer.invoke('chat:stop', sessionId)
  },

  /**
   * 监听流式响应事件
   */
  onStream: (callback: (event: StreamEvent) => void): (() => void) => {
    return createIpcListener<StreamEvent>('chat:stream', callback)
  }
}
