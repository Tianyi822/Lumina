// src/main/services/chat/harness/HarnessContext.ts
/**
 * Harness 运行时上下文。一次 Harness.run() 贯穿一个 ctx,
 * 在中间件链与引擎之间流转,承载请求、配置、运行时状态、trace。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §2.1
 */
import type { ChatMessage, TokenUsage } from '@shared/types/chat'
import type { ResolvedHarnessConfig } from './config/HarnessConfig'

/** 三条调度路径 */
export type EngineKind = 'react' | 'plan_execute' | 'direct'

/** 会话类型(与 ChatRequest.sessionType 对齐) */
export type SessionType = 'paper' | 'knowledge' | 'lab' | 'default'

/** 工具调用记录(重复检测/依赖分析/trace 共用) */
export interface ToolCallRecord {
  readonly toolName: string
  readonly argsHash: string
  readonly args: unknown
  readonly calledAt: number
  readonly result?: { success: boolean; summary: string }
  readonly status: 'pending' | 'running' | 'done' | 'blocked' | 'failed'
}

/** 单轮迭代记录(供空转检测) */
export interface IterationRecord {
  iteration: number
  toolCalls: unknown[]
  usage?: TokenUsage
}

/** 预算状态(BudgetGuard 中间件维护) */
export interface BudgetState {
  iterationsRemaining: number
  tokensRemaining: number
  toolCallsRemaining: number
}

/** 工具执行结果(中间件 beforeToolCall 返回值) */
export interface ToolExecutionResult {
  success: boolean
  data?: unknown
  error?: string
}

/** ctx.state.flags */
export interface HarnessFlags {
  budgetExhausted: boolean
  forcedFinalize: boolean
  duplicateBlocked: boolean
  userInteractionPending: boolean
}

/** ctx.state */
export interface HarnessState {
  engineKind: EngineKind
  iteration: number
  tokenUsage: TokenUsage
  toolCallCount: number
  toolCallHistory: ToolCallRecord[]
  iterationHistory: IterationRecord[]
  pendingToolCalls?: unknown[]
  abortController: AbortController
  budget: BudgetState
  flags: HarnessFlags
}

/**
 * Harness 运行时上下文。
 * readonly 字段是输入(中间件不应改);state 是可变运行时状态。
 */
export interface HarnessContext {
  readonly requestId: string
  readonly sessionId: string
  readonly sessionType: SessionType
  readonly userMessage: string
  readonly conversationMessages: ChatMessage[]
  readonly paperId?: string
  readonly isSharedPaperSession: boolean

  readonly config: ResolvedHarnessConfig

  readonly state: HarnessState

  /** trace 收集器,Task 8 替换为具体类型 */
  readonly trace: {
    log: (event: unknown) => void
  }

  readonly meta: Record<string, unknown>
}
