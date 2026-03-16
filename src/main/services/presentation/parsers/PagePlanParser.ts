import type { ParsedSlide, SlideContentBlock } from '@shared/types/ppt-export'
import type { PagePlanContentUnit, PagePlanSection, ParseStrategy, PptParseContext } from './types'

export class PagePlanParser implements ParseStrategy {
  canHandle(context: PptParseContext): boolean {
    return this.extractSections(context).length > 0
  }

  parse(context: PptParseContext): ParsedSlide[] {
    const sections = this.extractSections(context)
    if (sections.length === 0) return []

    this.reconcileSectionPageCounts(sections, context.options.expectedSlideCount)
    const slides: ParsedSlide[] = []
    for (const section of sections) {
      const slideCount = Math.max(1, section.endPage - section.startPage + 1)
      slides.push(...this.buildSlidesFromSection(section, slides.length, slideCount, context))
    }

    return slides.map((slide, index) => ({ ...slide, index, strictPageCount: true }))
  }

  private extractSections(context: PptParseContext): PagePlanSection[] {
    const sections: PagePlanSection[] = []
    let currentSection: PagePlanSection | null = null

    for (const rawLine of context.lines) {
      const line = this.normalizePagePlanLine(rawLine, context)
      if (!line || this.isPlanningNoiseLine(line) || context.blockParser.isHorizontalRule(line))
        continue

      const marker = this.parsePageMarker(line, context)
      if (marker) {
        if (currentSection) sections.push(currentSection)
        currentSection = {
          startPage: marker.startPage,
          endPage: marker.endPage,
          title: marker.title,
          lines: []
        }
        continue
      }

      if (!currentSection) continue
      if (this.isPagePlanOutroLine(line)) break
      currentSection.lines.push(line)
    }

    if (currentSection) sections.push(currentSection)
    return sections
  }

