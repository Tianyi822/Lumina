import type { TokenUsage } from './chat'
import type { MCPTool } from './mcp'
import type { KnowledgeBase } from './knowledge'

/**
 * 持久化的消息结构
 */
export interface SessionMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  reasoning?: string
  timestamp: string
  modelName?: string
  usage?: TokenUsage
}

/**
 * 会话的类型
 */
export type SessionType = 'default' | 'tool' | 'knowledge'

/**
 * 会话级选择状态
 */
export interface SessionSelectionState {
  selectedMCPTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableSandboxTools: boolean
}

/**
 * 会话的完整数据
 */
export interface SessionData {
  sessionId: string
  title: string
  description?: string
  sessionType: SessionType
  createdAt: string
  updatedAt: string
  messages: SessionMessage[]
  selectionState?: SessionSelectionState
}

/**
 * 会话列表项
 */
export interface SessionListItem {
  sessionId: string
  title: string
  sessionType: SessionType
  createdAt: string
  updatedAt: string
}

/**
 * 会话操作的结果
 */
export interface SessionResult {
  success: boolean
  error?: string
}

/**
 * 会话相关的 API
 */
export interface SessionApi {
  create: (title?: string, type?: SessionType) => Promise<SessionData>
  save: (data: SessionData) => Promise<SessionResult>
  load: (sessionId: string) => Promise<SessionData | null>
  list: () => Promise<SessionListItem[]>
  delete: (sessionId: string) => Promise<SessionResult>
  rename: (sessionId: string, newTitle: string) => Promise<SessionResult>
}
