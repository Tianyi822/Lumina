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
    return templates.value.some((t) => t.status === 'analyzing')
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
        success.value = `模板 "${result.data.name}" 上传成功，正在分析中...`
        window.api.logger?.info('[PptTemplateStore] 模板创建成功', {
          id: result.data.id,
          name: result.data.name
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
   * 获取模板的本地分析路径
   * @param templateId 模板 ID
   */
  function getAnalysisPath(templateId: string): string {
    return `~/.sparrow-manus/ppt-template/${templateId}/analysis.json`
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
    refreshTemplates,
    clearError,
    clearSuccess,
    clearMessages,
    getAnalysisPath
  }
})
