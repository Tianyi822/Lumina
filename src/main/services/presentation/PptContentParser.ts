/**
 * PPT 内容解析器
 * 将 Markdown 格式的内容解析为结构化的幻灯片数据
 */

import type {
  ParsedSlide,
  PptExportSlidePreview,
  SlideContentBlock
} from '@shared/types/ppt-export'

/**
 * 导出预览的内容类型
 */
type ExportContentType = 'title' | 'content' | 'table' | 'list' | 'mixed'

/**
 * 解析选项
 */
interface PptParseOptions {
  /** 期望的页面数量（通常来自模板） */
  expectedSlideCount?: number
}

/**
 * 页码规划节
 */
interface PagePlanSection {
  startPage: number
  endPage: number
  title: string
  lines: string[]
}

/**
 * 页码规划内容单元
 */
type PagePlanContentUnit =
  | { kind: 'text'; text: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }

/**
 * Markdown 内容解析器
 * 负责将 AI 生成的 Markdown 内容转换为 PPT 可用的结构化数据
 */
export class PptContentParser {
  /**
   * 解析 Markdown 为幻灯片数组
   *
   * 策略:
   * 1. 识别 H1 作为新幻灯片的分隔
   * 2. H1 内容作为幻灯片标题
   * 3. 收集 H1 到下一个 H1 之间的所有内容
   * 4. 识别表格、列表等特殊结构
   *
   * @param content - Markdown 格式的内容
   * @returns 解析后的幻灯片数组
   */
  parse(content: string, options: PptParseOptions = {}): ParsedSlide[] {
    // 规范化内容：统一换行符，去除首尾空白
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

    if (!normalizedContent) {
      return []
    }

    // 按行分割
    const lines = normalizedContent.split('\n')

    const pagePlanSlides = this.parseWithPagePlan(lines, options.expectedSlideCount)
    if (pagePlanSlides.length > 0) {
      return pagePlanSlides
    }

    const h1Count = lines.filter(line => this.isH1Header(line)).length
    const h2Count = lines.filter(line => this.isH2Header(line)).length

    // 优先按多个 H1 拆分，保持原有 Markdown 约定
    if (h1Count > 1) {
      return this.parseWithH1(lines)
    }

    // 常见的 PPT 草稿格式：一个总标题 + 多个 H2 页面
    if (h1Count === 1 && h2Count > 1) {
      const slides = this.parseSingleH1WithH2(lines)
      if (slides.length > 1) {
        return slides
      }
    }

    if (h1Count === 1) {
      const slides = this.parseWithH1(lines)
      if (slides.length > 0) {
        return slides
      }
    }

    // 无 H1 时，如果存在多个 H2，则按 H2 拆分为多个页面
    if (h2Count > 1) {
      const slides = this.parseWithH2(lines)
      if (slides.length > 0) {
        return slides
      }
    }

    // 最后回退到横线分隔和单页解析
    const separatedSlides = this.parseWithHorizontalRules(lines)
    if (separatedSlides.length > 1) {
      return separatedSlides
    }

    return this.parseWithoutH1(lines)
  }

  /**
   * 生成导出预览数据
   * @param slides - 解析后的幻灯片数组
   * @returns 导出预览数组
   */
  generatePreview(slides: ParsedSlide[]): PptExportSlidePreview[] {
    return slides.map(slide => {
      const contentType = this.detectContentType(slide)
      const summary = this.generateSummary(slide)

      return {
        index: slide.index,
        title: slide.title,
        contentType,
        summary,
        selected: true
      }
    })
  }

  /**
   * 解析“第 X 页 / 第 X-Y 页”格式的页码规划内容
   * 这类内容常见于模型先给出 PPT 规划，再由系统导出 PPT 的场景
   * @param lines - 原始行数组
   * @param expectedSlideCount - 期望页数（通常来自模板）
   * @returns 解析后的幻灯片数组
   */
  private parseWithPagePlan(lines: string[], expectedSlideCount?: number): ParsedSlide[] {
    const sections = this.extractPagePlanSections(lines)
    if (sections.length === 0) {
      return []
    }

    this.reconcileSectionPageCounts(sections, expectedSlideCount)

    const slides: ParsedSlide[] = []

    for (const section of sections) {
      const slideCount = Math.max(1, section.endPage - section.startPage + 1)
      const builtSlides = this.buildSlidesFromPagePlanSection(section, slides.length, slideCount)
      slides.push(...builtSlides)
    }

    return slides.map((slide, index) => ({
      ...slide,
      index,
      strictPageCount: true
    }))
  }

