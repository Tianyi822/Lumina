import type { InlineSegment } from '../types'

/**
 * Markdown 列表匹配结果
 */
export interface MarkdownListMatch {
  level: number
  ordered: boolean
  marker: string
  content: string
}

/**
 * Markdown 行内继承样式
 */
export type MarkdownInlineInherited = Omit<InlineSegment, 'text'>
