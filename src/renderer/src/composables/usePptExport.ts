/**
 * PPT 导出 Composable
 * 封装 PPT 导出相关的状态管理和 API 调用逻辑
 */

import { ref, computed, toRaw, type Ref, type ComputedRef } from 'vue'
import type {
  PreviewPptExportResult,
  GeneratePptResult,
  PptExportConfig,
  PptExportSlidePreview,
  PptStyleSource,
  TemplateStyleExtraction
} from '@shared/types/ppt-export'

/**
 * 错误类型
 */
export type PptExportErrorType = 'parse' | 'style' | 'generate' | 'download' | 'network'

/**
 * 错误信息结构
 */
export interface PptExportError {
  /** 错误类型 */
  type: PptExportErrorType
  /** 错误消息 */
  message: string
  /** 是否可重试 */
  retryable: boolean
}

/**
 * 生成阶段
 */
export type PptExportStage = 'idle' | 'parsing' | 'generating' | 'downloading'

/**
 * usePptExport 返回类型
 */
export interface UsePptExportReturn {
  // 状态
  isLoading: Ref<boolean>
  isGenerating: Ref<boolean>
  exportStage: Ref<PptExportStage>
  previewData: Ref<PreviewPptExportResult | null>
  exportConfig: Ref<PptExportConfig | null>
  error: Ref<PptExportError | null>

  // 计算属性
  selectedSlides: ComputedRef<PptExportSlidePreview[]>
  selectedCount: ComputedRef<number>
  hasPreview: ComputedRef<boolean>
  canGenerate: ComputedRef<boolean>
  loadingMessage: ComputedRef<string>

  // 方法
  preview: (content: string, templateId?: string) => Promise<boolean>
  extractTemplateStyle: (templateId: string) => Promise<TemplateStyleExtraction | null>
  updateSlideSelection: (indices: number[]) => void
  toggleSlideSelection: (index: number) => void
  selectAllSlides: () => void
  deselectAllSlides: () => void
  updateStyleSource: (source: PptStyleSource) => Promise<void>
  generate: (content: string, title?: string) => Promise<GeneratePptResult | null>
  download: (result: GeneratePptResult) => void
  reset: () => void
  clearError: () => void
}

/**
 * PPT 导出 Composable
 * 提供 PPT 导出的状态管理和 API 调用封装
 *
 * @example
 * ```typescript
 * const {
 *   preview,
 *   generate,
 *   isLoading,
 *   previewData,
 *   exportConfig,
 *   selectedSlides,
 *   updateSlideSelection,
 *   updateStyleSource
 * } = usePptExport()
 *
 * // 预览内容
 * await preview(markdownContent)
 *
 * // 更新页面选择
 * toggleSlideSelection(1)
 *
 * // 生成 PPT
 * const result = await generate(markdownContent, '演示文稿')
 * if (result?.success) {
 *   download(result)
 * }
 * ```
 */