  /**
   * 从原始文本中提取页码规划节
   * @param lines - 原始行数组
   * @returns 规划节列表
   */
  private extractPagePlanSections(lines: string[]): PagePlanSection[] {
    const sections: PagePlanSection[] = []
    let currentSection: PagePlanSection | null = null

    for (const rawLine of lines) {
      const line = this.normalizePagePlanLine(rawLine)
      if (!line || this.isPlanningNoiseLine(line) || this.isHorizontalRule(line)) {
        continue
      }

      const marker = this.parsePageMarker(line)
      if (marker) {
        if (currentSection) {
          sections.push(currentSection)
        }

        currentSection = {
          startPage: marker.startPage,
          endPage: marker.endPage,
          title: marker.title,
          lines: []
        }
        continue
      }

      if (!currentSection) {
        continue
      }

      if (this.isPagePlanOutroLine(line)) {
        break
      }

      currentSection.lines.push(line)
    }

    if (currentSection) {
      sections.push(currentSection)
    }

    return sections
  }

  /**
   * 解析单个页码标记
   * @param line - 规范化后的文本行
   * @returns 页码信息
   */
  private parsePageMarker(
    line: string
  ): { startPage: number; endPage: number; title: string } | null {
    const normalized = line
      .replace(/^[*-]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .trim()

    const match = normalized.match(
      /^第\s*(\d+)(?:\s*[-~～至到]\s*(\d+))?\s*页\s*[-—–－：:]\s*(.+)$/
    )

    if (!match) {
      return null
    }

    const startPage = Number.parseInt(match[1], 10)
    const endPage = match[2] ? Number.parseInt(match[2], 10) : startPage
    const title = this.sanitizeInlineText(match[3])

    if (!Number.isFinite(startPage) || !Number.isFinite(endPage) || !title) {
      return null
    }

    return {
      startPage,
      endPage: Math.max(startPage, endPage),
      title
    }
  }

  /**
   * 根据模板页数等约束，微调规划节的页数
   * 主要用于纠正模型回复与模板页数差 1-2 页的常见情况
   * @param sections - 规划节列表
   * @param expectedSlideCount - 期望页数
   */
  private reconcileSectionPageCounts(
    sections: PagePlanSection[],
    expectedSlideCount?: number
  ): void {
    if (!expectedSlideCount || sections.length === 0) {
      return
    }

    let actualSlideCount = sections.reduce(
      (total, section) => total + Math.max(1, section.endPage - section.startPage + 1),
      0
    )
    let delta = actualSlideCount - expectedSlideCount

    if (delta === 0 || Math.abs(delta) > 3) {
      return
    }

    const sortedSections = [...sections].sort((left, right) => {
      const leftScore = this.getSectionFlexibilityScore(left)
      const rightScore = this.getSectionFlexibilityScore(right)

      if (leftScore !== rightScore) {
        return rightScore - leftScore
      }

      const leftCount = left.endPage - left.startPage + 1
      const rightCount = right.endPage - right.startPage + 1
      if (leftCount !== rightCount) {
        return rightCount - leftCount
      }

      return sections.indexOf(right) - sections.indexOf(left)
    })

    while (delta > 0) {
      const target = sortedSections.find(
        (section) => section.endPage - section.startPage + 1 > 1
      )

      if (!target) {
        break
      }

      target.endPage -= 1
      delta -= 1
      actualSlideCount -= 1
    }

    while (delta < 0) {
      const target = sortedSections[0]
      if (!target) {
        break
      }

      target.endPage += 1
      delta += 1
      actualSlideCount += 1
    }
  }

  /**
   * 计算节的可伸缩性分值，分值越高越适合增减页数
   * @param section - 规划节
   * @returns 分值
   */
  private getSectionFlexibilityScore(section: PagePlanSection): number {
    const title = section.title
    let score = 0

    if (/可根据需要|补充|相关工作|技术细节|Q&A|问答|附录/i.test(title)) {
      score += 10
    }

    if (/总结|展望|实验|结果|方法/i.test(title)) {
      score += 4
    }

    score += Math.max(0, section.endPage - section.startPage)
    return score
  }

  /**
   * 将单个规划节转换为一组幻灯片
   * @param section - 规划节
   * @param startIndex - 起始索引
   * @param slideCount - 目标页数
   * @returns 幻灯片数组
   */
  private buildSlidesFromPagePlanSection(
    section: PagePlanSection,
    startIndex: number,
    slideCount: number
  ): ParsedSlide[] {
    const title = this.sanitizeInlineText(section.title)
    const cleanedLines = section.lines
      .map((line) => this.sanitizeInlineText(line))
      .filter((line) => line && !this.isPagePlanOutroLine(line))

    const isCoverSlide = /封面|首页|标题页/i.test(title) || cleanedLines.some((line) => /^标题[:：]/.test(line))
    const isEndingSlide =
      /结束页|结束|致谢|结束语/i.test(title) ||
      cleanedLines.some((line) => /汇报完毕|批评指正|感谢聆听/i.test(line))

    if (isCoverSlide) {
      const titleLine = cleanedLines.find((line) => /^标题[:：]/.test(line))
      const subtitleLine = cleanedLines.find((line) => /^副标题[:：]/.test(line))
      const coverTitle = titleLine ? this.extractLabelValue(titleLine) : title
      const coverSubtitle = subtitleLine ? this.extractLabelValue(subtitleLine) : undefined
      const contentItems = cleanedLines.filter(
        (line) => !/^标题[:：]/.test(line) && !/^副标题[:：]/.test(line)
      )
      const blocks = this.buildPagePlanBlocks(contentItems.map((text) => ({ kind: 'text', text })))

      return [
        {
          index: startIndex,
          type: 'title',
          layoutHint: 'cover',
          title: coverTitle,
          subtitle: coverSubtitle,
          blocks,
          strictPageCount: true
        }
      ]
    }

    if (isEndingSlide) {
      const endingParagraphs = cleanedLines
        .map((line) => this.extractLabelValue(line))
        .filter(Boolean)
      const subtitle = endingParagraphs.find((line) => line !== title)

      return [
        {
          index: startIndex,
          type: 'title',
          layoutHint: 'ending',
          title,
          subtitle,
          blocks: [],
          strictPageCount: true
        }
      ]
    }

    const units = this.parsePagePlanContentUnits(cleanedLines)
    const groupedUnits = this.distributePagePlanUnits(units, slideCount)

    return groupedUnits.map((group, offset) => {
      const blocks = this.buildPagePlanBlocks(group)
      const hasMultiplePages = slideCount > 1
      const slideTitle = hasMultiplePages ? `${title}（${offset + 1}/${slideCount}）` : title

      return {
        index: startIndex + offset,
        type: blocks.length === 0 ? 'section' : 'content',
        title: slideTitle,
        blocks,
        strictPageCount: true
      }
    })
  }

  /**
   * 解析规划节中的内容单元
   * @param lines - 内容行数组
   * @returns 内容单元数组
   */
  private parsePagePlanContentUnits(lines: string[]): PagePlanContentUnit[] {
    const units: PagePlanContentUnit[] = []
    let index = 0

    while (index < lines.length) {
      const line = lines[index].trim()

      if (!line) {
        index += 1
        continue
      }

      const tableResult = this.parseLooseTable(lines, index)
      if (tableResult) {
        units.push({
          kind: 'table',
          headers: tableResult.headers,
          rows: tableResult.rows
        })
        index = tableResult.nextIndex
        continue
      }

      units.push({
        kind: 'text',
        text: line
      })
      index += 1
    }

    return units
  }

  /**
   * 解析非 Markdown 的宽松表格（tab 或多个空格分列）
   * @param lines - 内容行数组
   * @param startIndex - 开始位置
   * @returns 表格结果
   */
  private parseLooseTable(
    lines: string[],
    startIndex: number
  ): { headers: string[]; rows: string[][]; nextIndex: number } | null {
    const firstRow = this.splitLooseTableRow(lines[startIndex])
    if (!firstRow || firstRow.length < 2) {
      return null
    }

    const rows: string[][] = [firstRow]
    let index = startIndex + 1

    while (index < lines.length) {
      const row = this.splitLooseTableRow(lines[index])
      if (!row || row.length < 2) {
        break
      }

      rows.push(row)
      index += 1
    }

    if (rows.length < 2) {
      return null
    }

    const columnCount = rows[0].length
    const normalizedRows = rows
      .filter((row) => row.length >= Math.min(columnCount, 2))
      .map((row) => {
        if (row.length === columnCount) {
          return row
        }

        return [...row, ...Array.from({ length: columnCount - row.length }, () => '')]
      })

    if (normalizedRows.length < 2) {
      return null
    }

    return {
      headers: normalizedRows[0],
      rows: normalizedRows.slice(1),
      nextIndex: index
    }
  }

  /**
   * 分割宽松表格的一行
   * @param line - 原始文本行
   * @returns 单元格数组
   */
  private splitLooseTableRow(line: string): string[] | null {
    const normalized = this.sanitizeInlineText(line).trim()
    if (!normalized) {
      return null
    }

    const delimiter = normalized.includes('\t') ? /\t+/ : /\s{2,}/
    const cells = normalized
      .split(delimiter)
      .map((cell) => this.sanitizeInlineText(cell.trim()))
      .filter(Boolean)

    if (cells.length < 2) {
      return null
    }

    return cells
  }

  /**
   * 将内容单元按目标页数分组
   * @param units - 内容单元
   * @param slideCount - 目标页数
   * @returns 分组后的内容单元
   */
  private distributePagePlanUnits(
    units: PagePlanContentUnit[],
    slideCount: number
  ): PagePlanContentUnit[][] {
    const groups = Array.from({ length: Math.max(1, slideCount) }, () => [] as PagePlanContentUnit[])

    if (units.length === 0) {
      return groups
    }

    if (units.length < groups.length) {
      units.forEach((unit, index) => {
        const targetIndex = Math.min(index + 1, groups.length - 1)
        groups[targetIndex].push(unit)
      })
      return groups
    }

    const baseSize = Math.floor(units.length / groups.length)
    let remainder = units.length % groups.length
    let cursor = 0

    for (let i = 0; i < groups.length; i++) {
      const currentSize = baseSize + (remainder > 0 ? 1 : 0)
      groups[i] = units.slice(cursor, cursor + currentSize)
      cursor += currentSize
      if (remainder > 0) {
        remainder -= 1
      }
    }

    return groups
  }

  /**
   * 将规划节内容单元转换为标准内容块
   * @param units - 内容单元
   * @returns 内容块数组
   */
  private buildPagePlanBlocks(units: PagePlanContentUnit[]): SlideContentBlock[] {
    const blocks: SlideContentBlock[] = []
    let pendingTexts: string[] = []

    const flushPendingTexts = (): void => {
      if (pendingTexts.length === 0) {
        return
      }

      if (pendingTexts.length === 1) {
        blocks.push({ type: 'paragraph', text: pendingTexts[0] })
      } else {
        blocks.push({
          type: 'list',
          items: pendingTexts,
          ordered: false
        })
      }

      pendingTexts = []
    }

    for (const unit of units) {
      if (unit.kind === 'text') {
        pendingTexts.push(unit.text)
        continue
      }

      flushPendingTexts()
      blocks.push({
        type: 'table',
        headers: unit.headers,
        rows: unit.rows
      })
    }

    flushPendingTexts()
    return blocks
  }

  /**
   * 规范化页码规划行文本
   * @param line - 原始文本行
   * @returns 规范化后的文本
   */
  private normalizePagePlanLine(line: string): string {
    return this.sanitizeInlineText(
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

  /**
   * 判断是否为规划说明噪音行
   * @param line - 当前文本行
   * @returns 是否应忽略
   */
  private isPlanningNoiseLine(line: string): boolean {
    return (
      /^📋\s*PPT\s*内容规划$/i.test(line) ||
      /^PPT\s*内容规划$/i.test(line) ||
      /^好的[！!]?.*模板结构/.test(line) ||
      /^现在我来为您规划/.test(line)
    )
  }

  /**
   * 判断是否为规划尾部的确认/对话行
   * @param line - 当前文本行
   * @returns 是否为尾部噪音
   */
  private isPagePlanOutroLine(line: string): boolean {
    return /^(请问.*满意|如果需要调整|确认后我将开始|请告诉我|如果需要.*告诉我)/.test(line)
  }

  /**
   * 提取“标签：值”中的值
   * @param line - 文本行
   * @returns 标签值
   */
  private extractLabelValue(line: string): string {
    const match = line.match(/^[^：:]+[:：]\s*(.+)$/)
    return this.sanitizeInlineText(match?.[1] ?? line)
  }

  /**
   * 无 H1 文档的降级处理
   * 将全部内容作为一张幻灯片
   * @param lines - 所有行
   * @returns 解析后的幻灯片数组
   */
  private parseWithoutH1(lines: string[]): ParsedSlide[] {
    // 过滤空行
    const nonEmptyLines = lines.filter(line => line.trim().length > 0)

    if (nonEmptyLines.length === 0) {
      return []
    }

    // 使用第一行作为标题，如果没有有效内容则使用默认标题
    let title = '未命名文档'
    let contentLines = nonEmptyLines

    if (nonEmptyLines.length > 0) {
      const firstLine = nonEmptyLines[0].trim()
      // 检查第一行是否是 H2-H6 标题
      if (this.isContentHeader(firstLine)) {
        title = this.extractTitle(firstLine)
        contentLines = nonEmptyLines.slice(1)
      } else if (firstLine.length < 50) {
        // 第一行较短，可能本身就是标题
        title = this.sanitizeInlineText(firstLine)
        contentLines = nonEmptyLines.slice(1)
      }
    }

    // 解析内容块
    const blocks = this.parseContentBlocks(contentLines)

    return [
      {
        index: 0,
        type: blocks.length === 0 ? 'title' : 'content',
        title,
        blocks
      }
    ]
  }

  /**
   * 按 H1 标题拆分幻灯片
   * 同时兼容第一个 H1 之前存在引导内容的情况
   * @param lines - 原始行数组
   * @returns 幻灯片数组
   */
  private parseWithH1(lines: string[]): ParsedSlide[] {
    const slides: ParsedSlide[] = []
    let leadingLines: string[] = []
    let currentSlideLines: string[] | null = null

    for (const line of lines) {
      if (this.isH1Header(line)) {
        if (currentSlideLines) {
          const slide = this.parseSlide(currentSlideLines, slides.length)
          if (slide) {
            slides.push(slide)
          }
        } else if (leadingLines.some((item) => item.trim().length > 0)) {
          const prefixSlides = this.parseWithoutH1(leadingLines)
          for (const slide of prefixSlides) {
            slides.push({
              ...slide,
              index: slides.length
            })
          }
        }

        currentSlideLines = [line]
        leadingLines = []
        continue
      }

      if (currentSlideLines) {
        currentSlideLines.push(line)
      } else {
        leadingLines.push(line)
      }
    }

    if (currentSlideLines) {
      const slide = this.parseSlide(currentSlideLines, slides.length)
      if (slide) {
        slides.push(slide)
      }
    } else if (leadingLines.some((item) => item.trim().length > 0)) {
      const prefixSlides = this.parseWithoutH1(leadingLines)
      for (const slide of prefixSlides) {
        slides.push({
          ...slide,
          index: slides.length
        })
      }
    }

    return slides
  }

  /**
   * 解析“单个 H1 + 多个 H2”的 PPT 草稿
   * 将 H1 视为封面，总体内容按 H2 拆分为后续页面
   * @param lines - 原始行数组
   * @returns 幻灯片数组
   */
  private parseSingleH1WithH2(lines: string[]): ParsedSlide[] {
    const h1Index = lines.findIndex((line) => this.isH1Header(line))
    if (h1Index === -1) {
      return []
    }

    const title = this.extractTitle(lines[h1Index])
    if (!title) {
      return []
    }

    const leadingLines = lines.slice(0, h1Index)
    const remainingLines = lines.slice(h1Index + 1)
    const firstH2Index = remainingLines.findIndex((line) => this.isH2Header(line))

    if (firstH2Index === -1) {
      return []
    }

    const slides: ParsedSlide[] = []

    if (leadingLines.some((line) => line.trim().length > 0)) {
      const prefixSlides = this.parseWithoutH1(leadingLines)
      for (const slide of prefixSlides) {
        slides.push({
          ...slide,
          index: slides.length
        })
      }
    }

    const coverLines = remainingLines.slice(0, firstH2Index)
    const coverBlocks = this.parseContentBlocks(coverLines)
    slides.push(
      this.createParsedSlide({
        index: slides.length,
        title,
        blocks: coverBlocks,
        preferTitlePage: true
      })
    )

    for (const section of this.splitByHeading(remainingLines, (line) => this.isH2Header(line))) {
      const slide = this.parseSlideByHeading(section, slides.length)
      if (slide) {
        slides.push(slide)
      }
    }

    return slides
  }

  /**
   * 按 H2 标题拆分幻灯片
   * 用于没有 H1 但存在多个二级标题的场景
   * @param lines - 原始行数组
   * @returns 幻灯片数组
   */
  private parseWithH2(lines: string[]): ParsedSlide[] {
    const slides: ParsedSlide[] = []
    const sections = this.splitByHeading(lines, (line) => this.isH2Header(line))

    const firstH2Index = lines.findIndex((line) => this.isH2Header(line))
    if (firstH2Index > 0) {
      const prefixLines = lines.slice(0, firstH2Index)
      if (prefixLines.some((line) => line.trim().length > 0)) {
        const prefixSlides = this.parseWithoutH1(prefixLines)
        for (const slide of prefixSlides) {
          slides.push({
            ...slide,
            index: slides.length
          })
        }
      }
    }

    for (const section of sections) {
      const slide = this.parseSlideByHeading(section, slides.length)
      if (slide) {
        slides.push(slide)
      }
    }

    return slides
  }

  /**
   * 按 Markdown 横线分隔符拆分幻灯片
   * @param lines - 原始行数组
   * @returns 幻灯片数组
   */
  private parseWithHorizontalRules(lines: string[]): ParsedSlide[] {
    const sections: string[][] = []
    let currentSection: string[] = []

    for (const line of lines) {
      if (this.isHorizontalRule(line)) {
        if (currentSection.some((item) => item.trim().length > 0)) {
          sections.push(currentSection)
        }
        currentSection = []
        continue
      }

      currentSection.push(line)
    }

    if (currentSection.some((item) => item.trim().length > 0)) {
      sections.push(currentSection)
    }

    if (sections.length <= 1) {
      return []
    }

    return sections.flatMap((section, index) => {
      const slides = this.parseWithoutH1(section)
      return slides.map((slide, slideIndex) => ({
        ...slide,
        index: index + slideIndex
      }))
    })
  }

  /**
   * 检测幻灯片的内容类型（用于导出预览）
   * @param slide - 解析后的幻灯片
   * @returns 内容类型
   */
  private detectContentType(slide: ParsedSlide): ExportContentType {
    const { type, blocks } = slide

    // 标题页类型
    if (type === 'title' || (type === 'section' && blocks.length === 0)) {
      return 'title'
    }

    // 无内容块，归类为内容页
    if (blocks.length === 0) {
      return 'content'
    }

    // 统计各类型块的数量
    let hasTable = false
    let hasList = false
    let hasParagraph = false
    let hasImage = false

    for (const block of blocks) {
      switch (block.type) {
        case 'table':
          hasTable = true
          break
        case 'list':
          hasList = true
          break
        case 'paragraph':
          hasParagraph = true
          break
        case 'image':
          hasImage = true
          break
      }
    }

    // 单一类型判断
    const typeCount = [hasTable, hasList, hasParagraph, hasImage].filter(Boolean).length

    if (typeCount === 1) {
      if (hasTable) return 'table'
      if (hasList) return 'list'
    }

    // 混合类型
    return 'mixed'
  }

  /**
   * 生成幻灯片内容摘要
   * @param slide - 解析后的幻灯片
   * @returns 摘要文本（不超过 50 字符）
   */
  private generateSummary(slide: ParsedSlide): string {
    const { blocks, subtitle } = slide

    // 如果有副标题，优先使用
    if (subtitle) {
      return this.truncateText(subtitle, 50)
    }

    // 如果没有内容块，返回标题
    if (blocks.length === 0) {
      return '无内容'
    }

    // 根据第一个内容块生成摘要
    const firstBlock = blocks[0]

    switch (firstBlock.type) {
      case 'list':
        const itemCount = firstBlock.items.length
        return `${itemCount} 个列表项`

      case 'table':
        const rowCount = firstBlock.rows.length
        const colCount = firstBlock.headers.length
        return `${rowCount} 行 x ${colCount} 列表格`

      case 'paragraph':
        return this.truncateText(firstBlock.text, 50)

      case 'image':
        return `图片: ${firstBlock.alt || '未命名'}`

      default:
        return '内容页'
    }
  }

  /**
   * 截断文本到指定长度
   * @param text - 原始文本
   * @param maxLength - 最大长度
   * @returns 截断后的文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text
    }
    return text.slice(0, maxLength - 1) + '…'
  }

  /**
   * 清理行内 Markdown 标记，避免将强调语法原样写入 PPT
   * @param text - 原始文本
   * @returns 清理后的文本
   */
  private sanitizeInlineText(text: string): string {
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

  /**
   * 判断是否为 H1 标题行
   * @param line - 行内容
   * @returns 是否为 H1 标题
   */
  private isH1Header(line: string): boolean {
    const trimmed = line.trim()
    // 匹配 # 标题格式
    return /^#\s+.+/.test(trimmed)
  }

  /**
   * 判断是否为 Markdown 横线分隔符
   * @param line - 行内容
   * @returns 是否为横线
   */
  private isHorizontalRule(line: string): boolean {
    const trimmed = line.trim()
    return /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)
  }

  /**
   * 解析单个幻灯片
   * @param lines - 幻灯片的行内容
   * @param index - 幻灯片索引
   * @returns 解析后的幻灯片，如果无效则返回 null
   */
  private parseSlide(lines: string[], index: number): ParsedSlide | null {
    // 过滤空行并获取有效内容
    const nonEmptyLines = lines.filter(line => line.trim().length > 0)

    if (nonEmptyLines.length === 0) {
      return null
    }

    // 第一行应该是 H1 标题
    const title = this.extractTitle(nonEmptyLines[0])
    if (!title) {
      return null
    }

    // 剩余行作为内容
    const contentLines = nonEmptyLines.slice(1)

    // 检查是否有 H2 副标题
    let subtitle: string | undefined
    let actualContentLines = contentLines

    if (contentLines.length > 0) {
      const firstContentLine = contentLines[0].trim()
      if (this.isH2Header(firstContentLine)) {
        subtitle = this.extractH2Title(firstContentLine)
        actualContentLines = contentLines.slice(1)
      }
    }

    // 解析内容块
    const blocks = this.parseContentBlocks(actualContentLines)

    return this.createParsedSlide({
      index,
      title,
      subtitle,
      blocks,
      preferTitlePage: index === 0
    })
  }

  /**
   * 提取幻灯片标题
   * @param line - H1 标题行
   * @returns 提取的标题文本
   */
  private extractTitle(line: string): string {
    const trimmed = line.trim()
    // 移除 # 前缀
    return this.sanitizeInlineText(trimmed.replace(/^#+\s+/, '').trim())
  }

  /**
   * 判断是否为 H2 标题行
   * @param line - 行内容
   * @returns 是否为 H2 标题
   */
  private isH2Header(line: string): boolean {
    const trimmed = line.trim()
    return /^##\s+.+/.test(trimmed)
  }

  /**
   * 提取 H2 标题文本
   * @param line - H2 标题行
   * @returns 提取的标题文本
   */
  private extractH2Title(line: string): string {
    const trimmed = line.trim()
    return this.sanitizeInlineText(trimmed.replace(/^##+\s+/, '').trim())
  }

  /**
   * 解析任意标题级别拆分出的页面
   * @param lines - 页面行数组
   * @param index - 页面索引
   * @returns 解析结果
   */
  private parseSlideByHeading(lines: string[], index: number): ParsedSlide | null {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length === 0) {
      return null
    }

    const title = this.extractTitle(nonEmptyLines[0])
    if (!title) {
      return null
    }

    const blocks = this.parseContentBlocks(nonEmptyLines.slice(1))
    return this.createParsedSlide({
      index,
      title,
      blocks,
      preferTitlePage: false
    })
  }

  /**
   * 按指定标题规则拆分内容段
   * @param lines - 原始行数组
   * @param isHeader - 标题判断函数
   * @returns 段落数组
   */
  private splitByHeading(
    lines: string[],
    isHeader: (line: string) => boolean
  ): string[][] {
    const sections: string[][] = []
    let currentSection: string[] | null = null

    for (const line of lines) {
      if (isHeader(line)) {
        if (currentSection) {
          sections.push(currentSection)
        }
        currentSection = [line]
        continue
      }

      if (currentSection) {
        currentSection.push(line)
      }
    }

    if (currentSection) {
      sections.push(currentSection)
    }

    return sections
  }

  /**
   * 根据标题、副标题和内容块推断最终页面类型
   * @param options - 页面构建参数
   * @returns 结构化页面
   */
  private createParsedSlide(options: {
    index: number
    title: string
    subtitle?: string
    blocks: SlideContentBlock[]
    preferTitlePage: boolean
  }): ParsedSlide {
    const { index, title, subtitle, blocks, preferTitlePage } = options

    let type: 'title' | 'section' | 'content' = 'content'
    if (blocks.length === 0) {
      if (subtitle || preferTitlePage) {
        type = 'title'
      } else {
        type = 'section'
      }
    }

    return {
      index,
      type,
      title,
      subtitle,
      blocks
    }
  }

  /**
   * 解析内容块
   * @param lines - Markdown 内容行数组
   * @returns 解析后的内容块数组
   */
  private parseContentBlocks(lines: string[]): SlideContentBlock[] {
    const blocks: SlideContentBlock[] = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      // 跳过空行
      if (!trimmed) {
        i++
        continue
      }

      // 检测列表
      if (this.isUnorderedListItem(trimmed)) {
        const result = this.parseUnorderedList(lines, i)
        blocks.push(result.block)
        i = result.nextIndex
        continue
      }

      if (this.isOrderedListItem(trimmed)) {
        const result = this.parseOrderedList(lines, i)
        blocks.push(result.block)
        i = result.nextIndex
        continue
      }

      // 检测表格
      if (this.isTableRow(trimmed)) {
        const result = this.parseTable(lines, i)
        if (result) {
          blocks.push(result.block)
          i = result.nextIndex
          continue
        }
      }

      // 检测图片
      if (this.isImage(trimmed)) {
        const imageBlock = this.parseImage(trimmed)
        if (imageBlock) {
          blocks.push(imageBlock)
        }
        i++
        continue
      }

      // 检测 H2-H6 标题（作为段落处理）
      if (this.isContentHeader(trimmed)) {
        const headerText = this.extractTitle(trimmed)
        blocks.push({ type: 'paragraph', text: headerText })
        i++
        continue
      }

      // 普通段落：收集连续的非空行
      const paragraphResult = this.parseParagraph(lines, i)
      blocks.push(paragraphResult.block)
      i = paragraphResult.nextIndex
    }

    return blocks
  }

  /**
   * 判断是否为无序列表项
   * @param line - 行内容
   * @returns 是否为无序列表项
   */
  private isUnorderedListItem(line: string): boolean {
    const trimmed = line.trim()
    // 匹配 -, *, + 开头的列表项
    return /^[-*+]\s+.+/.test(trimmed)
  }

  /**
   * 解析无序列表
   * @param lines - 所有行
   * @param startIndex - 开始索引
   * @returns 解析结果
   */
  private parseUnorderedList(
    lines: string[],
    startIndex: number
  ): { block: SlideContentBlock; nextIndex: number } {
    const items: string[] = []
    let i = startIndex

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      // 空行结束列表
      if (!trimmed) {
        i++
        break
      }

      // 检查是否还是无序列表项
      if (this.isUnorderedListItem(trimmed)) {
        // 移除列表标记
        const itemText = this.sanitizeInlineText(trimmed.replace(/^[-*+]\s+/, '').trim())
        items.push(itemText)
        i++
      } else {
        // 不是列表项，结束
        break
      }
    }

    return {
      block: { type: 'list', items, ordered: false },
      nextIndex: i
    }
  }

  /**
   * 判断是否为有序列表项
   * @param line - 行内容
   * @returns 是否为有序列表项
   */
  private isOrderedListItem(line: string): boolean {
    const trimmed = line.trim()
    // 匹配 1. 2. 3. 等格式的列表项
    return /^\d+\.\s+.+/.test(trimmed)
  }

  /**
   * 解析有序列表
   * @param lines - 所有行
   * @param startIndex - 开始索引
   * @returns 解析结果
   */
  private parseOrderedList(
    lines: string[],
    startIndex: number
  ): { block: SlideContentBlock; nextIndex: number } {
    const items: string[] = []
    let i = startIndex

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      // 空行结束列表
      if (!trimmed) {
        i++
        break
      }

      // 检查是否还是有序列表项
      if (this.isOrderedListItem(trimmed)) {
        // 移除数字标记
        const itemText = this.sanitizeInlineText(trimmed.replace(/^\d+\.\s+/, '').trim())
        items.push(itemText)
        i++
      } else {
        // 不是列表项，结束
        break
      }
    }

    return {
      block: { type: 'list', items, ordered: true },
      nextIndex: i
    }
  }

  /**
   * 判断是否为表格行
   * @param line - 行内容
   * @returns 是否为表格行
   */
  private isTableRow(line: string): boolean {
    const trimmed = line.trim()
    // 表格行包含 | 且至少有 3 个单元格（两个分隔符）
    return /^\|.+?\|/.test(trimmed) && trimmed.split('|').filter(s => s.trim()).length >= 2
  }

  /**
   * 解析表格
   * @param lines - 所有行
   * @param startIndex - 开始索引
   * @returns 解析结果，如果不是表格则返回 null
   */
  private parseTable(
    lines: string[],
    startIndex: number
  ): { block: SlideContentBlock; nextIndex: number } | null {
    const tableLines: string[] = []
    let i = startIndex

    // 收集表格行
    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed) {
        i++
        break
      }

      if (!this.isTableRow(trimmed)) {
        break
      }

      tableLines.push(trimmed)
      i++
    }

    // 至少需要表头和分隔行
    if (tableLines.length < 2) {
      return null
    }

    const result = this.parseTableContent(tableLines)

    return {
      block: { type: 'table', headers: result.headers, rows: result.rows },
      nextIndex: i
    }
  }

  /**
   * 将 Markdown 表格转为结构化数据
   * @param lines - 表格行数组
   * @returns 表头和行数据
   */
  private parseTableContent(lines: string[]): { headers: string[]; rows: string[][] } {
    if (lines.length < 2) {
      return { headers: [], rows: [] }
    }

    // 解析表头（第一行）
    const headerLine = lines[0]
    const headers = this.parseTableRow(headerLine)

    // 跳过分隔行（第二行）
    const dataLines = lines.slice(2)

    // 解析数据行
    const rows = dataLines.map(line => this.parseTableRow(line))

    return { headers, rows }
  }

  /**
   * 解析单行表格内容
   * @param line - 表格行
   * @returns 单元格数组
   */
  private parseTableRow(line: string): string[] {
    // 移除首尾的 |
    let trimmed = line.trim()
    if (trimmed.startsWith('|')) {
      trimmed = trimmed.slice(1)
    }
    if (trimmed.endsWith('|')) {
      trimmed = trimmed.slice(0, -1)
    }

    // 按 | 分割并去除空白
    return trimmed.split('|').map(cell => this.sanitizeInlineText(cell.trim()))
  }

  /**
   * 判断是否为图片
   * @param line - 行内容
   * @returns 是否为图片
   */
  private isImage(line: string): boolean {
    const trimmed = line.trim()
    // 匹配 ![alt](url) 格式
    return /^!\[.+?\]\(.+?\)/.test(trimmed)
  }

  /**
   * 解析图片
   * @param line - 图片行
   * @returns 图片块或 null
   */
  private parseImage(line: string): SlideContentBlock | null {
    const trimmed = line.trim()
    const match = trimmed.match(/^!\[(.+?)\]\((.+?)\)/)

    if (match) {
      return {
        type: 'image',
        alt: this.sanitizeInlineText(match[1]),
        url: match[2]
      }
    }

    return null
  }

  /**
   * 判断是否为子标题（H3-H6）
   * @param line - 行内容
   * @returns 是否为子标题
   */
  private isSubHeader(line: string): boolean {
    const trimmed = line.trim()
    return /^#{3,6}\s+.+/.test(trimmed)
  }

  /**
   * 判断是否为内容区域标题（H2-H6）
   * @param line - 行内容
   * @returns 是否为内容区域标题
   */
  private isContentHeader(line: string): boolean {
    return this.isH2Header(line) || this.isSubHeader(line)
  }

  /**
   * 解析段落
   * @param lines - 所有行
   * @param startIndex - 开始索引
   * @returns 解析结果
   */
  private parseParagraph(
    lines: string[],
    startIndex: number
  ): { block: SlideContentBlock; nextIndex: number } {
    const paragraphLines: string[] = []
    let i = startIndex

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      // 空行结束段落
      if (!trimmed) {
        i++
        break
      }

      // 遇到列表、表格、图片等特殊内容，结束段落
      if (
        this.isUnorderedListItem(trimmed) ||
        this.isOrderedListItem(trimmed) ||
        this.isTableRow(trimmed) ||
        this.isImage(trimmed) ||
        this.isContentHeader(trimmed)
      ) {
        break
      }

      // 跳过 H1（这些应该在幻灯片级别处理）
      if (this.isH1Header(line)) {
        break
      }

      // 收集段落文本
      paragraphLines.push(trimmed)
      i++
    }

    // 合并段落行
    const text = this.sanitizeInlineText(paragraphLines.join(' '))

    return {
      block: { type: 'paragraph', text },
      nextIndex: i
    }
  }
}
