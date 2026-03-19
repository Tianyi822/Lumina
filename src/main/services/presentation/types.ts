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
 * 模板分析上下文
 * 供样式提取、模板页匹配、预览图生成复用
 */
export interface TemplateAnalysisContext {
  analysis: PptTemplateAnalysis
}

/**
 * 模板渲染上下文
 */
export interface TemplateRenderBundle extends TemplateAnalysisContext {
  mediaData: Map<string, string>
}
