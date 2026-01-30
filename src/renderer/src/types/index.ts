/**
 * 渲染进程类型定义
 * UI 特有类型 + 重新导出共享类型
 */

// ==================== 重新导出共享类型 ====================

// 聊天相关类型（包含 ToolCallInfo, ToolResultInfo, TokenUsage 等）
export * from '@shared/types/chat'

// MCP 相关类型
export * from '@shared/types/mcp'

// 会话相关类型
export * from '@shared/types/session'

// 配置相关类型
export * from '@shared/types/config'

// 知识库相关类型
export * from '@shared/types/knowledge'

// ==================== UI 特有类型 ====================

import type { ToolCallInfo, ToolResultInfo, ToolCallMessage } from '@shared/types/chat'

/**
 * ReAct 步骤（UI 层特有）
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
  usage?: import('@shared/types/chat').TokenUsage
  timestamp?: string
  modelName?: string // 模型名称（仅 assistant 消息）
  reactSteps?: ReActStep[] // ReAct 推理步骤
  tool_calls?: ToolCallMessage[] // 工具调用（仅 assistant 消息）
}

/**
 * 搜索结果（UI 层特有）
 */
export interface SearchResult {
  chunkId: string
  documentId: string
  documentName: string
  content: string
  score: number
  distance: number
  metadata?: Record<string, any>
}
