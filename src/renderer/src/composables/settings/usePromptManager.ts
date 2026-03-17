import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePromptEngineeringStore } from '@renderer/stores'
import type { PromptConfig } from '@shared/types/config'
import type {
  EnhancedFewShotExample,
  ExampleFilter,
  PromptVariable,
  TestPromptPayload
} from '@shared/types/prompt'
import type { PromptEngineeringTab } from '@renderer/stores/promptEngineeringStore'

type FeedbackType = 'success' | 'error'

interface PromptManagerTab {
  key: PromptEngineeringTab
  label: string
}

interface PromptManagerResult {
  tabs: PromptManagerTab[]
  activeTab: Ref<PromptEngineeringTab>
  showEditDialog: Ref<boolean>
  editingExample: Ref<EnhancedFewShotExample | null>
  selectedIds: Ref<string[]>
  searchQuery: Ref<string>
  feedbackMessage: Ref<string>
  feedbackType: Ref<FeedbackType | null>
  hasFeedback: ComputedRef<boolean>
  changeTab: (tab: PromptEngineeringTab) => void
  dismissFeedback: () => void
  setSelectedIds: (ids: string[]) => void
  updateExampleFilter: (filter: Partial<ExampleFilter>) => void
  updateSearchQuery: (value: string) => void
  openCreateExampleDialog: () => void
  openEditExampleDialog: (example: EnhancedFewShotExample) => void
  closeEditDialog: () => void
  saveExample: (
    example: Omit<EnhancedFewShotExample, 'id' | 'createdAt' | 'usageCount'>
  ) => Promise<boolean>
  confirmDeleteExamples: (ids: string[]) => Promise<boolean>
  confirmClearDynamicExamples: () => Promise<boolean>
  importExamplesFromFile: () => Promise<void>
  exportExamplesToFile: () => Promise<boolean>
  extractExamplesFromSessions: () => Promise<boolean>
  savePromptConfig: (config: PromptConfig) => Promise<boolean>
  resetPromptConfig: () => Promise<boolean>
  saveCustomVariable: (
    variable: Pick<PromptVariable, 'name' | 'description' | 'defaultValue'>,
    originalName?: string
  ) => Promise<{ success: boolean; error?: string }>
  deleteCustomVariable: (name: string) => Promise<boolean>
  previewSandbox: (payload: TestPromptPayload) => Promise<boolean>
  runSandboxTest: (payload: TestPromptPayload) => Promise<boolean>
  clearSandboxResult: () => void
  clearVariableOverrides: () => void
  updateVariableOverride: (name: string, value: string) => void
  initialize: () => Promise<void>
  cleanup: () => void
}

const tabs: PromptManagerTab[] = [
  { key: 'basic', label: '基础配置' },
  { key: 'variables', label: '动态变量' },
  { key: 'examples', label: '示例管理' },
  { key: 'sandbox', label: '测试沙盘' }
]

const feedbackMessage = ref('')
const feedbackType = ref<FeedbackType | null>(null)
const showEditDialog = ref(false)
const editingExample = ref<EnhancedFewShotExample | null>(null)
const selectedIds = ref<string[]>([])
const searchQuery = ref('')

let feedbackTimer: number | null = null
let searchTimer: number | null = null

function clearFeedbackTimer(): void {
  if (feedbackTimer !== null) {
    window.clearTimeout(feedbackTimer)
    feedbackTimer = null
  }
}

function clearSearchTimer(): void {
  if (searchTimer !== null) {
    window.clearTimeout(searchTimer)
    searchTimer = null
  }
}

function getErrorMessage(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `${prefix}: ${message}`
}

