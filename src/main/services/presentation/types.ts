import type { PptTemplateAnalysis } from '@shared/types/ppt-template'

export interface PreviewCanvasSize {
  width: number
  height: number
}

export interface PreviewRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 模板渲染上下文
 */
export interface TemplateRenderBundle {
  analysis: PptTemplateAnalysis
  mediaData: Map<string, string>
}
