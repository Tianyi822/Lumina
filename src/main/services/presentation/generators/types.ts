/**
 * PPT 生成器相关类型定义
 */

import type { SlideContentBlock } from '@shared/types/ppt-export'
import type { PptTemplateSlideAnalysis } from '@shared/types/ppt-template'

/**
 * 幻灯片渲染选项
 */
export interface SlideRenderOptions {
  /** 是否强制保持为单页 */
  singlePage?: boolean
  /** 页面布局提示 */
  layoutHint?: 'cover' | 'ending'
  /** 副标题 */
  subtitle?: string
  /** 标题页正文内容 */
  blocks?: SlideContentBlock[]
  /** 模板页分析结果 */
  templateSlide?: PptTemplateSlideAnalysis
  /** 模板媒体资源 */
  mediaData?: Map<string, string>
}

/**
 * 幻灯片渲染模式
 */
export type SlideRenderKind = 'title' | 'content' | 'table'

/**
 * 模板动态内容区域
 */
export interface TemplateDynamicZones {
  title?: { x: number; y: number; w: number; h: number }
  content?: { x: number; y: number; w: number; h: number }
}

/**
 * 当前页内容排版参数
 */
export interface SlideContentMetrics {
  bodyFontSize: number
  listLineSpacing: number
  tableHeaderFontSize: number
  tableBodyFontSize: number
}

/**
 * 元素位置信息
 */
export interface ElementPosition {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 生成器样式配置
 */
export interface GeneratorStyleConfig {
  primaryColor: string
  backgroundColor: string
  titleFont: string
  bodyFont: string
  titleSize: number
  bodySize: number
}

/**
 * 默认样式配置
 */
export const DEFAULT_GENERATOR_STYLE: Required<GeneratorStyleConfig> = {
  primaryColor: '1E3A5F',
  backgroundColor: 'FFFFFF',
  titleFont: 'Microsoft YaHei',
  bodyFont: 'Microsoft YaHei',
  titleSize: 36,
  bodySize: 18
}

/** 单页模式下的最小正文字号 */
export const MIN_BODY_FONT_SIZE = 10
