// src/main/services/chat/harness/trace/TraceSchema.ts
/**
 * Trace 事件 schema(决策级)。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §5.2
 */
import type { SessionType, EngineKind } from '../HarnessContext'

/** 复杂度评分(spec §4.1) */
export interface ComplexityScore {
  total: number
  breakdown: Record<string, number>
  reasoning: string[]
}

/** Trace 事件联合(每个事件自带 event 鉴别符) */
export type TraceEvent =
  // —— run 级 ——
  | {
      event: 'run_started'
      requestId: string
      sessionId: string
      sessionType: SessionType
      paperId?: string
      engineKind: EngineKind
    }
  | {
      event: 'run_finished'
      requestId: string
      outcome: 'success' | 'error' | 'aborted'
      tokenUsage?: unknown
      durationMs: number
    }
  // —— 路由 ——
  | { event: 'complexity_score'; requestId: string; score: ComplexityScore }
  | { event: 'route_decided'; requestId: string; engineKind: EngineKind; reason: string }
  // —— 迭代 ——
  | { event: 'iteration_started'; requestId: string; iteration: number; tokensRemaining: number }
  | {
      event: 'iteration_finished'
      requestId: string
      iteration: number
      toolCallsCount: number
      modelUsage?: unknown
    }
  // —— 模型调用 ——
  | {
      event: 'model_call_prepared'
      requestId: string
      toolChoice: unknown
      toolsCount: number
      fewShotInjected?: boolean
    }
  | { event: 'model_call_finished'; requestId: string; usage?: unknown; latencyMs: number }
  // —— 工具 ——
  | {
      event: 'tool_subset_filtered'
      requestId: string
      before: number
      after: number
      kept: string[]
    }
  | { event: 'tool_choice_decided'; requestId: string; value: unknown; reason: string }
  | {
      event: 'tool_call_blocked'
      requestId: string
      tool: string
      reason: 'duplicate' | 'arg_invalid' | 'budget' | 'not_found'
      detail: string
    }
  | {
      event: 'tool_call_started'
      requestId: string
      tool: string
      argsHash: string
      iteration: number
    }
  | {
      event: 'tool_call_finished'
      requestId: string
      tool: string
      argsHash: string
      success: boolean
      durationMs: number
      resultSummary?: string
    }
  // —— 预算 ——
  | {
      event: 'budget_tick'
      requestId: string
      iterationsRemaining: number
      tokensRemaining: number
      toolCallsRemaining: number
    }
  | { event: 'budget_exhausted'; requestId: string; reason: string; action: string }
  // —— Plan-Execute ——
  | { event: 'plan_generated'; requestId: string; steps: { title: string; description: string }[] }
  | { event: 'plan_step_started'; requestId: string; stepIndex: number; stepTitle: string }
  | {
      event: 'plan_step_finished'
      requestId: string
      stepIndex: number
      success: boolean
      attempts: number
    }
  // —— paper 切换 ——
  | { event: 'paper_context_switched'; requestId: string; fromPaperId?: string; toPaperId?: string }

/** 完整 trace 记录(TraceEvent + 元数据) */
export interface TraceRecord {
  ts: number
  requestId: string
  sessionId: string
  paperId?: string
  event: TraceEvent
}
