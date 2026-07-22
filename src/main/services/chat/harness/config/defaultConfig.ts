// src/main/services/chat/harness/config/defaultConfig.ts
/**
 * 全局默认配置(代码常量)。三层合并的第 1 层。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §3.3
 */
import type { ResolvedHarnessConfig } from './HarnessConfig'

export const DEFAULT_HARNESS_CONFIG: ResolvedHarnessConfig = {
  budget: {
    maxIterations: 30,
    maxPlanStepIterations: 5,
    maxTokenBudget: 60_000,
    maxToolCallCount: 40,
    maxRepeatedCalls: 3,
    budgetAction: 'finalize'
  },
  router: {
    planExecuteComplexityThreshold: 7,
    enableHeuristic: true,
    forceEngine: undefined
  },
  toolSelection: {
    enableSubsetFilter: true,
    enableFewShot: true,
    defaultToolChoice: 'auto',
    firstIterationToolChoice: undefined
  },
  middleware: {
    enableDuplicateDetector: true,
    enableArgValidator: true,
    enableDependencyAnalyzer: true,
    enableTraceRecorder: true
  },
  toolExecution: {
    defaultTimeoutMs: 60_000,
    labTimeoutMs: 180_000,
    maxConcurrency: 3
  },
  trace: {
    persistToDisk: true,
    redactSecrets: true,
    maxFileRetentionDays: 7
  }
}
