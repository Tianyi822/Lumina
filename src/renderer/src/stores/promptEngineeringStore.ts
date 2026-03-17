/**
 * 提示词工程增强 Store
 * 管理提示词配置、Few-shot 示例、动态变量和测试沙盘状态
 */

import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  EnhancedFewShotExample,
  ExampleFilter,
  ExampleStats,
  ImportResult,
  PromptVariable,
  TestPromptPayload,
  TestPromptResult
} from '@shared/types/prompt'
import type { PromptConfig } from '@shared/types/config'
import {
  getSystemPromptVariables,
  isReservedPromptVariableName,
  isValidPromptVariableName,
  normalizeCustomPromptVariables,
  sanitizePromptVariableValue
} from '@shared/utils'

/** Tab 类型定义 */
export type PromptEngineeringTab = 'basic' | 'variables' | 'examples' | 'sandbox'

/** 变量覆盖类型 */
export type VariableOverrides = Record<string, string>

/**
 * 创建默认提示词配置
 */
function createDefaultPromptConfig(): PromptConfig {
  return {
    enableEnhancedPrompt: true,
    toolDescriptionLevel: 'detailed',
    fewShotCount: 3,
    customSystemPrompt: '',
    enablePromptCache: false,
    enableDynamicExamples: false,
    autoExtractIntervalDays: 7,
    dynamicExampleMinQuality: 0.6,
    maxStaticExamples: 10,
    maxDynamicExamples: 20,
    enablePromptOptimization: false,
    optimizationAggressiveness: 'balanced',
    customVariables: []
  }
}

/**
 * 规范化提示词配置
 */
function normalizePromptConfig(config?: PromptConfig | null): PromptConfig {
  const defaults = createDefaultPromptConfig()

  return {
    ...defaults,
    ...config,
    customVariables: normalizeCustomPromptVariables(config?.customVariables)
  }
}

/**
 * 清理变量覆盖值
 */
function sanitizeVariableOverrides(overrides?: VariableOverrides): VariableOverrides {
  const sanitizedOverrides: VariableOverrides = {}

  for (const [name, value] of Object.entries(overrides ?? {})) {
    if (value.trim() !== '') {
      sanitizedOverrides[name] = value
    }
  }

  return sanitizedOverrides
}

