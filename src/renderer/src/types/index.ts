/**
 * 渲染进程类型定义
 * UI 特有类型 + 重新导出共享类型
 */

// ==================== 重新导出共享类型 ====================

// 聊天相关类型（包含 ToolCallInfo, ToolResultInfo, TokenUsage 等）
// 注意：KnowledgeBaseReference 从 knowledge 导出，避免与 chat 中的重复定义冲突
export type {
  ChatMessage,
  AttachedDocument,
  AttachedImage,
  MCPToolReference,
  StreamEvent,
  UserInteractionRequest,
  PlanStep,
  PlanExecutionStatus,
  PlanStepStatus
} from '@shared/types/chat'

// MCP 相关类型
export * from '@shared/types/mcp'

// 会话相关类型
export * from '@shared/types/session'

// 配置相关类型
export * from '@shared/types/config'

// 知识库相关类型
export * from '@shared/types/knowledge'

// ==================== UI 特有类型 ====================

import type {
  ToolCallInfo,
  ToolResultInfo,
  ToolCallMessage,
  PlanStep,
  ChatMessage
} from '@shared/types/chat'
import type { AttachedDocument, AttachedImage, PaperQuote } from '@shared/types/chat'

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
 * ReAct 迭代状态（UI 层）
 * 用于跟踪当前迭代的执行阶段
 */
export type UiReactIterationStatus = 'thinking' | 'calling_tools' | 'processing' | 'complete'

/**
 * ReAct 迭代（UI 层特有）
 * 每次 ReAct 循环迭代的思考过程和工具调用步骤
 */
export interface ReActIteration {
  /** 迭代序号（从 0 开始） */
  iteration: number
  /** 该迭代的思考内容（随流式累加） */
  reasoning: string
  /** 该迭代的工具调用步骤 */
  steps: ReActStep[]
  /** 是否为当前正在流式输出的迭代 */
  isActive?: boolean
  /** 当前迭代状态 */
  status?: UiReactIterationStatus
  /** 该迭代的文本输出内容（Plan 模式下按步骤累加） */
  content?: string
  /** Plan 模式下所属的任务编号（1-based） */
  taskNumber?: number
}

/**
 * 消息接口（UI层使用）
 */
export interface Message {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  reasoning?: string
  isStreaming?: boolean
  usage?: import('@shared/types/chat').TokenUsage
  timestamp?: string
  modelName?: string // 模型名称（仅 assistant 消息）
  reactSteps?: ReActStep[] // ReAct 推理步骤
  reactIterations?: ReActIteration[] // ReAct 迭代分组数据
  tool_calls?: ToolCallMessage[] // 工具调用（仅 assistant 消息）
  tool_call_id?: string // 工具调用的 ID（仅 tool 消息，用于保存到会话）
  modelTranscript?: ChatMessage[] // 当前助手轮次实际产生的模型消息序列
  attachedDocuments?: AttachedDocument[] // 附加的文档（仅 user 消息）
  attachedImages?: AttachedImage[] // 附加的图片（仅 user 消息）
  attachedQuotes?: PaperQuote[] // 附加的论文引用（仅 user 消息）
  hidden?: boolean // 隐藏上下文消息，不在 UI 中显示
  contextKind?: 'paper_fulltext'
  sourcePaperId?: string
  suppressWaitingPlaceholder?: boolean
  planExecution?: {
    steps: PlanStep[]
    currentStepIndex: number
    isActive: boolean
  }
}
