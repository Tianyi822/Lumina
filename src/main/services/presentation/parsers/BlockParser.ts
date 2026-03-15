import type { ParsedSlide, SlideContentBlock } from '@shared/types/ppt-export'
import type { BlockParserLike, ExportContentType, ParsedSlideFactoryOptions } from './types'

export class BlockParser implements BlockParserLike {
  parseSlide(lines: string[], index: number): ParsedSlide | null {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length === 0) return null
    const title = this.extractTitle(nonEmptyLines[0])
    if (!title) return null

    let subtitle: string | undefined
    let contentLines = nonEmptyLines.slice(1)
    if (contentLines.length > 0 && this.isH2Header(contentLines[0])) {
      subtitle = this.extractH2Title(contentLines[0])
      contentLines = contentLines.slice(1)
    }

    return this.createParsedSlide({
      index,
      title,
      subtitle,
      blocks: this.parseContentBlocks(contentLines),
      preferTitlePage: index === 0
    })
  }

  parseSlideByHeading(lines: string[], index: number): ParsedSlide | null {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length === 0) return null
    const title = this.extractTitle(nonEmptyLines[0])
    if (!title) return null

    return this.createParsedSlide({
      index,
      title,
      blocks: this.parseContentBlocks(nonEmptyLines.slice(1)),
      preferTitlePage: false
    })
  }

  createParsedSlide(options: ParsedSlideFactoryOptions): ParsedSlide {
    const { index, title, subtitle, blocks, preferTitlePage } = options
    return {
      index,
      type: blocks.length === 0 ? (subtitle || preferTitlePage ? 'title' : 'section') : 'content',
      title,
      subtitle,
      blocks
    }
  }

  parseContentBlocks(lines: string[]): SlideContentBlock[] {
    const blocks: SlideContentBlock[] = []
    let index = 0

    while (index < lines.length) {
      const line = lines[index]
      const trimmed = line.trim()
      if (!trimmed) {
        index += 1
        continue
      }

      if (this.isUnorderedListItem(trimmed)) {
        const result = this.parseList(lines, index, false)
        blocks.push(result.block)
        index = result.nextIndex
        continue
      }
      if (this.isOrderedListItem(trimmed)) {
        const result = this.parseList(lines, index, true)
        blocks.push(result.block)
        index = result.nextIndex
        continue
      }
      if (this.isTableRow(trimmed)) {
        const result = this.parseTable(lines, index)
        if (result) {
          blocks.push(result.block)
          index = result.nextIndex
          continue
        }
      }
      if (this.isImage(trimmed)) {
        const block = this.parseImage(trimmed)
        if (block) blocks.push(block)
        index += 1
        continue
      }
      if (this.isContentHeader(trimmed)) {
        blocks.push({ type: 'paragraph', text: this.extractTitle(trimmed) })
        index += 1
        continue
      }

      const result = this.parseParagraph(lines, index)
      blocks.push(result.block)
      index = result.nextIndex
    }

    return blocks
  }

  splitByHeading(lines: string[], isHeader: (line: string) => boolean): string[][] {
    const sections: string[][] = []
    let currentSection: string[] | null = null

    for (const line of lines) {
      if (isHeader(line)) {
        if (currentSection) sections.push(currentSection)
        currentSection = [line]
        continue
      }
      if (currentSection) currentSection.push(line)
    }

    if (currentSection) sections.push(currentSection)
    return sections
  }

  detectContentType(slide: ParsedSlide): ExportContentType {
    if (slide.type === 'title' || (slide.type === 'section' && slide.blocks.length === 0)) {
      return 'title'
    }
    if (slide.blocks.length === 0) return 'content'

    let hasTable = false
    let hasList = false
    let hasParagraph = false
    let hasImage = false
    for (const block of slide.blocks) {
      if (block.type === 'table') hasTable = true
      if (block.type === 'list') hasList = true
      if (block.type === 'paragraph') hasParagraph = true
      if (block.type === 'image') hasImage = true
    }

    const typeCount = [hasTable, hasList, hasParagraph, hasImage].filter(Boolean).length
    if (typeCount === 1) {
      if (hasTable) return 'table'
      if (hasList) return 'list'
    }
    return 'mixed'
  }

  generateSummary(slide: ParsedSlide): string {
    if (slide.subtitle) return this.truncateText(slide.subtitle, 50)
    if (slide.blocks.length === 0) return '无内容'

    const firstBlock = slide.blocks[0]
    if (firstBlock.type === 'list') return `${firstBlock.items.length} 个列表项`
    if (firstBlock.type === 'table') return `${firstBlock.rows.length} 行 x ${firstBlock.headers.length} 列表格`
    if (firstBlock.type === 'paragraph') return this.truncateText(firstBlock.text, 50)
    if (firstBlock.type === 'image') return `图片: ${firstBlock.alt || '未命名'}`
    return '内容页'
  }

  sanitizeInlineText(text: string): string {
    return text
      .replace(/^\s*[-*]+\s*$/, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  }

  isH1Header(line: string): boolean {
    return /^#\s+.+/.test(line.trim())
  }
  isH2Header(line: string): boolean {
    return /^##\s+.+/.test(line.trim())
  }
  isHorizontalRule(line: string): boolean {
    return /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())
  }
  isContentHeader(line: string): boolean {
    return this.isH2Header(line) || this.isSubHeader(line)
  }
  extractTitle(line: string): string {
    return this.sanitizeInlineText(line.trim().replace(/^#+\s+/, '').trim())
  }
  extractH2Title(line: string): string {
    return this.sanitizeInlineText(line.trim().replace(/^##+\s+/, '').trim())
  }

  private isUnorderedListItem(line: string): boolean {
    return /^[-*+]\s+.+/.test(line.trim())
  }
  private isOrderedListItem(line: string): boolean {
    return /^\d+\.\s+.+/.test(line.trim())
  }

  private parseList(
    lines: string[],
    startIndex: number,
    ordered: boolean
  ): { block: SlideContentBlock; nextIndex: number } {
    const items: string[] = []
    const pattern = ordered ? /^\d+\.\s+/ : /^[-*+]\s+/
    let index = startIndex

    while (index < lines.length) {
      const trimmed = lines[index].trim()
      if (!trimmed) {
        index += 1
        break
      }

      const isTargetItem = ordered ? this.isOrderedListItem(trimmed) : this.isUnorderedListItem(trimmed)
      if (!isTargetItem) break

      items.push(this.sanitizeInlineText(trimmed.replace(pattern, '').trim()))
      index += 1
    }

    return { block: { type: 'list', items, ordered }, nextIndex: index }
  }

  private isTableRow(line: string): boolean {
    return /^\|.+?\|/.test(line.trim()) && line.split('|').filter((cell) => cell.trim()).length >= 2
  }

  private parseTable(
    lines: string[],
    startIndex: number
  ): { block: SlideContentBlock; nextIndex: number } | null {
    const tableLines: string[] = []
    let index = startIndex

    while (index < lines.length) {
      const trimmed = lines[index].trim()
      if (!trimmed) {
        index += 1
        break
      }
      if (!this.isTableRow(trimmed)) break

      tableLines.push(trimmed)
      index += 1
    }

    if (tableLines.length < 2) return null
    return {
      block: {
        type: 'table',
        headers: this.parseTableRow(tableLines[0]),
        rows: tableLines.slice(2).map((line) => this.parseTableRow(line))
      },
      nextIndex: index
    }
  }

  private parseTableRow(line: string): string[] {
    let trimmed = line.trim()
    if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
    if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
    return trimmed.split('|').map((cell) => this.sanitizeInlineText(cell.trim()))
  }

  private isImage(line: string): boolean {
    return /^!\[.+?\]\(.+?\)/.test(line.trim())
  }
  private parseImage(line: string): SlideContentBlock | null {
    const match = line.trim().match(/^!\[(.+?)\]\((.+?)\)/)
    return match ? { type: 'image', alt: this.sanitizeInlineText(match[1]), url: match[2] } : null
  }
  private isSubHeader(line: string): boolean {
    return /^#{3,6}\s+.+/.test(line.trim())
  }

  private parseParagraph(
    lines: string[],
    startIndex: number
  ): { block: SlideContentBlock; nextIndex: number } {
    const paragraphLines: string[] = []
    let index = startIndex

    while (index < lines.length) {
      const line = lines[index]
      const trimmed = line.trim()
      if (!trimmed) {
        index += 1
        break
      }

      if (
        this.isUnorderedListItem(trimmed) ||
        this.isOrderedListItem(trimmed) ||
        this.isTableRow(trimmed) ||
        this.isImage(trimmed) ||
        this.isContentHeader(trimmed) ||
        this.isH1Header(trimmed)
      ) {
        break
      }

      paragraphLines.push(trimmed)
      index += 1
    }

    return {
      block: { type: 'paragraph', text: this.sanitizeInlineText(paragraphLines.join(' ')) },
      nextIndex: index
    }
  }

  private truncateText(text: string, maxLength: number): string {
    return text.length <= maxLength ? text : text.slice(0, maxLength - 1) + '…'
  }
}
