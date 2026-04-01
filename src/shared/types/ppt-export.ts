/**
 * PPT 导出相关的类型定义
 */

// ==================== 解析后的内容结构 ====================

/**
 * 幻灯片内容块
 */
export type SlideContentBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'subheading'; text: string }
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

// ==================== 妙笔相关类型 ====================

export interface MiaobiOutlineResult {
  success: boolean
  taskId?: string
  outline?: string
  error?: string
}

export interface MiaobiCreationResult {
  success: boolean
  appkey?: string
  code?: string
  error?: string
}
