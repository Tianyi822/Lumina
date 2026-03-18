import type { Ref } from 'vue'
import type { PromptConfig } from '@shared/types/config'
import type { TestPromptPayload } from '@shared/types/prompt'
import {
  normalizeCustomPromptVariables,
  sanitizePromptVariableValue
} from '@shared/utils'
import type { VariableOverrides } from './types'

/**
 * 创建默认提示词配置
 */
export function createDefaultPromptConfig(): PromptConfig {
  return {
    enableEnhancedPrompt: true,
    toolDescriptionLevel: 'detailed',
    fewShotCount: 3,
    customSystemPrompt: '',
    enablePromptCache: false,
    enableDynamicExamples: false,
    autoExtractIntervalDays: 7,
    dynamicExampleMinQuality: 0.6,
    maxDynamicExamples: 20,
    enablePromptOptimization: false,
    optimizationAggressiveness: 'balanced',
    customVariables: []
  }
}

/**
 * 规范化提示词配置
 */
export function normalizePromptConfig(config?: PromptConfig | null): PromptConfig {
  const defaults = createDefaultPromptConfig()

  return {
    enableEnhancedPrompt: config?.enableEnhancedPrompt ?? defaults.enableEnhancedPrompt,
    toolDescriptionLevel: config?.toolDescriptionLevel ?? defaults.toolDescriptionLevel,
    fewShotCount: config?.fewShotCount ?? defaults.fewShotCount,
    customSystemPrompt: config?.customSystemPrompt ?? defaults.customSystemPrompt,
    enablePromptCache: config?.enablePromptCache ?? defaults.enablePromptCache,
    cacheConfig: config?.cacheConfig,
    enableDynamicExamples: config?.enableDynamicExamples ?? defaults.enableDynamicExamples,
    autoExtractIntervalDays: config?.autoExtractIntervalDays ?? defaults.autoExtractIntervalDays,
    dynamicExampleMinQuality: config?.dynamicExampleMinQuality ?? defaults.dynamicExampleMinQuality,
    maxDynamicExamples: config?.maxDynamicExamples ?? defaults.maxDynamicExamples,
    enablePromptOptimization: config?.enablePromptOptimization ?? defaults.enablePromptOptimization,
    optimizationAggressiveness:
      config?.optimizationAggressiveness ?? defaults.optimizationAggressiveness,
    enableToolDescriptionAdaptation: config?.enableToolDescriptionAdaptation,
    customVariables: normalizeCustomPromptVariables(config?.customVariables)
  }
}

/**
 * 清理变量覆盖值
 */
export function sanitizeVariableOverrides(overrides?: VariableOverrides): VariableOverrides {
  const sanitizedOverrides: VariableOverrides = {}

  for (const [name, value] of Object.entries(overrides ?? {})) {
    if (value.trim() !== '') {
      sanitizedOverrides[name] = value
    }
  }

  return sanitizedOverrides
}

/**
 * 清理变量默认值
 */
export function sanitizeCustomVariableValue(value?: string | null): string | undefined {
  return sanitizePromptVariableValue(value)
}

/**
 * 开始加载状态
 */
export function startScopedLoading(counter: Ref<number>): void {
  counter.value += 1
}

/**
 * 结束加载状态
 */
export function stopScopedLoading(counter: Ref<number>): void {
  counter.value = Math.max(0, counter.value - 1)
}

/**
 * 获取标准错误消息
 */
export function getErrorMessage(prefix: string, target: unknown): string {
  const message = target instanceof Error ? target.message : String(target)
  return `${prefix}: ${message}`
}

/**
 * 构建测试沙盘载荷
 */
export function buildSandboxPayload(payload: TestPromptPayload): TestPromptPayload {
  return {
    ...payload,
    userQuery: payload.userQuery.trim(),
    includeExamples: payload.includeExamples ?? true,
    exampleCount: Math.max(0, Math.min(5, payload.exampleCount ?? 3)),
    variables: sanitizeVariableOverrides(payload.variables)
  }
}
