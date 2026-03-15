import { ref, watch, type Ref } from 'vue'
import type { PptTemplateAnalysis, PptTemplateListItem } from '@shared/types/ppt-template'
import {
  buildTemplatePreviewImage,
  type TemplatePreviewModel
} from '@renderer/utils/pptTemplatePreview'

interface PptTemplateAnalysisResult {
  success: boolean
  data?: PptTemplateAnalysis
  error?: string
}

interface PptTemplatePreviewResult {
  success: boolean
  data?: string
  error?: string
}

function toTemplatePreviewRecord(
  entries: Array<[string, TemplatePreviewModel]>
): Record<string, TemplatePreviewModel> {
  return Object.fromEntries(entries)
}

/**
 * 管理模板首页预览图缓存与加载状态。
 * 优先使用原 PPT 文件自带的缩略图，如果没有则使用渲染生成的预览图。
 */
export function usePptTemplatePreview(templates: Ref<PptTemplateListItem[]>) {
  const templatePreviewMap = ref<Record<string, TemplatePreviewModel>>({})

  const updateTemplatePreview = (templateId: string, preview: TemplatePreviewModel): void => {
    templatePreviewMap.value = {
      ...templatePreviewMap.value,
      [templateId]: preview
    }
  }

  const ensureTemplatePreview = async (templateId: string): Promise<void> => {
    const currentPreview = templatePreviewMap.value[templateId]
    if (currentPreview?.status === 'loading' || currentPreview?.status === 'ready') {
      return
    }

    updateTemplatePreview(templateId, { status: 'loading' })

    try {
      // 首先尝试获取原 PPT 文件自带的缩略图
      const previewResult = (await window.api.pptTemplate.getFirstSlidePreview(
        templateId
      )) as PptTemplatePreviewResult

      if (previewResult.success && previewResult.data) {
        updateTemplatePreview(templateId, {
          status: 'ready',
          imageUrl: previewResult.data
        })
        return
      }

      // 如果没有自带缩略图，则使用分析结果渲染预览图
      const [analysisResult, sourceResult] = await Promise.all([
        window.api.pptTemplate.getAnalysis(templateId) as Promise<PptTemplateAnalysisResult>,
        window.api.pptTemplate.getSourceData(templateId)
      ])

      if (!analysisResult.success || !analysisResult.data) {
        throw new Error(analysisResult.error || '模板分析结果不存在')
      }

      const sourceData =
        sourceResult.success && sourceResult.data?.data?.length
          ? new Uint8Array(sourceResult.data.data)
          : undefined
      const imageUrl = await buildTemplatePreviewImage(analysisResult.data, sourceData)

      updateTemplatePreview(templateId, {
        status: 'ready',
        imageUrl
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      void window.api.logger.warn('[usePptTemplatePreview] 渲染模板第一页失败', {
        templateId,
        error: errorMessage
      })

      updateTemplatePreview(templateId, { status: 'error' })
    }
  }

  watch(
    templates,
    (nextTemplates) => {
      if (!nextTemplates.length) {
        templatePreviewMap.value = {}
        return
      }

      const nextIds = new Set(nextTemplates.map((template) => template.id))
      templatePreviewMap.value = toTemplatePreviewRecord(
        Object.entries(templatePreviewMap.value).filter(([templateId]) => nextIds.has(templateId))
      )

      nextTemplates.forEach((template) => {
        void ensureTemplatePreview(template.id)
      })
    },
    { immediate: true }
  )

  return {
    templatePreviewMap,
    ensureTemplatePreview
  }
}
