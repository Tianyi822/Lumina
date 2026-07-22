// src/main/services/chat/harness/config/HarnessConfig.ts
/**
 * Harness 配置 shape。三层合并后为 ResolvedHarnessConfig。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §3.1
 */

export interface BudgetConfig {
  maxIterations: number
  maxPlanStepIterations: number
  maxTokenBudget: number
  maxToolCallCount: number
  maxRepeatedCalls: number
  budgetAction: 'finalize' | 'abort'
}

export interface RouterConfig {
  forceEngine?: 'react' | 'plan_execute' | 'direct'
  planExecuteComplexityThreshold: number
  enableHeuristic: boolean
}

export interface ToolSelectionConfig {
  enableSubsetFilter: boolean
  enableFewShot: boolean
  defaultToolChoice: 'auto' | 'none' | 'required'
  firstIterationToolChoice?: 'auto' | 'required' | { type: 'function'; name: string }
}

export interface MiddlewareConfig {
  enableDuplicateDetector: boolean
  enableArgValidator: boolean
  enableDependencyAnalyzer: boolean
  enableTraceRecorder: boolean
}

export interface ToolExecutionConfig {
  defaultTimeoutMs: number
  labTimeoutMs: number
  maxConcurrency: number
}

export interface TraceConfig {
  persistToDisk: boolean
  redactSecrets: boolean
  maxFileRetentionDays: number
}

/** 完整配置(可选字段允许部分覆盖) */
export interface HarnessConfig {
  budget?: Partial<BudgetConfig>
  router?: Partial<RouterConfig>
  toolSelection?: Partial<ToolSelectionConfig>
  middleware?: Partial<MiddlewareConfig>
  toolExecution?: Partial<ToolExecutionConfig>
  trace?: Partial<TraceConfig>
}

/** 合并后的最终配置(所有字段必填) */
export interface ResolvedHarnessConfig {
  budget: Required<BudgetConfig>
  router: Required<Omit<RouterConfig, 'forceEngine'>> & Pick<RouterConfig, 'forceEngine'>
  toolSelection: Required<Omit<ToolSelectionConfig, 'firstIterationToolChoice'>> &
    Pick<ToolSelectionConfig, 'firstIterationToolChoice'>
  middleware: Required<MiddlewareConfig>
  toolExecution: Required<ToolExecutionConfig>
  trace: Required<TraceConfig>
}