export const usePromptEngineeringStore = defineStore(
  'promptEngineering',
  () => {
    // ==================== State ====================

    const activeTab = ref<PromptEngineeringTab>('basic')
    const promptConfig = ref<PromptConfig>(createDefaultPromptConfig())
    const examples = ref<EnhancedFewShotExample[]>([])
    const examplesStats = ref<ExampleStats | null>(null)
    const exampleFilter = ref<ExampleFilter>({ source: 'all' })
    const sandboxResult = ref<TestPromptResult | null>(null)
    const assembledPrompt = ref('')
    const variableOverrides = ref<VariableOverrides>({})
    const initializingCounter = ref(0)
    const configLoadingCounter = ref(0)
    const examplesLoadingCounter = ref(0)
    const sandboxLoadingCounter = ref(0)
    const saving = ref(false)
    const error = ref<string | null>(null)

    const initializing = computed(() => initializingCounter.value > 0)
    const configLoading = computed(() => configLoadingCounter.value > 0)
    const examplesLoading = computed(() => examplesLoadingCounter.value > 0)
    const sandboxLoading = computed(() => sandboxLoadingCounter.value > 0)
    const loading = computed(() => {
      return (
        initializing.value || configLoading.value || examplesLoading.value || sandboxLoading.value
      )
    })

    // ==================== Getters ====================

    const systemVariables = computed(() => getSystemPromptVariables())

    const customVariables = computed(() => {
      return normalizeCustomPromptVariables(promptConfig.value.customVariables)
    })

    const allVariables = computed(() => {
      return [...systemVariables.value, ...customVariables.value]
    })

    const hasExamples = computed(() => examples.value.length > 0)

    const filteredExamples = computed(() => {
      let result = [...examples.value]
      const filter = exampleFilter.value

      if (filter.source && filter.source !== 'all') {
        result = result.filter((example) => example.source === filter.source)
      }

      if (filter.minQualityScore !== undefined) {
        const minQualityScore = filter.minQualityScore
        result = result.filter((example) => example.qualityScore >= minQualityScore)
      }

      if (filter.toolName) {
        result = result.filter((example) => example.toolsUsed.includes(filter.toolName!))
      }

      if (filter.toolNames && filter.toolNames.length > 0) {
        result = result.filter((example) =>
          filter.toolNames!.some((toolName) => example.toolsUsed.includes(toolName))
        )
      }

      if (filter.searchQuery) {
        const query = filter.searchQuery.toLowerCase()
        result = result.filter(
          (example) =>
            example.userQuery.toLowerCase().includes(query) ||
            example.finalAnswer.toLowerCase().includes(query) ||
            example.thought.toLowerCase().includes(query)
        )
      }

      if (filter.dateRange) {
        const start = new Date(filter.dateRange.start).getTime()
        const end = new Date(filter.dateRange.end).getTime()
        result = result.filter((example) => {
          const created = new Date(example.createdAt).getTime()
          return created >= start && created <= end
        })
      }

      if (filter.sortBy) {
        const order = filter.sortOrder === 'asc' ? 1 : -1
        switch (filter.sortBy) {
          case 'quality':
            result.sort((left, right) => (left.qualityScore - right.qualityScore) * order)
            break
          case 'usage':
            result.sort((left, right) => (left.usageCount - right.usageCount) * order)
            break
          case 'date':
            result.sort((left, right) => {
              const leftTime = new Date(left.createdAt).getTime()
              const rightTime = new Date(right.createdAt).getTime()
              return (leftTime - rightTime) * order
            })
            break
        }
      } else {
        result.sort((left, right) => right.qualityScore - left.qualityScore)
      }

      return result
    })

    const staticExampleCount = computed(() => {
      return examples.value.filter((example) => example.source === 'static').length
    })

    const dynamicExampleCount = computed(() => {
      return examples.value.filter((example) => example.source === 'dynamic').length
    })

    // ==================== 私有方法 ====================

    /**
     * 开始加载状态
     */
    function startScopedLoading(counter: Ref<number>): void {
      counter.value += 1
    }

    /**
     * 结束加载状态
     */
    function stopScopedLoading(counter: Ref<number>): void {
      counter.value = Math.max(0, counter.value - 1)
    }

    /**
     * 获取标准错误消息
     */
    function getErrorMessage(prefix: string, target: unknown): string {
      const message = target instanceof Error ? target.message : String(target)
      return `${prefix}: ${message}`
    }

    /**
     * 覆盖当前自定义变量并持久化
     */
    async function persistCustomVariables(nextVariables: PromptVariable[]): Promise<boolean> {
      const previousVariables = customVariables.value.map((variable) => ({ ...variable }))

      updatePromptConfig({
        customVariables: normalizeCustomPromptVariables(nextVariables)
      })

      const saved = await saveConfig()
      if (!saved) {
        updatePromptConfig({ customVariables: previousVariables })
      }

      return saved
    }

    /**
     * 构建测试沙盘载荷
     */
    function buildSandboxPayload(payload: TestPromptPayload): TestPromptPayload {
      return {
        ...payload,
        userQuery: payload.userQuery.trim(),
        includeExamples: payload.includeExamples ?? true,
        exampleCount: Math.max(0, Math.min(5, payload.exampleCount ?? 3)),
        variables: sanitizeVariableOverrides(payload.variables)
      }
    }

    // ==================== 通用 Actions ====================

    /**
     * 设置当前激活的 Tab
     */
    function setActiveTab(tab: PromptEngineeringTab): void {
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

    // ==================== 配置管理 ====================

    /**
     * 加载提示词配置
     */
    async function loadConfig(): Promise<void> {
      startScopedLoading(configLoadingCounter)
      error.value = null

      try {
        const config = await window.api.promptEngineering.getConfig()
        promptConfig.value = normalizePromptConfig(config)
      } catch (target) {
        error.value = getErrorMessage('加载配置失败', target)
        promptConfig.value = createDefaultPromptConfig()
      } finally {
        stopScopedLoading(configLoadingCounter)
      }
    }

    /**
     * 保存提示词配置
     */
    async function saveConfig(): Promise<boolean> {
      saving.value = true
      error.value = null

      try {
        const result = await window.api.promptEngineering.updateConfig(
          normalizePromptConfig(promptConfig.value)
        )

        if (!result.success) {
          error.value = result.error || '保存配置失败'
          return false
        }

        promptConfig.value = normalizePromptConfig(promptConfig.value)
        return true
      } catch (target) {
        error.value = getErrorMessage('保存配置失败', target)
        return false
      } finally {
        saving.value = false
      }
    }

    /**
     * 更新提示词配置（部分更新）
     */
    function updatePromptConfig(config: Partial<PromptConfig>): void {
      promptConfig.value = normalizePromptConfig({
        ...promptConfig.value,
        ...config
      })
    }

    /**
     * 重置提示词配置
     */
    async function resetPromptConfig(): Promise<{
      success: boolean
      config?: PromptConfig
      error?: string
    }> {
      startScopedLoading(configLoadingCounter)
      error.value = null

      try {
        const result = await window.api.promptEngineering.resetConfig()

        if (!result.success || !result.config) {
          const errorMessage = result.error || '重置提示词配置失败'
          error.value = errorMessage
          return { success: false, error: errorMessage }
        }

        const normalizedConfig = normalizePromptConfig(result.config)
        promptConfig.value = normalizedConfig

        return {
          success: true,
          config: normalizedConfig
        }
      } catch (target) {
        const errorMessage = getErrorMessage('重置提示词配置失败', target)
        error.value = errorMessage
        return { success: false, error: errorMessage }
      } finally {
        stopScopedLoading(configLoadingCounter)
      }
    }

    // ==================== 变量管理 ====================

    /**
     * 校验变量名
     */
    function validateVariableName(name: string, originalName?: string): string | null {
      const normalizedName = name.trim()

      if (!normalizedName) {
        return '变量名不能为空'
      }

      if (!isValidPromptVariableName(normalizedName)) {
        return '变量名只能包含字母、数字和下划线，且必须以字母开头'
      }

      if (isReservedPromptVariableName(normalizedName) && normalizedName !== originalName) {
        return `变量名 ${normalizedName} 为系统保留变量`
      }

      const hasDuplicate = customVariables.value.some((variable) => {
        if (originalName && variable.name === originalName) {
          return false
        }

        return variable.name === normalizedName
      })

      if (hasDuplicate) {
        return `变量名 ${normalizedName} 已存在`
      }

      return null
    }

    /**
     * 新增或更新自定义变量
     */
    async function saveCustomVariable(
      variable: Pick<PromptVariable, 'name' | 'description' | 'defaultValue'>,
      originalName?: string
    ): Promise<{ success: boolean; error?: string }> {
      const name = variable.name.trim()
      const nameError = validateVariableName(name, originalName)

      if (nameError) {
        error.value = nameError
        return { success: false, error: nameError }
      }

      const nextVariable: PromptVariable = {
        name,
        description: variable.description.trim(),
        defaultValue: sanitizePromptVariableValue(variable.defaultValue),
        type: 'custom',
        category: 'custom',
        editable: true,
        valueType: 'string'
      }

      const nextVariables = customVariables.value
        .filter((item) => item.name !== originalName)
        .concat(nextVariable)

      const saved = await persistCustomVariables(nextVariables)
      if (!saved) {
        return { success: false, error: error.value || '保存变量失败' }
      }

      return { success: true }
    }

    /**
     * 删除自定义变量
     */
    async function deleteCustomVariable(name: string): Promise<boolean> {
      error.value = null
      const nextVariables = customVariables.value.filter((variable) => variable.name !== name)
      return persistCustomVariables(nextVariables)
    }

    // ==================== 示例管理 ====================

    /**
     * 加载示例列表
     */
    async function loadExamples(): Promise<void> {
      startScopedLoading(examplesLoadingCounter)
      error.value = null

      try {
        const result = await window.api.promptEngineering.listExamples()
        if (!result.success || !result.examples) {
          error.value = result.error || '加载示例失败'
          return
        }

        examples.value = result.examples
      } catch (target) {
        error.value = getErrorMessage('加载示例失败', target)
      } finally {
        stopScopedLoading(examplesLoadingCounter)
      }
    }

    /**
     * 加载示例统计信息
     */
    async function loadExampleStats(): Promise<void> {
      startScopedLoading(examplesLoadingCounter)

      try {
        const result = await window.api.promptEngineering.getExampleStats()
        if (result.success && result.stats) {
          examplesStats.value = result.stats
        } else if (!result.success) {
          error.value = result.error || '加载示例统计失败'
        }
      } catch (target) {
        error.value = getErrorMessage('加载示例统计失败', target)
      } finally {
        stopScopedLoading(examplesLoadingCounter)
      }
    }

    /**
     * 设置示例筛选条件
     */
    function setExampleFilter(filter: Partial<ExampleFilter>): void {
      exampleFilter.value = { ...exampleFilter.value, ...filter }
    }

    /**
     * 重置示例筛选条件
     */
    function resetExampleFilter(): void {
      exampleFilter.value = { source: 'all' }
    }

    /**
     * 更新示例
     */
    async function updateExample(example: EnhancedFewShotExample): Promise<boolean> {
      startScopedLoading(examplesLoadingCounter)
      error.value = null

      try {
        const result = await window.api.promptEngineering.updateExample(example)
        if (!result.success) {
          error.value = result.error || '更新示例失败'
          return false
        }

        await Promise.all([loadExamples(), loadExampleStats()])
        return true
      } catch (target) {
        error.value = getErrorMessage('更新示例失败', target)
        return false
      } finally {
        stopScopedLoading(examplesLoadingCounter)
      }
    }

    /**
     * 删除示例（支持批量）
     */
    async function deleteExamples(ids: string[]): Promise<boolean> {
      startScopedLoading(examplesLoadingCounter)
      error.value = null

      try {
        const result = await window.api.promptEngineering.deleteExamples(ids)
        if (!result.success) {
          error.value = result.error || '删除示例失败'
          return false
        }

        await Promise.all([loadExamples(), loadExampleStats()])
        return true
      } catch (target) {
        error.value = getErrorMessage('删除示例失败', target)
        return false
      } finally {
        stopScopedLoading(examplesLoadingCounter)
      }
    }

    /**
     * 从会话提取示例
     */
    async function extractFromSessions(): Promise<{ success: boolean; extracted?: number }> {
      startScopedLoading(examplesLoadingCounter)
      error.value = null

      try {
        const result = await window.api.promptEngineering.extractExamplesFromSessions()
        if (!result.success) {
          error.value = result.error || '从会话提取示例失败'
          return { success: false }
        }

        await Promise.all([loadExamples(), loadExampleStats()])
        return { success: true, extracted: result.result?.extracted || 0 }
      } catch (target) {
        error.value = getErrorMessage('从会话提取示例失败', target)
        return { success: false }
      } finally {
        stopScopedLoading(examplesLoadingCounter)
      }
    }

    /**
     * 导入示例
     */
    async function importExamples(json: string): Promise<ImportResult> {
      startScopedLoading(examplesLoadingCounter)
      error.value = null

      try {
        const result = await window.api.promptEngineering.importExamples(json)
        if (result.success && result.imported > 0) {
          await Promise.all([loadExamples(), loadExampleStats()])
        }
        return result
      } catch (target) {
        const errorMessage = getErrorMessage('导入示例失败', target)
        error.value = errorMessage
        return {
          success: false,
          imported: 0,
          skipped: 0,
          errors: [errorMessage]
        }
      } finally {
        stopScopedLoading(examplesLoadingCounter)
      }
    }

    /**
     * 导出示例
     */
    async function exportExamples(): Promise<{ success: boolean; json?: string; error?: string }> {
      startScopedLoading(examplesLoadingCounter)
      error.value = null

      try {
        return await window.api.promptEngineering.exportExamples()
      } catch (target) {
        const errorMessage = getErrorMessage('导出示例失败', target)
        error.value = errorMessage
        return { success: false, error: errorMessage }
      } finally {
        stopScopedLoading(examplesLoadingCounter)
      }
    }

    /**
     * 清空动态示例
     */
    async function clearDynamicExamples(): Promise<{ success: boolean; deletedCount?: number }> {
      startScopedLoading(examplesLoadingCounter)
      error.value = null

      try {
        const result = await window.api.promptEngineering.clearDynamicExamples()
        if (!result.success) {
          error.value = result.error || '清空动态示例失败'
          return { success: false }
        }

        await Promise.all([loadExamples(), loadExampleStats()])
        return { success: true, deletedCount: result.deletedCount }
      } catch (target) {
        error.value = getErrorMessage('清空动态示例失败', target)
        return { success: false }
      } finally {
        stopScopedLoading(examplesLoadingCounter)
      }
    }

    // ==================== 测试沙盘 ====================

    /**
     * 设置变量覆盖值
     */
    function setVariableOverrides(overrides: VariableOverrides): void {
      variableOverrides.value = sanitizeVariableOverrides(overrides)
    }

    /**
     * 更新单个变量覆盖值
     */
    function updateVariableOverride(name: string, value: string): void {
      const nextOverrides = { ...variableOverrides.value }

      if (value.trim() === '') {
        delete nextOverrides[name]
      } else {
        nextOverrides[name] = value
      }

      variableOverrides.value = nextOverrides
    }

    /**
     * 清除变量覆盖值
     */
    function clearVariableOverrides(): void {
      variableOverrides.value = {}
    }

    /**
     * 预览组装后的提示词（不调用模型）
     */
    async function previewPrompt(payload: TestPromptPayload): Promise<boolean> {
      startScopedLoading(sandboxLoadingCounter)
      error.value = null

      try {
        const result = await window.api.promptEngineering.previewPrompt(
          buildSandboxPayload(payload)
        )
        if (!result.success || !result.prompt) {
          error.value = result.error || '预览提示词失败'
          return false
        }

        assembledPrompt.value = result.prompt
        return true
      } catch (target) {
        error.value = getErrorMessage('预览提示词失败', target)
        return false
      } finally {
        stopScopedLoading(sandboxLoadingCounter)
      }
    }

    /**
     * 执行测试（调用模型）
     */
    async function runSandboxTest(payload: TestPromptPayload): Promise<boolean> {
      startScopedLoading(sandboxLoadingCounter)
      error.value = null
      sandboxResult.value = null

      try {
        const result = await window.api.promptEngineering.testPrompt(buildSandboxPayload(payload))
        sandboxResult.value = result

        if (!result.success) {
          error.value = result.error || '测试执行失败'
          return false
        }

        if (result.assembledPrompt) {
          assembledPrompt.value = result.assembledPrompt
        }

        return true
      } catch (target) {
        const errorMessage = getErrorMessage('测试执行失败', target)
        error.value = errorMessage
        sandboxResult.value = {
          success: false,
          error: errorMessage
        }
        return false
      } finally {
        stopScopedLoading(sandboxLoadingCounter)
      }
    }

    /**
     * 清除测试结果
     */
    function clearSandboxResult(): void {
      sandboxResult.value = null
      assembledPrompt.value = ''
    }

    // ==================== 初始化 ====================

    /**
     * 初始化 Store（加载配置和示例）
     */
    async function initialize(): Promise<void> {
      startScopedLoading(initializingCounter)

      try {
        await Promise.all([loadConfig(), loadExamples(), loadExampleStats()])
      } finally {
        stopScopedLoading(initializingCounter)
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
      exampleFilter.value = { source: 'all' }
      sandboxResult.value = null
      assembledPrompt.value = ''
      variableOverrides.value = {}
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
      staticExampleCount,
      dynamicExampleCount,

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
