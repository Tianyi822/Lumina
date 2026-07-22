// src/main/services/chat/harness/config/presetOverrides.ts
/**
 * 第 2 层:预设覆盖(按 sessionType)。
 * 只覆盖需要差异化的字段,其余从全局默认继承(深合并)。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §3.4
 */
import type { HarnessConfig } from './HarnessConfig'
import type { SessionType } from '../HarnessContext'

export const PRESET_OVERRIDES: Record<SessionType, HarnessConfig> = {
  paper: {
    budget: { maxTokenBudget: 60_000, budgetAction: 'finalize' },
    toolSelection: { enableFewShot: true, enableSubsetFilter: true }
  },
  lab: {
    budget: {
      maxTokenBudget: 100_000,
      maxToolCallCount: 60,
      budgetAction: 'abort'
    },
    toolExecution: { labTimeoutMs: 180_000 }
  },
  knowledge: {
    budget: { maxTokenBudget: 30_000, maxToolCallCount: 20 }
  },
  default: {}
}
