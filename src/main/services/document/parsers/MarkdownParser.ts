import type { ExportBlock, ExportListItem, InlineSegment } from '../types'
import type { MarkdownInlineInherited, MarkdownListMatch } from './types'

/**
 * Markdown 解析器
 * 负责将 Markdown 文本解析为导出块结构
 */
export class MarkdownParser {
  /**
   * 解析 Markdown 为导出块
   */
  parseBlocks(content: string): ExportBlock[] {
    const lines = content.replace(/\r\n?/g, '\n').split('\n')
    const blocks: ExportBlock[] = []
    let paragraphLines: string[] = []
    let index = 0

    const flushParagraph = (): void => {
      const paragraph = paragraphLines.join('\n').trim()
      if (paragraph) {
        blocks.push({
          type: 'paragraph',
          segments: this.parseInlineSegments(paragraph)
        })
      }
      paragraphLines = []
    }

    while (index < lines.length) {
      const line = lines[index]

      if (!line.trim()) {
        flushParagraph()
        index++
        continue
      }

      const fenceMatch = line.match(/^(```+|~~~+)\s*([\w-]+)?\s*$/)
      if (fenceMatch) {
        flushParagraph()
        const fence = fenceMatch[1]
        const language = fenceMatch[2]
        const codeLines: string[] = []
        index++

        while (index < lines.length && !lines[index].startsWith(fence)) {
          codeLines.push(lines[index])
          index++
        }

        if (index < lines.length) {
          index++
        }

        blocks.push({
          type: 'code',
          language,
          lines: codeLines.length > 0 ? codeLines : ['']
        })
        continue
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        flushParagraph()
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          segments: this.parseInlineSegments(headingMatch[2].trim())
        })
        index++
        continue
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        flushParagraph()
        blocks.push({ type: 'separator' })
        index++
        continue
      }

      if (
        index + 1 < lines.length &&
        line.includes('|') &&
        this.isMarkdownTableSeparator(lines[index + 1])
      ) {
        flushParagraph()
        const headerCells = this.splitMarkdownTableRow(line).map((cell) =>
          this.parseInlineSegments(cell)
        )
        index += 2
        const rowCells: InlineSegment[][][] = []

        while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
          rowCells.push(
            this.splitMarkdownTableRow(lines[index]).map((cell) => this.parseInlineSegments(cell))
          )
          index++
        }

        blocks.push({
          type: 'table',
          headers: headerCells,
          rows: rowCells
        })
        continue
      }

      const blockquoteMatch = line.match(/^\s*>\s?(.*)$/)
      if (blockquoteMatch) {
        flushParagraph()
        const quoteLines: string[] = []

        while (index < lines.length) {
          const current = lines[index]
          const currentQuoteMatch = current.match(/^\s*>\s?(.*)$/)
          if (currentQuoteMatch) {
            quoteLines.push(currentQuoteMatch[1])
            index++
            continue
          }

          if (!current.trim()) {
            quoteLines.push('')
            index++
            continue
          }

          break
        }

        blocks.push({
          type: 'blockquote',
          segments: this.parseInlineSegments(quoteLines.join('\n').trim())
        })
        continue
      }

      if (this.matchListItem(line)) {
        flushParagraph()
        const items: ExportListItem[] = []

        while (index < lines.length) {
          const listMatch = this.matchListItem(lines[index])
          if (listMatch) {
            items.push({
              level: listMatch.level,
              ordered: listMatch.ordered,
              marker: listMatch.marker,
              segments: this.parseInlineSegments(listMatch.content)
            })
            index++
            continue
          }

          if (items.length > 0 && lines[index].trim() && !this.isMarkdownBlockStart(lines, index)) {
            const lastItem = items[items.length - 1]
            lastItem.segments = this.parseInlineSegments(
              `${this.segmentsToText(lastItem.segments)}\n${lines[index].trim()}`
            )
            index++
            continue
          }

          break
        }

        blocks.push({
          type: 'list',
          items
        })
        continue
      }

      paragraphLines.push(line)
      index++
    }

    flushParagraph()
    return blocks
  }

  /**
   * 将片段合并为纯文本
   */
  segmentsToText(segments: InlineSegment[]): string {
    return segments.map((segment) => segment.text).join('')
  }

  /**
   * 解析 Markdown 行内样式
   */
  private parseInlineSegments(
    text: string,
    inherited: MarkdownInlineInherited = {}
  ): InlineSegment[] {
    if (!text) {
      return []
    }

    const segments: InlineSegment[] = []
    let index = 0

    const pushPlainText = (value: string): void => {
      if (!value) {
        return
      }

      segments.push({
        text: value,
        ...inherited
      })
    }

    while (index < text.length) {
      if (text[index] === '`') {
        const closingIndex = text.indexOf('`', index + 1)
        if (closingIndex > index + 1) {
          segments.push({
            text: text.slice(index + 1, closingIndex),
            ...inherited,
            code: true
          })
          index = closingIndex + 1
          continue
        }
      }

      if (text[index] === '[') {
        const labelEnd = text.indexOf('](', index)
        if (labelEnd !== -1) {
          const urlEnd = text.indexOf(')', labelEnd + 2)
          if (urlEnd !== -1) {
            const label = text.slice(index + 1, labelEnd)
            const url = text.slice(labelEnd + 2, urlEnd)
            segments.push(
              ...this.parseInlineSegments(label, {
                ...inherited,
                link: url
              })
            )
            index = urlEnd + 1
            continue
          }
        }
      }

      if (text.startsWith('**', index) || text.startsWith('__', index)) {
        const delimiter = text.slice(index, index + 2)
        const closingIndex = text.indexOf(delimiter, index + 2)
        if (closingIndex > index + 2) {
          const content = text.slice(index + 2, closingIndex)
          segments.push(
            ...this.parseInlineSegments(content, {
              ...inherited,
              bold: true
            })
          )
          index = closingIndex + 2
          continue
        }
      }

      if (text[index] === '*' || text[index] === '_') {
        const delimiter = text[index]
        const closingIndex = text.indexOf(delimiter, index + 1)
        if (closingIndex > index + 1) {
          const content = text.slice(index + 1, closingIndex)
          segments.push(
            ...this.parseInlineSegments(content, {
              ...inherited,
              italic: true
            })
          )
          index = closingIndex + 1
          continue
        }
      }

      let nextIndex = index + 1
      while (nextIndex < text.length && !['`', '[', '*', '_'].includes(text[nextIndex])) {
        nextIndex++
      }

      pushPlainText(text.slice(index, nextIndex))
      index = nextIndex
    }

    return this.mergeInlineSegments(segments)
  }

  /**
   * 合并样式一致的相邻行内片段
   */
  private mergeInlineSegments(segments: InlineSegment[]): InlineSegment[] {
    return segments.reduce<InlineSegment[]>((acc, segment) => {
      if (!segment.text) {
        return acc
      }

      const previous = acc[acc.length - 1]
      if (
        previous &&
        previous.bold === segment.bold &&
        previous.italic === segment.italic &&
        previous.code === segment.code &&
        previous.link === segment.link
      ) {
        previous.text += segment.text
      } else {
        acc.push({ ...segment })
      }

      return acc
    }, [])
  }

  /**
   * 判断是否为 Markdown 表格分隔行
   */
  private isMarkdownTableSeparator(line: string): boolean {
    return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)
  }