  private parsePageMarker(
    line: string,
    context: PptParseContext
  ): { startPage: number; endPage: number; title: string } | null {
    const normalized = line
      .replace(/^[*-]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .trim()
    const match = normalized.match(
      /^第\s*(\d+)(?:\s*[-~～至到]\s*(\d+))?\s*页\s*[-—–－：:]\s*(.+)$/
    )
    if (!match) return null

    const startPage = Number.parseInt(match[1], 10)
    const endPage = match[2] ? Number.parseInt(match[2], 10) : startPage
    const title = context.blockParser.sanitizeInlineText(match[3])
    if (!Number.isFinite(startPage) || !Number.isFinite(endPage) || !title) return null
    return { startPage, endPage: Math.max(startPage, endPage), title }
  }

  private reconcileSectionPageCounts(
    sections: PagePlanSection[],
    expectedSlideCount?: number
  ): void {
    if (!expectedSlideCount || sections.length === 0) return

    let delta =
      sections.reduce(
        (total, section) => total + Math.max(1, section.endPage - section.startPage + 1),
        0
      ) - expectedSlideCount
    if (delta === 0 || Math.abs(delta) > 3) return

    const sortedSections = [...sections].sort((left, right) => {
      const scoreDiff =
        this.getSectionFlexibilityScore(right) - this.getSectionFlexibilityScore(left)
      if (scoreDiff !== 0) return scoreDiff

      const leftCount = left.endPage - left.startPage + 1
      const rightCount = right.endPage - right.startPage + 1
      if (leftCount !== rightCount) return rightCount - leftCount
      return sections.indexOf(right) - sections.indexOf(left)
    })

    while (delta > 0) {
      const target = sortedSections.find((section) => section.endPage - section.startPage + 1 > 1)
      if (!target) break
      target.endPage -= 1
      delta -= 1
    }

    while (delta < 0) {
      const target = sortedSections[0]
      if (!target) break
      target.endPage += 1
      delta += 1
    }
  }

  private getSectionFlexibilityScore(section: PagePlanSection): number {
    let score = Math.max(0, section.endPage - section.startPage)
    if (/可根据需要|补充|相关工作|技术细节|Q&A|问答|附录/i.test(section.title)) score += 10
    if (/总结|展望|实验|结果|方法/i.test(section.title)) score += 4
    return score
  }

  private buildSlidesFromSection(
    section: PagePlanSection,
    startIndex: number,
    slideCount: number,
    context: PptParseContext
  ): ParsedSlide[] {
    const title = context.blockParser.sanitizeInlineText(section.title)
    const cleanedLines = section.lines
      .map((line) => context.blockParser.sanitizeInlineText(line))
      .filter((line) => line && !this.isPagePlanOutroLine(line))
    const isCoverSlide =
      /封面|首页|标题页/i.test(title) || cleanedLines.some((line) => /^标题[:：]/.test(line))
    const isEndingSlide =
      /结束页|结束|致谢|结束语/i.test(title) ||
      cleanedLines.some((line) => /汇报完毕|批评指正|感谢聆听/i.test(line))

    if (isCoverSlide) {
      const titleLine = cleanedLines.find((line) => /^标题[:：]/.test(line))
      const subtitleLine = cleanedLines.find((line) => /^副标题[:：]/.test(line))
      return [
        {
          index: startIndex,
          type: 'title',
          layoutHint: 'cover',
          title: titleLine ? this.extractLabelValue(titleLine, context) : title,
          subtitle: subtitleLine ? this.extractLabelValue(subtitleLine, context) : undefined,
          blocks: this.buildPagePlanBlocks(
            cleanedLines
              .filter((line) => !/^标题[:：]/.test(line) && !/^副标题[:：]/.test(line))
              .map((text) => ({ kind: 'text', text }))
          ),
          strictPageCount: true
        }
      ]
    }

    if (isEndingSlide) {
      const endingParagraphs = cleanedLines
        .map((line) => this.extractLabelValue(line, context))
        .filter(Boolean)
      return [
        {
          index: startIndex,
          type: 'title',
          layoutHint: 'ending',
          title,
          subtitle: endingParagraphs.find((line) => line !== title),
          blocks: [],
          strictPageCount: true
        }
      ]
    }

    const groups = this.distributeUnits(this.parseContentUnits(cleanedLines, context), slideCount)
    return groups.map((group, offset) => ({
      index: startIndex + offset,
      type: group.length === 0 ? 'section' : 'content',
      title: slideCount > 1 ? `${title}（${offset + 1}/${slideCount}）` : title,
      blocks: this.buildPagePlanBlocks(group),
      strictPageCount: true
    }))
  }

  private parseContentUnits(lines: string[], context: PptParseContext): PagePlanContentUnit[] {
    const units: PagePlanContentUnit[] = []
    let index = 0

    while (index < lines.length) {
      const line = lines[index].trim()
      if (!line) {
        index += 1
        continue
      }

      const tableResult = this.parseLooseTable(lines, index, context)
      if (tableResult) {
        units.push({ kind: 'table', headers: tableResult.headers, rows: tableResult.rows })
        index = tableResult.nextIndex
        continue
      }

      units.push({ kind: 'text', text: line })
      index += 1
    }

    return units
  }

  private parseLooseTable(
    lines: string[],
    startIndex: number,
    context: PptParseContext
  ): { headers: string[]; rows: string[][]; nextIndex: number } | null {
    const firstRow = this.splitLooseTableRow(lines[startIndex], context)
    if (!firstRow || firstRow.length < 2) return null

    const rows: string[][] = [firstRow]
    let index = startIndex + 1
    while (index < lines.length) {
      const row = this.splitLooseTableRow(lines[index], context)
      if (!row || row.length < 2) break
      rows.push(row)
      index += 1
    }
    if (rows.length < 2) return null

    const columnCount = rows[0].length
    const normalizedRows = rows
      .filter((row) => row.length >= Math.min(columnCount, 2))
      .map((row) =>
        row.length === columnCount
          ? row
          : [...row, ...Array.from({ length: columnCount - row.length }, () => '')]
      )
    if (normalizedRows.length < 2) return null

    return { headers: normalizedRows[0], rows: normalizedRows.slice(1), nextIndex: index }
  }

  private splitLooseTableRow(line: string, context: PptParseContext): string[] | null {
    const normalized = context.blockParser.sanitizeInlineText(line).trim()
    if (!normalized) return null

    const delimiter = normalized.includes('\t') ? /\t+/ : /\s{2,}/
    const cells = normalized
      .split(delimiter)
      .map((cell) => context.blockParser.sanitizeInlineText(cell.trim()))
      .filter(Boolean)
    return cells.length >= 2 ? cells : null
  }

  private distributeUnits(
    units: PagePlanContentUnit[],
    slideCount: number
  ): PagePlanContentUnit[][] {
    const groups = Array.from(
      { length: Math.max(1, slideCount) },
      () => [] as PagePlanContentUnit[]
    )
    if (units.length === 0) return groups

    if (units.length < groups.length) {
      units.forEach((unit, index) => groups[Math.min(index + 1, groups.length - 1)].push(unit))
      return groups
    }

    const baseSize = Math.floor(units.length / groups.length)
    let remainder = units.length % groups.length
    let cursor = 0
    for (let index = 0; index < groups.length; index++) {
      const size = baseSize + (remainder > 0 ? 1 : 0)
      groups[index] = units.slice(cursor, cursor + size)
      cursor += size
      if (remainder > 0) remainder -= 1
    }
    return groups
  }

  private buildPagePlanBlocks(units: PagePlanContentUnit[]): SlideContentBlock[] {
    const blocks: SlideContentBlock[] = []
    let pendingTexts: string[] = []
    const flushPendingTexts = (): void => {
      if (pendingTexts.length === 0) return
      blocks.push(
        pendingTexts.length === 1
          ? { type: 'paragraph', text: pendingTexts[0] }
          : { type: 'list', items: pendingTexts, ordered: false }
      )
      pendingTexts = []
    }

    for (const unit of units) {
      if (unit.kind === 'text') {
        pendingTexts.push(unit.text)
        continue
      }
      flushPendingTexts()
      blocks.push({ type: 'table', headers: unit.headers, rows: unit.rows })
    }

    flushPendingTexts()
    return blocks
  }

  private normalizePagePlanLine(line: string, context: PptParseContext): string {
    return context.blockParser.sanitizeInlineText(
      line
        .replace(/^\s*>+\s*/, '')
        .replace(/^\s*#{1,6}\s*/, '')
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .replace(/^`{3,}.*$/, '')
        .replace(/^~{3,}.*$/, '')
        .trim()
    )
  }

  private isPlanningNoiseLine(line: string): boolean {
    return (
      /^📋\s*PPT\s*内容规划$/i.test(line) ||
      /^PPT\s*内容规划$/i.test(line) ||
      /^好的[！!]?.*模板结构/.test(line) ||
      /^现在我来为您规划/.test(line)
    )
  }
  private isPagePlanOutroLine(line: string): boolean {
    return /^(请问.*满意|如果需要调整|确认后我将开始|请告诉我|如果需要.*告诉我)/.test(line)
  }
  private extractLabelValue(line: string, context: PptParseContext): string {
    const match = line.match(/^[^：:]+[:：]\s*(.+)$/)
    return context.blockParser.sanitizeInlineText(match?.[1] ?? line)
  }
}
