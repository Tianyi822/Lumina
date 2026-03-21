import type { EnhancedFewShotExample, ExampleFilter, ImportResult } from '@shared/types/prompt'
import type { PromptEngineeringStoreRefs } from './types'
import { getErrorMessage, startScopedLoading, stopScopedLoading } from './utils'

/** 示例管理 Actions 返回类型 */
interface ExampleActions {
  loadExamples: () => Promise<void>
  loadExampleStats: () => Promise<void>
  setExampleFilter: (filter: Partial<ExampleFilter>) => void
  resetExampleFilter: () => void
  updateExample: (example: EnhancedFewShotExample) => Promise<boolean>
  deleteExamples: (ids: string[]) => Promise<boolean>
  extractFromSessions: () => Promise<{ success: boolean; extracted?: number }>
  importExamples: (json: string) => Promise<ImportResult>
  exportExamples: () => Promise<{ success: boolean; json?: string; error?: string }>
  clearDynamicExamples: () => Promise<{ success: boolean; deletedCount?: number }>
}

/**
 * 创建示例管理 Actions
 */
export function createPromptEngineeringExampleActions(
  store: PromptEngineeringStoreRefs
): ExampleActions {
  /**
   * 加载示例列表
   */
  async function loadExamples(): Promise<void> {
    startScopedLoading(store.examplesLoadingCounter)
    store.error.value = null

    try {
      const result = await window.api.promptEngineering.listExamples()
      if (!result.success || !result.examples) {
        store.error.value = result.error || '加载示例失败'
        return
      }

      store.examples.value = result.examples
    } catch (target) {
      store.error.value = getErrorMessage('加载示例失败', target)
    } finally {
      stopScopedLoading(store.examplesLoadingCounter)
    }
  }

  /**
   * 加载示例统计信息
   */
  async function loadExampleStats(): Promise<void> {
    startScopedLoading(store.examplesLoadingCounter)

    try {
      const result = await window.api.promptEngineering.getExampleStats()
      if (result.success && result.stats) {
        store.examplesStats.value = result.stats
      } else if (!result.success) {
        store.error.value = result.error || '加载示例统计失败'
      }
    } catch (target) {
      store.error.value = getErrorMessage('加载示例统计失败', target)
    } finally {
      stopScopedLoading(store.examplesLoadingCounter)
    }
  }

  /**
   * 设置示例筛选条件
   */
  function setExampleFilter(filter: Partial<ExampleFilter>): void {
    store.exampleFilter.value = { ...store.exampleFilter.value, ...filter }
  }

  /**
   * 重置示例筛选条件
   */
  function resetExampleFilter(): void {
    store.exampleFilter.value = {}
  }

  /**
   * 更新示例
   */
  async function updateExample(example: EnhancedFewShotExample): Promise<boolean> {
    startScopedLoading(store.examplesLoadingCounter)
    store.error.value = null

    try {
      const result = await window.api.promptEngineering.updateExample(example)
      if (!result.success) {
        store.error.value = result.error || '更新示例失败'
        return false
      }

      await Promise.all([loadExamples(), loadExampleStats()])
      return true
    } catch (target) {
      store.error.value = getErrorMessage('更新示例失败', target)
      return false
    } finally {
      stopScopedLoading(store.examplesLoadingCounter)
    }
  }

  /**
   * 删除示例（支持批量）
   */
  async function deleteExamples(ids: string[]): Promise<boolean> {
    startScopedLoading(store.examplesLoadingCounter)
    store.error.value = null

    try {
      const result = await window.api.promptEngineering.deleteExamples(ids)
      if (!result.success) {
        store.error.value = result.error || '删除示例失败'
        return false
      }

      await Promise.all([loadExamples(), loadExampleStats()])
      return true
    } catch (target) {
      store.error.value = getErrorMessage('删除示例失败', target)
      return false
    } finally {
      stopScopedLoading(store.examplesLoadingCounter)
    }
  }

  /**
   * 从会话提取示例
   */
  async function extractFromSessions(): Promise<{ success: boolean; extracted?: number }> {
    startScopedLoading(store.examplesLoadingCounter)
    store.error.value = null

    try {
      const result = await window.api.promptEngineering.extractExamplesFromSessions()
      if (!result.success) {
        store.error.value = result.error || '从会话提取示例失败'
        return { success: false }
      }

      await Promise.all([loadExamples(), loadExampleStats()])
      return { success: true, extracted: result.result?.extracted || 0 }
    } catch (target) {
      store.error.value = getErrorMessage('从会话提取示例失败', target)
      return { success: false }
    } finally {
      stopScopedLoading(store.examplesLoadingCounter)
    }
  }

  /**
   * 导入示例
   */
  async function importExamples(json: string): Promise<ImportResult> {
    startScopedLoading(store.examplesLoadingCounter)
    store.error.value = null

    try {
      const result = await window.api.promptEngineering.importExamples(json)
      if (result.success && result.imported > 0) {
        await Promise.all([loadExamples(), loadExampleStats()])
      }
      return result
    } catch (target) {
      const errorMessage = getErrorMessage('导入示例失败', target)
      store.error.value = errorMessage
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: [errorMessage]
      }
    } finally {
      stopScopedLoading(store.examplesLoadingCounter)
    }
  }

  /**
   * 导出示例
   */
  async function exportExamples(): Promise<{ success: boolean; json?: string; error?: string }> {
    startScopedLoading(store.examplesLoadingCounter)
    store.error.value = null

    try {
      return await window.api.promptEngineering.exportExamples()
    } catch (target) {
      const errorMessage = getErrorMessage('导出示例失败', target)
      store.error.value = errorMessage
      return { success: false, error: errorMessage }
    } finally {
      stopScopedLoading(store.examplesLoadingCounter)
    }
  }

  /**
   * 清空动态示例
   */
  async function clearDynamicExamples(): Promise<{ success: boolean; deletedCount?: number }> {
    startScopedLoading(store.examplesLoadingCounter)
    store.error.value = null

    try {
      const result = await window.api.promptEngineering.clearDynamicExamples()
      if (!result.success) {
        store.error.value = result.error || '清空动态示例失败'
        return { success: false }
      }

      await Promise.all([loadExamples(), loadExampleStats()])
      return { success: true, deletedCount: result.deletedCount }
    } catch (target) {
      store.error.value = getErrorMessage('清空动态示例失败', target)
      return { success: false }
    } finally {
      stopScopedLoading(store.examplesLoadingCounter)
    }
  }

  return {
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
  }
}
