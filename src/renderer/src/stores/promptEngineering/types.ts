import type { ComputedRef, Ref } from 'vue'
import type {
  EnhancedFewShotExample,
  ExampleFilter,
  ExampleStats,
  PromptVariable,
  TestPromptResult
} from '@shared/types/prompt'
import type { PromptConfig } from '@shared/types/config'

/** Tab 类型定义 */
export type PromptEngineeringTab = 'basic' | 'variables' | 'examples' | 'sandbox'

/** 变量覆盖类型 */
export type VariableOverrides = Record<string, string>

/**
 * 提示词工程 Store 状态引用
 */
export interface PromptEngineeringStoreRefs {
  activeTab: Ref<PromptEngineeringTab>
  promptConfig: Ref<PromptConfig>
  examples: Ref<EnhancedFewShotExample[]>
  examplesStats: Ref<ExampleStats | null>
  exampleFilter: Ref<ExampleFilter>
  sandboxResult: Ref<TestPromptResult | null>
  assembledPrompt: Ref<string>
  variableOverrides: Ref<VariableOverrides>
  sandboxTesting: Ref<boolean>
  initializingCounter: Ref<number>
  configLoadingCounter: Ref<number>
  examplesLoadingCounter: Ref<number>
  sandboxLoadingCounter: Ref<number>
  saving: Ref<boolean>
  error: Ref<string | null>
  customVariables: ComputedRef<PromptVariable[]>
}
