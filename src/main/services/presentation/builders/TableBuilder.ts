import type PptxGenJS from 'pptxgenjs'
import type { ResolvedTheme } from '../types/presentation'
import type { PositionOptions, TableContent } from '@shared/types/presentation'

/**
 * 表格构建器
 */
export class TableBuilder {
  /**
   * 添加表格内容
   */
  addTable(
    slide: PptxGenJS.Slide,
    content: TableContent,
    position: Required<PositionOptions>,
    theme: ResolvedTheme
  ): number {
    const borderColor = content.style?.borderColor?.replace(/^#/, '') || theme.secondaryColor
    const headerFillColor = content.style?.headerFillColor?.replace(/^#/, '') || theme.primaryColor
    const headerTextColor =
      content.style?.headerTextColor?.replace(/^#/, '') ||
      (theme.backgroundColor === 'FFFFFF' ? 'FFFFFF' : theme.backgroundColor)
    const bodyFillColor = content.style?.bodyFillColor?.replace(/^#/, '') || 'FFFFFF'
    const bodyTextColor = content.style?.bodyTextColor?.replace(/^#/, '') || theme.textColor
    const striped = content.style?.striped ?? true

    const tableRows: PptxGenJS.TableRow[] = [
      content.headers.map((header) => ({
        text: header,
        options: {
          bold: true,
          color: headerTextColor,
          fill: { color: headerFillColor },
          valign: 'middle' as const
        }
      })),
      ...content.rows.map((row, rowIndex) =>
        row.map((cell) => ({
          text: cell,
          options: {
            color: bodyTextColor,
            fill: {
              color: striped && rowIndex % 2 === 1 ? theme.secondaryColor : bodyFillColor,
              transparency: striped && rowIndex % 2 === 1 ? 85 : 0
            },
            valign: 'middle' as const
          }
        }))
      )
    ]

    slide.addTable(tableRows, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      border: {
        color: borderColor,
        pt: 1,
        type: 'solid'
      },
      colW: content.headers.length > 0 ? position.w / content.headers.length : position.w,
      margin: 5,
      fontFace: theme.fontFace,
      fontSize: 12,
      color: bodyTextColor,
      autoPage: false
    })

    return position.h
  }
}
