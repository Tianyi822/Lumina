/**
 * PPT 导出相关的类型定义
 * 用于将 Markdown 内容导出为 PowerPoint 文档
 */

import type { PptTemplateListItem } from './ppt-template'

// ==================== 样式配置 ====================

/**
 * PPT 样式配置
 */
export interface PptStyleConfig {
  /** 主题色（主色调） */
  primaryColor?: string
  /** 背景色 */
  backgroundColor?: string
  /** 标题字体 */
  titleFont?: string
  /** 正文字体 */
  bodyFont?: string
  /** 标题字号 */
  titleSize?: number
  /** 正文字号 */
  bodySize?: number
}

/**
 * 样式来源类型（仅支持模板）
 */
export type PptStyleSource = { type: 'template'; templateId: string }

// ==================== 幻灯片布局 ====================

/**
 * 幻灯片位置（英寸或百分比）
 */
export interface SlidePosition {
  /** X 坐标 */
  x: number
  /** Y 坐标 */
  y: number
  /** 宽度（英寸数值或百分比字符串如 '90%'） */
  w: number | string
  /** 高度（英寸数值或百分比字符串如 '50%'） */
  h: number | string
}

/**
 * 幻灯片样式（可从模板分析结果提取）
 */
export interface SlideStyle {
  /** 背景颜色 */
  backgroundColor?: string
  /** 标题位置（英寸） */
  titlePosition?: SlidePosition
  /** 内容位置（英寸） */
  contentPosition?: SlidePosition
}

/**
 * 模板幻灯片布局信息
 */
export interface TemplateSlideLayout {
  /** 布局名称 */
  name: string
  /** 背景颜色 */
  backgroundColor?: string
  /** 标题占位符位置 */
  titlePosition?: SlidePosition
  /** 内容占位符位置 */
  contentPosition?: SlidePosition
}

/**
 * 幻灯片尺寸（英寸）
 */
export interface PptSlideSize {
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
}

/**
 * 模板样式提取结果
 */
export interface TemplateStyleExtraction {
  /** 是否成功 */
  success: boolean
  /** 提取的样式配置 */
  style?: PptStyleConfig
  /** 提取的幻灯片布局信息 */
  layouts?: TemplateSlideLayout[]
  /** 提取的幻灯片尺寸 */
  slideSize?: PptSlideSize
  /** 错误信息 */
  error?: string
}

// ==================== 导出配置 ====================

/**
 * 导出页面预览
 */
export interface PptExportSlidePreview {
  /** 页面索引（从 0 开始） */
  index: number
  /** 页面标题 */
  title?: string
  /** 内容类型 */
  contentType: 'title' | 'content' | 'table' | 'list' | 'mixed'
  /** 内容摘要 */
  summary: string
  /** 页面预览图（SVG data URL） */
  previewImageDataUrl?: string
  /** 是否选中导出 */
  selected: boolean
}

/**
 * PPT 导出配置对话框数据
 */
export interface PptExportConfig {
  /** 解析后的页面列表 */
  slides: PptExportSlidePreview[]
  /** 样式来源（仅支持模板） */
  styleSource: PptStyleSource
  /** 当前样式配置（从模板提取） */
  style: PptStyleConfig
  /** 模板布局信息 */
  templateLayouts?: TemplateSlideLayout[]
  /** 幻灯片尺寸 */
  slideSize?: PptSlideSize
}

// ==================== 解析后的内容结构 ====================

/**
 * 幻灯片内容块
 */
export type SlideContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'image'; alt: string; url: string }

/**
 * Markdown 解析后的幻灯片内容
 */
export interface ParsedSlide {
  /** 页面索引 */
  index: number
  /** 页面类型 */
  type: 'title' | 'section' | 'content'
  /** 页面布局提示 */
  layoutHint?: 'cover' | 'ending'
  /** 页面标题 */
  title: string
  /** 副标题 */
  subtitle?: string
  /** 内容块列表 */
  blocks: SlideContentBlock[]
  /** 是否必须保持单页输出 */
  strictPageCount?: boolean
}

// ==================== API 请求/响应 ====================

/**
 * PPT 导出预览请求
 */
export interface PreviewPptExportRequest {
  /** 消息内容 */
  content: string
  /** 模板 ID（可选，用于提取样式） */
  templateId?: string
}

/**
 * PPT 导出预览结果
 */
export interface PreviewPptExportResult {
  /** 是否成功 */
  success: boolean
  /** 配置数据 */
  config?: PptExportConfig
  /** 可用的模板列表（用于样式选择） */
  availableTemplates?: PptTemplateListItem[]
  /** 警告信息（如页面数量过多） */
  warning?: string
  /** 错误信息 */
  error?: string
}

/**
 * 生成 PPT 请求
 */
export interface GeneratePptRequest {
  /** 消息内容 */
  content: string
  /** 导出配置 */
  config: PptExportConfig
  /** 文件标题 */
  title?: string
}

/**
 * 生成 PPT 结果
 */
export interface GeneratePptResult {
  /** 是否成功 */
  success: boolean
  /** 文件二进制数据 */
  data?: number[]
  /** 文件名 */
  fileName?: string
  /** 错误信息 */
  error?: string
}
