/**
 * Markdown 行内片段
 */
export interface InlineSegment {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  link?: string
}

/**
 * Markdown 列表项
 */
export interface ExportListItem {
  level: number
  ordered: boolean
  marker: string
  segments: InlineSegment[]
}

/**
 * 导出块结构
 */
export type ExportBlock =
  | {
      type: 'heading'
      level: number
      segments: InlineSegment[]
    }
  | {
      type: 'paragraph'
      segments: InlineSegment[]
    }
  | {
      type: 'blockquote'
      segments: InlineSegment[]
    }
  | {
      type: 'list'
      items: ExportListItem[]
    }
  | {
      type: 'code'
      language?: string
      lines: string[]
    }
  | {
      type: 'table'
      headers: InlineSegment[][]
      rows: InlineSegment[][][]
    }
  | {
      type: 'separator'
    }
