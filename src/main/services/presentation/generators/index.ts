/**
 * PPT 生成器模块
 * 导出生成器及其子模块
 */

export { PptGenerator } from './PptGenerator'
export { LayoutCalculator } from './LayoutCalculator'
export { ElementRenderer } from './ElementRenderer'
export { TemplateRenderer } from './TemplateRenderer'
export { SlideRenderer } from './SlideRenderer'

// 导出类型
export type {
  SlideRenderOptions,
  SlideRenderKind,
  TemplateDynamicZones,
  SlideContentMetrics,
  ElementPosition,
  GeneratorStyleConfig
} from './types'
export { DEFAULT_GENERATOR_STYLE, MIN_BODY_FONT_SIZE } from './types'
