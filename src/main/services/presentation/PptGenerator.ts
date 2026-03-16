/**
 * PPT 生成器
 * 向后兼容的重导出入口
 *
 * @deprecated 请直接从 './generators' 导入
 */

export { PptGenerator } from './generators/PptGenerator'

// 同时导出类型以便兼容
export type {
  SlideRenderOptions,
  SlideRenderKind,
  TemplateDynamicZones,
  SlideContentMetrics,
  ElementPosition,
  GeneratorStyleConfig
} from './generators/types'
export { DEFAULT_GENERATOR_STYLE, MIN_BODY_FONT_SIZE } from './generators/types'
