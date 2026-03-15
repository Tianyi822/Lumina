import type { ParsedSlide } from '@shared/types/ppt-export'
import type { BlockParserLike, ParseStrategy, PptParseContext } from './types'

/**
 * H2 标题与横线分隔解析策略
 */
export class H2HeaderParser implements ParseStrategy {
  /**
   * 判断是否适合使用 H2 或横线分隔
   * @param context - 解析上下文
   * @returns 是否可处理
   */
  canHandle(context: PptParseContext): boolean {
    return context.metrics.h2Count > 1 || context.lines.some((line) => context.blockParser.isHorizontalRule(line))
  }

  /**
   * 依次尝试 H2 与横线分隔解析
   * @param context - 解析上下文
   * @returns 幻灯片数组
   */
  parse(context: PptParseContext): ParsedSlide[] {
    if (context.metrics.h2Count > 1) {
      const slides = this.parseWithH2(context.lines, context.blockParser)
      if (slides.length > 0) {
        return slides
      }
    }

    const separatedSlides = this.parseWithHorizontalRules(context.lines, context.blockParser)
    return separatedSlides.length > 1 ? separatedSlides : []
  }

  /**
   * 按 H2 标题拆分幻灯片
   * @param lines - 原始行数组
   * @param blockParser - 内容块解析器
   * @returns 幻灯片数组
   */
  private parseWithH2(lines: string[], blockParser: BlockParserLike): ParsedSlide[] {
    const slides: ParsedSlide[] = []
    const sections = blockParser.splitByHeading(lines, (line) => blockParser.isH2Header(line))
    const firstH2Index = lines.findIndex((line) => blockParser.isH2Header(line))

    if (firstH2Index > 0) {
      const prefixLines = lines.slice(0, firstH2Index)
      if (prefixLines.some((line) => line.trim().length > 0)) {
        slides.push(...this.parseWithoutH1(prefixLines, blockParser, slides.length))
      }
    }

    for (const section of sections) {
      const slide = blockParser.parseSlideByHeading(section, slides.length)
      if (slide) {
        slides.push(slide)
      }
    }

    return slides
  }

  /**
   * 按 Markdown 横线分隔幻灯片
   * @param lines - 原始行数组
   * @param blockParser - 内容块解析器
   * @returns 幻灯片数组
   */
  private parseWithHorizontalRules(lines: string[], blockParser: BlockParserLike): ParsedSlide[] {
    const sections: string[][] = []
    let currentSection: string[] = []

    for (const line of lines) {
      if (blockParser.isHorizontalRule(line)) {
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

    return sections.flatMap((section, sectionIndex) => {
      return this.parseWithoutH1(section, blockParser, sectionIndex)
    })
  }

  private parseWithoutH1(
    lines: string[],
    blockParser: BlockParserLike,
    startIndex: number
  ): ParsedSlide[] {
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length === 0) {
      return []
    }

    let title = '未命名文档'
    let contentLines = nonEmptyLines
    const firstLine = nonEmptyLines[0]?.trim()

    if (firstLine) {
      if (blockParser.isContentHeader(firstLine)) {
        title = blockParser.extractTitle(firstLine)
        contentLines = nonEmptyLines.slice(1)
      } else if (firstLine.length < 50) {
        title = blockParser.extractTitle(firstLine)
        contentLines = nonEmptyLines.slice(1)
      }
    }

    const blocks = blockParser.parseContentBlocks(contentLines)
    return [
      {
        index: startIndex,
        type: blocks.length === 0 ? 'title' : 'content',
        title,
        blocks
      }
    ]
  }
}
