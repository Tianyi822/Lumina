// PPT 模板 Store
// 管理模板列表、上传状态和错误信息

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { PptTemplateListItem, PptTemplateStatus } from '@shared/types/ppt-template'

export const usePptTemplateStore = defineStore('pptTemplate', () => {
  // ==================== State ====================

  // 模板列表
  const templates = ref<PptTemplateListItem[]>([])

  // 加载状态
  const loading = ref(false)

  // 上传中状态
  const uploading = ref(false)

  // 错误信息
  const error = ref<string | null>(null)

  // 成功信息
  const success = ref<string | null>(null)

  // ==================== Getters ====================

  // 按创建时间倒序排序的模板列表
  const sortedTemplates = computed(() => {
    return [...templates.value].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  })

  // 按状态分组的模板
  const templatesByStatus = computed(() => {
    const grouped: Record<PptTemplateStatus, PptTemplateListItem[]> = {
      analyzing: [],
      summarizing: [],
      completed: [],
      failed: []
    }
    for (const template of templates.value) {
      grouped[template.status].push(template)
    }
    return grouped
  })

  // 是否有分析中的模板
  const hasAnalyzing = computed(() => {
    return templates.value.some((t) => t.status === 'analyzing' || t.status === 'summarizing')
  })

  // ==================== Actions ====================

  /**
   * 加载模板列表
   */
  async function loadTemplates(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await window.api.pptTemplate.list()
      if (result.success && result.data) {
        templates.value = result.data
        window.api.logger?.info('[PptTemplateStore] 模板列表加载成功', {
          count: result.data.length
        })
      } else {
        error.value = result.error || '加载模板列表失败'
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = `加载模板列表失败: ${message}`
      window.api.logger?.error('[PptTemplateStore] 加载模板列表失败', { error: message })
    } finally {
      loading.value = false
    }
  }

  /**
   * 上传新模板
   * @param file 文件对象
   * @param name 模板名称（可选）
   */
  async function createTemplate(file: File, name?: string): Promise<boolean> {
    uploading.value = true
    error.value = null
    success.value = null
    try {
      const result = await window.api.pptTemplate.create(file, name)
      if (result.success && result.data) {
        // 添加到列表
        templates.value.push(result.data)
        success.value =
          result.data.status === 'summarizing'
            ? `模板 "${result.data.name}" 上传成功，正在生成 AI 总结`
            : `模板 "${result.data.name}" 上传并分析成功`
        window.api.logger?.info('[PptTemplateStore] 模板创建成功', {
          id: result.data.id,
          name: result.data.name,
          status: result.data.status
        })

        // 3秒后清除成功消息
        setTimeout(() => {
          success.value = null
        }, 3000)

        return true
      } else {
        error.value = result.error || '上传模板失败'
        return false
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = `上传模板失败: ${message}`
      window.api.logger?.error('[PptTemplateStore] 上传模板失败', { error: message })
      return false
    } finally {
      uploading.value = false
    }
  }

  /**
   * 刷新列表（重新加载）
   */
  async function refreshTemplates(): Promise<void> {
    await loadTemplates()
  }

  /**
   * 清除错误消息
   */
  function clearError(): void {
    error.value = null
  }

  /**
   * 清除成功消息
   */
  function clearSuccess(): void {
    success.value = null
  }

  /**
   * 清除所有消息
   */
  function clearMessages(): void {
    error.value = null
    success.value = null
  }

  /**
   * 删除模板
   * @param templateId 模板 ID
   */
  async function deleteTemplate(templateId: string): Promise<boolean> {
    error.value = null
    success.value = null
    try {
      const result = await window.api.pptTemplate.delete(templateId)
      if (result.success) {
        // 从列表中移除
        const index = templates.value.findIndex((t) => t.id === templateId)
        if (index !== -1) {
          const templateName = templates.value[index].name
          templates.value.splice(index, 1)
          success.value = `模板 "${templateName}" 已删除`
          window.api.logger?.info('[PptTemplateStore] 模板删除成功', { id: templateId })
        }

        // 3秒后清除成功消息
        setTimeout(() => {
          success.value = null
        }, 3000)

        return true
      } else {
        error.value = result.error || '删除模板失败'
        return false
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = `删除模板失败: ${message}`
      window.api.logger?.error('[PptTemplateStore] 删除模板失败', { error: message })
      return false
    }
  }

  /**
   * 重试模板 AI 总结
   * @param templateId 模板 ID
   */
  async function retrySummary(templateId: string): Promise<boolean> {
    error.value = null
    success.value = null

    try {
      const result = await window.api.pptTemplate.retrySummary(templateId)
      if (!result.success) {
        error.value = result.error || '重试模板 AI 总结失败'
        return false
      }

      const template = templates.value.find((item) => item.id === templateId)
      if (template) {
        template.status = 'summarizing'
        delete template.summaryError
        delete template.summaryCompletedAt
        success.value = `模板 "${template.name}" 已重新开始生成 AI 总结`
      } else {
        success.value = '已重新开始生成 AI 总结'
      }

      setTimeout(() => {
        success.value = null
      }, 3000)

      return true
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      error.value = `重试模板 AI 总结失败: ${message}`
      window.api.logger?.error('[PptTemplateStore] 重试模板 AI 总结失败', {
        templateId,
        error: message
      })
      return false
    }
  }

  /**
   * 获取模板的本地分析路径
   * @param templateId 模板 ID
   */
  function getAnalysisPath(templateId: string): string {
    return `~/.sparrow-manus/ppt-template/${templateId}/analysis.json`
  }

  /**
   * 获取模板的本地 AI 总结路径
   * @param templateId 模板 ID
   */
  function getAiSummaryPath(templateId: string): string {
    return `~/.sparrow-manus/ppt-template/${templateId}/ai-summary.json`
  }

  return {
    // State
    templates,
    loading,
    uploading,
    error,
    success,

    // Getters
    sortedTemplates,
    templatesByStatus,
    hasAnalyzing,

    // Actions
    loadTemplates,
    createTemplate,
    retrySummary,
    deleteTemplate,
    refreshTemplates,
    clearError,
    clearSuccess,
    clearMessages,
    getAnalysisPath,
    getAiSummaryPath
  }
})