export function usePromptManager(): PromptManagerResult {
  const store = usePromptEngineeringStore()
  const { activeTab, error, examples, exampleFilter, examplesStats } = storeToRefs(store)

  const hasFeedback = computed(() => feedbackMessage.value.trim().length > 0)

  function dismissFeedback(): void {
    clearFeedbackTimer()
    feedbackMessage.value = ''
    feedbackType.value = null
    store.clearError()
  }

  function showFeedback(message: string, type: FeedbackType, duration = 2600): void {
    clearFeedbackTimer()
    feedbackMessage.value = message
    feedbackType.value = type

    feedbackTimer = window.setTimeout(() => {
      feedbackMessage.value = ''
      feedbackType.value = null
      feedbackTimer = null
      if (type === 'error') {
        store.clearError()
      }
    }, duration)
  }

  function showSuccess(message: string): void {
    store.clearError()
    showFeedback(message, 'success')
  }

  function showError(message: string): void {
    store.setError(message)
    showFeedback(message, 'error', 4200)
  }

  function resolveActionError(fallbackMessage: string): string {
    return error.value || fallbackMessage
  }

  function changeTab(tab: PromptEngineeringTab): void {
    store.setActiveTab(tab)
    dismissFeedback()
  }

  function setSelectedIds(ids: string[]): void {
    selectedIds.value = ids
  }

  function syncSelectedIds(): void {
    const currentIds = new Set(examples.value.map((example) => example.id))
    selectedIds.value = selectedIds.value.filter((id) => currentIds.has(id))
  }

  function updateExampleFilter(filter: Partial<ExampleFilter>): void {
    store.setExampleFilter(filter)
  }

  function updateSearchQuery(value: string): void {
    searchQuery.value = value
    clearSearchTimer()

    searchTimer = window.setTimeout(() => {
      store.setExampleFilter({
        searchQuery: value.trim() ? value : undefined
      })
      searchTimer = null
    }, 300)
  }

  function openCreateExampleDialog(): void {
    dismissFeedback()
    editingExample.value = null
    showEditDialog.value = true
  }

  function openEditExampleDialog(example: EnhancedFewShotExample): void {
    dismissFeedback()
    editingExample.value = { ...example }
    showEditDialog.value = true
  }

  function closeEditDialog(): void {
    showEditDialog.value = false
    editingExample.value = null
  }

  async function saveExample(
    example: Omit<EnhancedFewShotExample, 'id' | 'createdAt' | 'usageCount'>
  ): Promise<boolean> {
    dismissFeedback()

    const saved = editingExample.value
      ? await store.updateExample({
          ...editingExample.value,
          ...example
        })
      : await store.addExample(example)

    if (!saved) {
      showError(resolveActionError('保存示例失败'))
      return false
    }

    showSuccess(editingExample.value ? '示例已更新' : '示例已添加')
    closeEditDialog()
    syncSelectedIds()

    return true
  }

  async function confirmDeleteExamples(ids: string[]): Promise<boolean> {
    if (ids.length === 0) {
      return false
    }

    const confirmed = window.confirm(
      ids.length > 1
        ? `确定要删除选中的 ${ids.length} 个示例吗？\n\n删除后将无法恢复。`
        : '确定要删除这个示例吗？\n\n删除后将无法恢复。'
    )

    if (!confirmed) {
      return false
    }

    dismissFeedback()

    const deleted = await store.deleteExamples(ids)
    if (!deleted) {
      showError(resolveActionError('删除示例失败'))
      return false
    }

    selectedIds.value = selectedIds.value.filter((id) => !ids.includes(id))
    syncSelectedIds()
    showSuccess(ids.length > 1 ? '示例已批量删除' : '示例已删除')

    return true
  }

  async function confirmClearDynamicExamples(): Promise<boolean> {
    const dynamicCount = examplesStats.value?.dynamic ?? 0
    if (dynamicCount === 0) {
      return false
    }

    const confirmed = window.confirm(
      `确定要清空全部 ${dynamicCount} 个动态示例吗？\n\n静态示例不会受到影响。`
    )

    if (!confirmed) {
      return false
    }

    dismissFeedback()

    const result = await store.clearDynamicExamples()
    if (!result.success) {
      showError(resolveActionError('清空动态示例失败'))
      return false
    }

    selectedIds.value = []
    showSuccess(`已清空 ${result.deletedCount ?? 0} 个动态示例`)

    return true
  }

  async function importExamplesFromFile(): Promise<void> {
    dismissFeedback()

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'

    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) {
        return
      }

      try {
        const json = await file.text()
        const result = await store.importExamples(json)

        if (!result.success) {
          showError(result.errors[0] || resolveActionError('导入示例失败'))
          return
        }

        selectedIds.value = []

        const summaryParts = [`已导入 ${result.imported} 个示例`]
        if (result.skipped > 0) {
          summaryParts.push(`跳过 ${result.skipped} 个`)
        }
        if (result.warnings && result.warnings.length > 0) {
          summaryParts.push(`${result.warnings.length} 条警告`)
        }

        showSuccess(summaryParts.join('，'))
      } catch (target) {
        showError(getErrorMessage('导入示例失败', target))
      }
    }

    input.click()
  }

  async function exportExamplesToFile(): Promise<boolean> {
    dismissFeedback()

    const result = await store.exportExamples()
    if (!result.success || !result.json) {
      showError(result.error || resolveActionError('导出示例失败'))
      return false
    }

    const blob = new Blob([result.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `few-shot-examples-${new Date().toISOString().split('T')[0]}.json`
    anchor.click()
    URL.revokeObjectURL(url)

    showSuccess('示例已导出')

    return true
  }

  async function extractExamplesFromSessions(): Promise<boolean> {
    dismissFeedback()

    const result = await store.extractFromSessions()
    if (!result.success) {
      showError(resolveActionError('从会话提取示例失败'))
      return false
    }

    showSuccess(`成功提取 ${result.extracted ?? 0} 个示例`)

    return true
  }

  async function savePromptConfig(config: PromptConfig): Promise<boolean> {
    dismissFeedback()
    store.updatePromptConfig(config)

    const saved = await store.saveConfig()
    if (!saved) {
      showError(resolveActionError('保存配置失败'))
      return false
    }

    showSuccess('基础配置保存成功')

    return true
  }

  async function resetPromptConfig(): Promise<boolean> {
    dismissFeedback()

    const result = await store.resetPromptConfig()
    if (!result.success) {
      showError(result.error || resolveActionError('重置提示词配置失败'))
      return false
    }

    showSuccess('提示词配置已重置为默认值')

    return true
  }

  async function saveCustomVariable(
    variable: Pick<PromptVariable, 'name' | 'description' | 'defaultValue'>,
    originalName?: string
  ): Promise<{ success: boolean; error?: string }> {
    dismissFeedback()

    const result = await store.saveCustomVariable(variable, originalName)
    if (!result.success) {
      showError(result.error || resolveActionError('保存变量失败'))
      return result
    }

    showSuccess(originalName ? '变量已更新' : '变量已添加')

    return result
  }

  async function deleteCustomVariable(name: string): Promise<boolean> {
    dismissFeedback()

    const deleted = await store.deleteCustomVariable(name)
    if (!deleted) {
      showError(resolveActionError('删除变量失败'))
      return false
    }

    showSuccess('变量已删除')

    return true
  }

  async function previewSandbox(payload: TestPromptPayload): Promise<boolean> {
    dismissFeedback()

    if (!payload.userQuery.trim()) {
      showError('请先输入要测试的问题')
      return false
    }

    const previewed = await store.previewPrompt(payload)
    if (!previewed) {
      showError(resolveActionError('预览提示词失败'))
    }

    return previewed
  }

  async function runSandboxTest(payload: TestPromptPayload): Promise<boolean> {
    dismissFeedback()

    if (!payload.userQuery.trim()) {
      showError('请先输入要测试的问题')
      return false
    }

    const tested = await store.runSandboxTest(payload)
    if (!tested) {
      showError(resolveActionError('执行测试失败'))
    }

    return tested
  }

  function clearSandboxResult(): void {
    dismissFeedback()
    store.clearSandboxResult()
  }

  function clearVariableOverrides(): void {
    store.clearVariableOverrides()
  }

  function updateVariableOverride(name: string, value: string): void {
    store.updateVariableOverride(name, value)
  }

  async function initialize(): Promise<void> {
    clearFeedbackTimer()
    clearSearchTimer()
    feedbackMessage.value = ''
    feedbackType.value = null
    selectedIds.value = []
    closeEditDialog()

    searchQuery.value = exampleFilter.value.searchQuery ?? ''
    await store.initialize()
    searchQuery.value = store.exampleFilter.searchQuery ?? ''

    if (store.error) {
      showError(store.error)
    }
  }

  function cleanup(): void {
    clearFeedbackTimer()
    clearSearchTimer()
  }

  return {
    tabs,
    activeTab,
    showEditDialog,
    editingExample,
    selectedIds,
    searchQuery,
    feedbackMessage,
    feedbackType,
    hasFeedback,
    changeTab,
    dismissFeedback,
    setSelectedIds,
    updateExampleFilter,
    updateSearchQuery,
    openCreateExampleDialog,
    openEditExampleDialog,
    closeEditDialog,
    saveExample,
    confirmDeleteExamples,
    confirmClearDynamicExamples,
    importExamplesFromFile,
    exportExamplesToFile,
    extractExamplesFromSessions,
    savePromptConfig,
    resetPromptConfig,
    saveCustomVariable,
    deleteCustomVariable,
    previewSandbox,
    runSandboxTest,
    clearSandboxResult,
    clearVariableOverrides,
    updateVariableOverride,
    initialize,
    cleanup
  }
}