export function usePptExport(): UsePptExportReturn {
  // ==================== 状态定义 ====================

  /** 加载状态（预览） */
  const isLoading = ref(false)

  /** 生成状态 */
  const isGenerating = ref(false)

  /** 导出阶段（用于显示详细的加载消息） */
  const exportStage = ref<PptExportStage>('idle')

  /** 预览数据 */
  const previewData = ref<PreviewPptExportResult | null>(null)

  /** 当前导出配置 */
  const exportConfig = ref<PptExportConfig | null>(null)

  /** 错误信息 */
  const error = ref<PptExportError | null>(null)

  /** 最近一次预览的内容 */
  const lastPreviewContent = ref('')

  /** 当前正在切换的样式来源 */
  const updatingStyleSourceKey = ref<string | null>(null)

  // ==================== 计算属性 ====================

  /** 选中的幻灯片列表 */
  const selectedSlides = computed(() => {
    return exportConfig.value?.slides.filter((s) => s.selected) ?? []
  })

  /** 选中的幻灯片数量 */
  const selectedCount = computed(() => selectedSlides.value.length)

  /** 是否有预览数据 */
  const hasPreview = computed(() => {
    return !!(previewData.value?.success && previewData.value.config !== undefined)
  })

  /** 是否可以生成（有选中页面且不在生成中） */
  const canGenerate = computed(() => {
    return !!(hasPreview.value && selectedCount.value > 0 && !isGenerating.value)
  })

  /** 加载消息（根据当前阶段返回相应的提示文本） */
  const loadingMessage = computed(() => {
    switch (exportStage.value) {
      case 'parsing':
        return '正在解析内容...'
      case 'generating':
        return '正在生成 PPT... 预计需要 10-15 秒'
      case 'downloading':
        return '正在准备下载...'
      default:
        return '加载中...'
    }
  })

  // ==================== 内部方法 ====================

  /**
   * 处理错误并转换为用户友好的提示
   * @param type - 错误类型
   * @param operation - 操作名称
   * @param err - 错误对象
   */
  const handleError = (type: PptExportErrorType, operation: string, err: unknown): void => {
    const rawMessage = err instanceof Error ? err.message : String(err)
    let userMessage = ''

    switch (type) {
      case 'parse':
        userMessage = '无法解析内容，请确保文本格式正确'
        break
      case 'style':
        userMessage = rawMessage.includes('template') || rawMessage.includes('模板')
          ? '模板文件可能已损坏，请选择其他模板'
          : '样式配置加载失败，请重试'
        break
      case 'generate':
        userMessage = rawMessage.includes('timeout') || rawMessage.includes('超时')
          ? '生成超时，请减少页面数量后重试'
          : '生成 PPT 时发生错误，请重试'
        break
      case 'download':
        userMessage = '文件下载失败，请检查浏览器下载权限'
        break
      case 'network':
        userMessage = '网络连接不稳定，请稍后重试'
        break
      default:
        userMessage = `${operation}失败: ${rawMessage}`
    }

    const retryable = type === 'network' || type === 'parse' || type === 'generate'
    error.value = { type, message: userMessage, retryable }
    void window.api.logger.error(`[usePptExport] ${operation}失败`, {
      type,
      rawMessage
    })
  }

  /**
   * 将响应式配置转换为可通过 Electron IPC 传输的普通对象
   */
  const createSerializableConfig = (config: PptExportConfig): PptExportConfig => {
    return structuredClone(toRaw(config))
  }

  /**
   * 获取样式来源的稳定标识
   * @param source - 样式来源
   * @returns 标识字符串
   */
  const getStyleSourceKey = (source: PptStyleSource): string => {
    return `template:${source.templateId}`
  }

  /**
   * 判断两个样式来源是否相同
   * @param left - 当前样式来源
   * @param right - 目标样式来源
   * @returns 是否相同
   */
  const isSameStyleSource = (left: PptStyleSource, right: PptStyleSource): boolean => {
    return getStyleSourceKey(left) === getStyleSourceKey(right)
  }

  /**
   * 将旧的页面勾选状态映射到新的预览结果
   * @param nextConfig - 新配置
   * @param previousConfig - 旧配置
   */
  const restoreSlideSelection = (
    nextConfig: PptExportConfig,
    previousConfig?: PptExportConfig | null
  ): void => {
    if (!previousConfig) {
      return
    }

    const selectedIndexSet = new Set(
      previousConfig.slides.filter((slide) => slide.selected).map((slide) => slide.index)
    )

    if (selectedIndexSet.size === previousConfig.slides.length) {
      return
    }

    nextConfig.slides = nextConfig.slides.map((slide) => ({
      ...slide,
      selected: selectedIndexSet.has(slide.index)
    }))
  }

  /**
   * 请求预览数据
   * @param content - Markdown 内容
   * @param templateId - 模板 ID
   * @param previousConfig - 旧配置，用于恢复勾选状态
   * @returns 是否成功
   */
  const requestPreview = async (
    content: string,
    templateId?: string,
    previousConfig?: PptExportConfig | null
  ): Promise<boolean> => {
    isLoading.value = true
    exportStage.value = 'parsing'
    error.value = null

    try {
      // 过滤空字符串，避免后端错误地回退到默认模板
      const effectiveTemplateId = templateId?.trim() || undefined
      const result = await window.api.pptExport.preview({ content, templateId: effectiveTemplateId })
      previewData.value = result

      if (result.success && result.config) {
        const nextConfig = createSerializableConfig(result.config)
        restoreSlideSelection(nextConfig, previousConfig)
        exportConfig.value = nextConfig
        lastPreviewContent.value = content
        return true
      }

      error.value = {
        type: 'parse',
        message: result.error ?? '预览失败，请检查内容格式',
        retryable: true
      }
      return false
    } catch (err) {
      handleError('parse', '预览', err)
      return false
    } finally {
      isLoading.value = false
      exportStage.value = 'idle'
    }
  }

  // ==================== API 方法 ====================

  /**
   * 预览导出配置
   * 解析内容并获取预览数据
   *
   * @param content - Markdown 内容
   * @param templateId - 模板 ID
   * @returns 是否成功
   */
  const preview = async (content: string, templateId?: string): Promise<boolean> => {
    return await requestPreview(content, templateId)
  }

  /**
   * 从模板提取样式
   *
   * @param templateId - 模板 ID
   * @returns 提取的样式配置或 null
   */
  const extractTemplateStyle = async (
    templateId: string
  ): Promise<TemplateStyleExtraction | null> => {
    try {
      const result = await window.api.pptExport.extractTemplateStyle(templateId)
      if (result.success && result.data) {
        return result.data
      }
      if (result.error) {
        handleError('style', '提取模板样式', new Error(result.error))
      }
      return null
    } catch (err) {
      handleError('style', '提取模板样式', err)
      return null
    }
  }

  /**
   * 生成 PPT
   *
   * @param content - Markdown 内容
   * @param title - 可选的文件标题
   * @returns 生成结果或 null
   */
  const generate = async (
    content: string,
    title?: string
  ): Promise<GeneratePptResult | null> => {
    if (!exportConfig.value) {
      error.value = {
        type: 'parse',
        message: '请先预览内容',
        retryable: false
      }
      return null
    }

    if (selectedCount.value === 0) {
      error.value = {
        type: 'parse',
        message: '请至少选择一个页面',
        retryable: false
      }
      return null
    }

    isGenerating.value = true
    exportStage.value = 'generating'
    error.value = null

    try {
      const result = await window.api.pptExport.generate({
        content,
        config: createSerializableConfig(exportConfig.value),
        title
      })

      if (result.success) {
        exportStage.value = 'downloading'
        return result
      } else {
        error.value = {
          type: 'generate',
          message: result.error ?? '生成 PPT 失败，请重试',
          retryable: true
        }
        return null
      }
    } catch (err) {
      handleError('generate', '生成 PPT', err)
      return null
    } finally {
      isGenerating.value = false
      exportStage.value = 'idle'
    }
  }

  // ==================== 配置更新方法 ====================

  /**
   * 更新幻灯片选择
   *
   * @param indices - 选中的页面索引数组
   */
  const updateSlideSelection = (indices: number[]): void => {
    if (!exportConfig.value) return

    const indexSet = new Set(indices)
    exportConfig.value.slides.forEach((slide) => {
      slide.selected = indexSet.has(slide.index)
    })
  }

  /**
   * 切换单个幻灯片选择状态
   *
   * @param index - 页面索引
   */
  const toggleSlideSelection = (index: number): void => {
    if (!exportConfig.value) return

    const slide = exportConfig.value.slides.find((s) => s.index === index)
    if (slide) {
      slide.selected = !slide.selected
    }
  }

  /**
   * 全选所有幻灯片
   */
  const selectAllSlides = (): void => {
    if (!exportConfig.value) return
    exportConfig.value.slides.forEach((slide) => {
      slide.selected = true
    })
  }

  /**
   * 取消选择所有幻灯片
   */
  const deselectAllSlides = (): void => {
    if (!exportConfig.value) return
    exportConfig.value.slides.forEach((slide) => {
      slide.selected = false
    })
  }

  /**
   * 更新样式来源（仅支持模板）
   *
   * @param source - 样式来源配置
   */
  const updateStyleSource = async (source: PptStyleSource): Promise<void> => {
    if (!exportConfig.value) return

    const sourceKey = getStyleSourceKey(source)
    if (updatingStyleSourceKey.value === sourceKey) {
      return
    }

    const previousConfig = createSerializableConfig(exportConfig.value)
    const needsReparse =
      !!lastPreviewContent.value &&
      (source.type === 'template' || previousConfig.styleSource.type === 'template')

    if (
      !needsReparse &&
      isSameStyleSource(previousConfig.styleSource, source) &&
      !exportConfig.value.slideSize
    ) {
      return
    }

    updatingStyleSourceKey.value = sourceKey

    try {
      if (needsReparse) {
        const reparsed = await requestPreview(
          lastPreviewContent.value,
          source.type === 'template' ? source.templateId : undefined,
          previousConfig
        )

        if (!reparsed || !exportConfig.value) {
          return
        }
      }

      if (!exportConfig.value) {
        return
      }

      exportConfig.value.styleSource = source

      // 从模板提取样式（过滤空字符串）
      const extraction = source.templateId?.trim()
        ? await extractTemplateStyle(source.templateId.trim())
        : null
      if (extraction?.style) {
        exportConfig.value.style = extraction.style
        exportConfig.value.templateLayouts = extraction.layouts
        exportConfig.value.slideSize = extraction.slideSize
      } else {
        exportConfig.value.templateLayouts = undefined
        exportConfig.value.slideSize = undefined
      }
    } finally {
      if (updatingStyleSourceKey.value === sourceKey) {
        updatingStyleSourceKey.value = null
      }
    }
  }

  // ==================== 文件下载方法 ====================

  /**
   * 下载生成的 PPT 文件
   *
   * @param result - 生成结果
   */
  const download = (result: GeneratePptResult): void => {
    if (!result.success || !result.data || !result.fileName) {
      error.value = {
        type: 'download',
        message: '无法下载：生成结果无效',
        retryable: false
      }
      return
    }

    try {
      // 将 number[] 转换为 Uint8Array
      const buffer = new Uint8Array(result.data)
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      })

      // 创建下载链接
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.fileName
      document.body.appendChild(link)
      link.click()

      // 清理
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      handleError('download', '下载文件', err)
    }
  }

  // ==================== 状态重置方法 ====================

  /**
   * 重置所有状态
   */
  const reset = (): void => {
    isLoading.value = false
    isGenerating.value = false
    exportStage.value = 'idle'
    previewData.value = null
    exportConfig.value = null
    error.value = null
    lastPreviewContent.value = ''
    updatingStyleSourceKey.value = null
  }

  /**
   * 清除错误信息
   */
  const clearError = (): void => {
    error.value = null
  }

  // ==================== 返回 ====================

  return {
    // 状态
    isLoading,
    isGenerating,
    exportStage,
    previewData,
    exportConfig,
    error,

    // 计算属性
    selectedSlides,
    selectedCount,
    hasPreview,
    canGenerate,
    loadingMessage,

    // 方法
    preview,
    extractTemplateStyle,
    updateSlideSelection,
    toggleSlideSelection,
    selectAllSlides,
    deselectAllSlides,
    updateStyleSource,
    generate,
    download,
    reset,
    clearError
  }
}

export default usePptExport
