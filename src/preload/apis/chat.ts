import { ipcRenderer } from 'electron'
import { createIpcListener } from './base'

/**
 * 聊天消息类型
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: ToolCallMessage[]
  tool_call_id?: string
}

/**
 * 工具调用消息
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
 * MCP 工具引用（用于传递选中的工具）
 */
export interface MCPToolReference {
  serverName: string
  toolName: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 聊天请求类型
 */
export interface ChatRequest {
  messages: ChatMessage[]
  modelKey: string
  sessionId: string
  enableThinking?: boolean
  selectedTools?: MCPToolReference[]
  maxReactIterations?: number
}

/**
 * 聊天结果类型
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
 * 流式事件类型
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
    return createIpcListener<StreamEvent>('chat:stream', callback)
  }
}
