import type { PptExportErrorType, PptExportStage } from '@renderer/composables/usePptExport'
import type { PptExportSlidePreview } from '@shared/types/ppt-export'
import type { TemplatePreviewStatus } from '@renderer/utils/pptTemplatePreview'

export const PPT_CONTENT_TYPE_LABELS: Record<PptExportSlidePreview['contentType'], string> = {
  title: '封面',
  content: '内容',
  table: '表格',
  list: '列表',
  mixed: '混合'
}

export const PPT_CONTENT_TYPE_COLORS: Record<PptExportSlidePreview['contentType'], string> = {
  title: '#3b82f6',
  content: '#10b981',
  table: '#f59e0b',
  list: '#8b5cf6',
  mixed: '#ec4899'
}

export interface PptExportProgressStep {
  key: 'parsing' | 'generating' | 'downloading'
  label: string
  done: boolean
  active: boolean
}

export function getPptExportProgressSteps(stage: PptExportStage): PptExportProgressStep[] {
  return [
    {
      key: 'parsing',
      label: '解析内容',
      done: stage === 'generating' || stage === 'downloading',
      active: stage === 'parsing'
    },
    {
      key: 'generating',
      label: '生成幻灯片',
      done: stage === 'downloading',
      active: stage === 'generating'
    },
    {
      key: 'downloading',
      label: '准备下载',
      done: false,
      active: stage === 'downloading'
    }
  ]
}

export function getPptExportErrorIcon(type: PptExportErrorType): string {
  switch (type) {
    case 'parse':
      return '!'
    case 'style':
      return '🎨'
    case 'generate':
      return '⚠'
    case 'download':
      return '📥'
    case 'network':
      return '🔌'
    default:
      return '⚠'
  }
}

export function getTemplatePreviewStatusLabel(status?: TemplatePreviewStatus): string {
  return status === 'loading' ? '正在加载首页' : '暂无首页预览'
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
