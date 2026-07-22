// src/main/services/chat/harness/middleware/types.ts
/**
 * Middleware 接口与 hook 类型(洋葱模型)。
 *
 * 中间件围绕引擎执行的多个 hook 切入。洋葱模型:请求从外向内穿入,
 * 到达核心(实际执行)后从内向外穿出。每层中间件同时拥有"核心前"和
 * "核心后"两个切入点,还能通过不调用 next 实现短路拦截。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §2.2
 */
import type { ChatMessage } from '@shared/types/chat'
import type { HarnessContext, ToolExecutionResult } from '../HarnessContext'

/** OpenAI function 工具定义(简化,与现有 ToolDef 对齐) */
export interface ToolDef {
  name: string
  description?: string
  parameters?: unknown // JSON Schema
}

/** 模型返回的工具调用 */
export interface ToolCall {
  id: string
  name: string
  args: unknown
}

/** tool_choice 取值 */
export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; name: string }

/** 模型请求的可变视图(beforeModelCall 中间件可改写) */
export interface MutableModelRequest {
  tools: ToolDef[]
  toolChoice: ToolChoice
  messages: ChatMessage[]
  temperature?: number
}

/** 路由决策(resolveRoute 返回) */
export interface RouteDecision {
  engineKind: 'react' | 'plan_execute' | 'direct'
  reason: string
}

/** 迭代决策(beforeIteration 返回) */
export type IterationDecision =
  | { action: 'continue' }
  | { action: 'finalize'; reason: string }
  | { action: 'abort'; reason: string }

/** run 结局 */
export type RunOutcome =
  | { kind: 'success'; result: unknown }
  | { kind: 'error'; error: string }
  | { kind: 'aborted' }

/**
 * Harness 中间件。按需实现其中若干 hook。
 * order 越小越外层(先执行)。
 */
export interface HarnessMiddleware {
  readonly name: string
  readonly order: number

  /** run 开始:配置已合并、引擎未选 */
  beforeRun?(ctx: HarnessContext): Promise<void> | void

  /** 路由:决定 engineKind。next 形成洋葱链。 */
  resolveRoute?(
    ctx: HarnessContext,
    next: (decision: RouteDecision) => RouteDecision
  ): Promise<RouteDecision> | RouteDecision

  /** 引擎选中后、首次模型调用前 */
  afterRoute?(ctx: HarnessContext): Promise<void> | void

  /** 每轮 ReAct 迭代前 */
  beforeIteration?(ctx: HarnessContext): Promise<IterationDecision> | IterationDecision

  /** 模型调用前:可改写 tools / tool_choice / messages */
  beforeModelCall?(
    ctx: HarnessContext,
    modelReq: MutableModelRequest
  ): Promise<MutableModelRequest> | MutableModelRequest

  /** 模型返回后、工具执行前:可拦截/改写 tool_calls */
  afterModelCall?(
    ctx: HarnessContext,
    toolCalls: ToolCall[],
    next: (calls: ToolCall[]) => Promise<ToolCall[]>
  ): Promise<ToolCall[]>

  /** 单个工具执行前:可短路拦截(不调 next 返回替代结果) */
  beforeToolCall?(
    ctx: HarnessContext,
    call: ToolCall,
    next: (c: ToolCall) => Promise<ToolExecutionResult>
  ): Promise<ToolExecutionResult>

  /** 单个工具执行后 */
  afterToolCall?(
    ctx: HarnessContext,
    call: ToolCall,
    result: ToolExecutionResult
  ): Promise<void> | void

  /** 每轮迭代结束 */
  afterIteration?(ctx: HarnessContext): Promise<void> | void

  /** run 结束(正常/异常/中止) */
  afterRun?(ctx: HarnessContext, outcome: RunOutcome): Promise<void> | void
}