  /**
   * 判断当前位置是否为 Markdown 块起始
   */
  private isMarkdownBlockStart(lines: string[], index: number): boolean {
    const line = lines[index]
    if (!line.trim()) {
      return false
    }

    if (/^(#{1,6})\s+/.test(line)) {
      return true
    }

    if (/^(```+|~~~+)/.test(line)) {
      return true
    }

    if (/^\s*>\s?/.test(line)) {
      return true
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      return true
    }

    if (this.matchListItem(line)) {
      return true
    }

    return (
      index + 1 < lines.length &&
      line.includes('|') &&
      this.isMarkdownTableSeparator(lines[index + 1])
    )
  }

  /**
   * 匹配列表项
   */
  private matchListItem(line: string): MarkdownListMatch | null {
    const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/)
    if (!match) {
      return null
    }

    return {
      level: Math.floor(match[1].length / 2),
      ordered: /\d+\./.test(match[2]),
      marker: match[2],
      content: match[3]
    }
  }

  /**
   * 拆分 Markdown 表格行
   */
  private splitMarkdownTableRow(line: string): string[] {
    const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    const cells: string[] = []
    let current = ''
    let escaped = false

    for (const char of normalized) {
      if (escaped) {
        current += char
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === '|') {
        cells.push(current.trim())
        current = ''
        continue
      }

      current += char
    }

    cells.push(current.trim())
    return cells
  }
}
