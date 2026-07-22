// src/main/services/chat/harness/config/requestOverrides.ts
/**
 * 第 3 层:请求级覆盖。
 * 现有 enablePlanMode 等布尔开关翻译为 harnessOverrides(向后兼容)。
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §3.5
 */
import type { HarnessConfig } from './HarnessConfig'

/** ChatRequest 上的 legacy 布尔标志(向后兼容) */
interface LegacyFlags {
  enablePlanMode?: boolean
}

/**
 * 把 legacy 布尔标志翻译为 HarnessConfig 覆盖。
 * - enablePlanMode=true → router.forceEngine = 'plan_execute'
 */
export function translateLegacyFlags(flags: LegacyFlags): HarnessConfig {
  const overrides: HarnessConfig = {}

  if (flags.enablePlanMode === true) {
    overrides.router = { forceEngine: 'plan_execute' }
  }

  return overrides
}
