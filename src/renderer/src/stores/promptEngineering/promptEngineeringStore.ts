import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  EnhancedFewShotExample,
  ExampleFilter,
  ExampleStats,
  TestPromptResult
} from '@shared/types/prompt'
import {
  getSystemPromptVariables,
  normalizeCustomPromptVariables
} from '@shared/utils'
import type {
  PromptEngineeringStoreRefs,
  PromptEngineeringTab,
  VariableOverrides
} from './types'
import { createPromptEngineeringConfigActions } from './configActions'
import { createPromptEngineeringVariableActions } from './variableActions'
import { createPromptEngineeringExampleActions } from './exampleActions'
import { createPromptEngineeringSandboxActions } from './sandboxActions'
import { createFilteredExamples } from './exampleSelectors'
import { createDefaultPromptConfig } from './utils'

/**
 * 提示词工程增强 Store
 * 管理提示词配置、Few-shot 示例、动态变量和测试沙盘状态
 */
export const usePromptEngineeringStore = defineStore(
  'promptEngineering',
  () => {
    // ==================== State ====================

    const activeTab = ref<PromptEngineeringTab>('basic')
    const promptConfig = ref(createDefaultPromptConfig())
    const examples = ref<EnhancedFewShotExample[]>([])
    const examplesStats = ref<ExampleStats | null>(null)
    const exampleFilter = ref<ExampleFilter>({})
    const sandboxResult = ref<TestPromptResult | null>(null)
    const assembledPrompt = ref('')
    const variableOverrides = ref<VariableOverrides>({})
    const sandboxTesting = ref(false)
    const initializingCounter = ref(0)
    const configLoadingCounter = ref(0)
    const examplesLoadingCounter = ref(0)
    const sandboxLoadingCounter = ref(0)
    const saving = ref(false)
    const error = ref<string | null>(null)

    const systemVariables = computed(() => getSystemPromptVariables())
    const customVariables = computed(() => {
      return normalizeCustomPromptVariables(promptConfig.value.customVariables)
    })
    const allVariables = computed(() => {
      return [...systemVariables.value, ...customVariables.value]
    })
    const hasExamples = computed(() => examples.value.length > 0)
    const filteredExamples = createFilteredExamples(examples, exampleFilter)

    const initializing = computed(() => initializingCounter.value > 0)
    const configLoading = computed(() => configLoadingCounter.value > 0)
    const examplesLoading = computed(() => examplesLoadingCounter.value > 0)
    const sandboxLoading = computed(() => sandboxLoadingCounter.value > 0)
    const loading = computed(() => {
      return (
        initializing.value || configLoading.value || examplesLoading.value || sandboxLoading.value
      )
    })

    const storeRefs: PromptEngineeringStoreRefs = {
      activeTab,
      promptConfig,
      examples,
      examplesStats,
      exampleFilter,
      sandboxResult,
      assembledPrompt,
      variableOverrides,
      sandboxTesting,
      initializingCounter,
      configLoadingCounter,
      examplesLoadingCounter,
      sandboxLoadingCounter,
      saving,
      error,
      customVariables
    }

    const { loadConfig, saveConfig, updatePromptConfig, resetPromptConfig } =
      createPromptEngineeringConfigActions(storeRefs)
    const { validateVariableName, saveCustomVariable, deleteCustomVariable } =
      createPromptEngineeringVariableActions({
        customVariables,
        error,
        updatePromptConfig,
        saveConfig
      })
    const {
      loadExamples,
      loadExampleStats,
      setExampleFilter,
      resetExampleFilter,
      updateExample,
      deleteExamples,
      extractFromSessions,
      importExamples,
      exportExamples,
      clearDynamicExamples
    } = createPromptEngineeringExampleActions(storeRefs)
    const {
      setVariableOverrides,
      updateVariableOverride,
      clearVariableOverrides,
      previewPrompt,
      runSandboxTest,
      clearSandboxResult
    } = createPromptEngineeringSandboxActions(storeRefs)

    // ==================== 通用 Actions ====================

    /**
     * 设置当前激活的 Tab
     */
    function setActiveTab(tab: typeof activeTab.value): void {
      activeTab.value = tab
    }

    /**
     * 设置错误信息
     */
    function setError(errorMessage: string | null): void {
      error.value = errorMessage
    }

    /**
     * 清除错误信息
     */
    function clearError(): void {
      error.value = null
    }

    // ==================== 初始化 ====================

    /**
     * 初始化 Store（加载配置和示例）
     */
    async function initialize(): Promise<void> {
      initializingCounter.value += 1

      try {
        await Promise.all([loadConfig(), loadExamples(), loadExampleStats()])
      } finally {
        initializingCounter.value = Math.max(0, initializingCounter.value - 1)
      }
    }

    /**
     * 重置 Store 状态
     */
    function reset(): void {
      activeTab.value = 'basic'
      promptConfig.value = createDefaultPromptConfig()
      examples.value = []
      examplesStats.value = null
      exampleFilter.value = {}
      sandboxResult.value = null
      assembledPrompt.value = ''
      variableOverrides.value = {}
      sandboxTesting.value = false
      saving.value = false
      error.value = null
      initializingCounter.value = 0
      configLoadingCounter.value = 0
      examplesLoadingCounter.value = 0
      sandboxLoadingCounter.value = 0
    }

    return {
      // State
      activeTab,
      promptConfig,
      examples,
      examplesStats,
      exampleFilter,
      sandboxResult,
      assembledPrompt,
      variableOverrides,
      sandboxTesting,
      initializing,
      configLoading,
      examplesLoading,
      sandboxLoading,
      loading,
      saving,
      error,

      // Getters
      systemVariables,
      customVariables,
      allVariables,
      hasExamples,
      filteredExamples,

      // Actions - 通用
      setActiveTab,
      setError,
      clearError,

      // Actions - 配置管理
      loadConfig,
      saveConfig,
      resetPromptConfig,
      updatePromptConfig,

      // Actions - 变量管理
      validateVariableName,
      saveCustomVariable,
      deleteCustomVariable,

      // Actions - 示例管理
      loadExamples,
      loadExampleStats,
      setExampleFilter,
      resetExampleFilter,
      updateExample,
      deleteExamples,
      extractFromSessions,
      importExamples,
      exportExamples,
      clearDynamicExamples,

      // Actions - 测试沙盘
      setVariableOverrides,
      updateVariableOverride,
      clearVariableOverrides,
      previewPrompt,
      runSandboxTest,
      clearSandboxResult,

      // Actions - 初始化
      initialize,
      reset
    }
  },
  {
    persist: {
      key: 'sparrow-prompt-engineering-state',
      pick: ['activeTab']
    }
  }
)
