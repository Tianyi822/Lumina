/**
 * Store 共享类型定义
 */

import type { MCPTool, KnowledgeBase } from '@renderer/types'

/**
 * 会话输入状态
 */
export interface SessionInputState {
  inputMessage: string
  selectedModel: string
  selectedMCPTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
}

/**
 * 序列化后的输入状态（用于持久化）
 */
export interface SerializedInputState extends Omit<
  SessionInputState,
  'selectedMCPTools' | 'selectedKnowledgeBases'
> {
  selectedMCPTools: Array<{
    name: string
    serverName: string
    description?: string
    inputSchema?: Record<string, unknown>
  }>
  selectedKnowledgeBases: Array<{
    id: string
    name: string
    description?: string
  }>
}

/**
 * 会话发送状态
 */
export interface SessionSendingState {
  sessionId: string
  isSending: boolean
  isStreaming: boolean
  lastUpdated: string
}

/**
 * Store 持久化版本（用于数据迁移）
 */
export interface StorePersistedState {
  version: number
  timestamp: string
}
