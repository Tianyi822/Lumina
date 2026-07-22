// src/main/services/chat/harness/config/resolveConfig.ts
/**
 * 三层配置合并算法。
 *
 * 优先级:DEFAULT < userGlobal(appConfig.agent) < preset < request.harnessOverrides
 *
 * Spec: docs/superpowers/specs/2026-07-21-agent-harness-design.md §3.6
 */
import type { AppConfig } from '@shared/types/config'
import type { ChatRequest } from '@shared/types/chat'
import type { HarnessConfig, ResolvedHarnessConfig } from './HarnessConfig'
import type { SessionType } from '../HarnessContext'
import { DEFAULT_HARNESS_CONFIG } from './defaultConfig'
import { PRESET_OVERRIDES } from './presetOverrides'
import { translateLegacyFlags } from './requestOverrides'

/**
 * 深合并:plain object 递归合并,数组与原始值覆盖。
 * 忽略 undefined(让默认值生效),保留 null。
 */
export function deepMerge<T>(...sources: unknown[]): T {
  const result: Record<string, unknown> = {}
  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (value === undefined) continue
      const existing = result[key]
      if (
        existing &&
        typeof existing === 'object' &&
        !Array.isArray(existing) &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        result[key] = deepMerge(existing, value)
      } else {
        result[key] = value
      }
    }
  }
  return result as T
}

/**
 * 三层合并,产出最终 ResolvedHarnessConfig。
 * 合并只算一次,贯穿整个 run 写入 ctx.config。
 */
export function resolveHarnessConfig(
  sessionType: SessionType,
  appConfig: AppConfig,
  request: ChatRequest
): ResolvedHarnessConfig {
  const userGlobal = (appConfig.agent ?? {}) as HarnessConfig
  const preset = PRESET_OVERRIDES[sessionType] ?? {}
  const legacyFlags = translateLegacyFlags({
    enablePlanMode: request.enablePlanMode
  })
  const requestLevel = {
    ...(request.harnessOverrides as HarnessConfig | undefined),
    ...legacyFlags
  } as HarnessConfig

  return deepMerge<ResolvedHarnessConfig>(
    DEFAULT_HARNESS_CONFIG,
    userGlobal,
    preset,
    requestLevel
  )
}
