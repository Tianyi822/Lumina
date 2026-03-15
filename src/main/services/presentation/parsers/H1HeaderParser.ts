import type { ParsedSlide } from '@shared/types/ppt-export'
import type { BlockParserLike, ParseStrategy, PptParseContext } from './types'

/**
 * H1 标题解析策略
 */
export class H1HeaderParser implements ParseStrategy {
  /**
   * 判断是否存在 H1 结构
   * @param context - 解析上下文
   * @returns 是否可处理
   */
  canHandle(context: PptParseContext): boolean {
    return context.metrics.h1Count > 0
  }

  /**
   * 处理所有 H1 场景
   * @param context - 解析上下文
   * @returns 幻灯片数组
   */
  parse(context: PptParseContext): ParsedSlide[] {
    if (context.metrics.h1Count === 1 && context.metrics.h2Count > 1) {
      const slides = this.parseSingleH1WithH2(context.lines, context.blockParser)
      if (slides.length > 1) {
        return slides
      }
    }

    return this.parseWithH1(context.lines, context.blockParser)
  }

  /**
   * 无 H1 文档的降级处理
   * @param lines - 原始行数组
   * @param blockParser - 内容块解析器
   * @returns 幻灯片数组
   */
  parseWithoutH1(lines: string[], blockParser: BlockParserLike): ParsedSlide[] {
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
        title = blockParser.sanitizeInlineText(firstLine)
        contentLines = nonEmptyLines.slice(1)
      }
    }

    const blocks = blockParser.parseContentBlocks(contentLines)
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
   * @param lines - 原始行数组
   * @param blockParser - 内容块解析器
   * @returns 幻灯片数组
   */
  private parseWithH1(lines: string[], blockParser: BlockParserLike): ParsedSlide[] {
    const slides: ParsedSlide[] = []
    let leadingLines: string[] = []
    let currentSlideLines: string[] | null = null

    for (const line of lines) {
      if (blockParser.isH1Header(line)) {
        if (currentSlideLines) {
          const slide = blockParser.parseSlide(currentSlideLines, slides.length)
          if (slide) {
            slides.push(slide)
          }
        } else if (leadingLines.some((item) => item.trim().length > 0)) {
          slides.push(...this.reindexSlides(this.parseWithoutH1(leadingLines, blockParser), slides.length))
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
      const slide = blockParser.parseSlide(currentSlideLines, slides.length)
      if (slide) {
        slides.push(slide)
      }
    } else if (leadingLines.some((item) => item.trim().length > 0)) {
      slides.push(...this.reindexSlides(this.parseWithoutH1(leadingLines, blockParser), slides.length))
    }

    return slides
  }

  /**
   * 解析“单个 H1 + 多个 H2”的草稿
   * @param lines - 原始行数组
   * @param blockParser - 内容块解析器
   * @returns 幻灯片数组
   */
  private parseSingleH1WithH2(lines: string[], blockParser: BlockParserLike): ParsedSlide[] {
    const h1Index = lines.findIndex((line) => blockParser.isH1Header(line))
    if (h1Index === -1) {
      return []
    }

    const title = blockParser.extractTitle(lines[h1Index])
    if (!title) {
      return []
    }

    const leadingLines = lines.slice(0, h1Index)
    const remainingLines = lines.slice(h1Index + 1)
    const firstH2Index = remainingLines.findIndex((line) => blockParser.isH2Header(line))
    if (firstH2Index === -1) {
      return []
    }

    const slides: ParsedSlide[] = []
    if (leadingLines.some((line) => line.trim().length > 0)) {
      slides.push(...this.reindexSlides(this.parseWithoutH1(leadingLines, blockParser), slides.length))
    }

    slides.push(
      blockParser.createParsedSlide({
        index: slides.length,
        title,
        blocks: blockParser.parseContentBlocks(remainingLines.slice(0, firstH2Index)),
        preferTitlePage: true
      })
    )

    for (const section of blockParser.splitByHeading(remainingLines, (line) => blockParser.isH2Header(line))) {
      const slide = blockParser.parseSlideByHeading(section, slides.length)
      if (slide) {
        slides.push(slide)
      }
    }

    return slides
  }

  /**
   * 重新编号页面索引
   * @param slides - 原始页面
   * @param startIndex - 起始索引
   * @returns 重新编号后的页面
   */
  private reindexSlides(slides: ParsedSlide[], startIndex: number): ParsedSlide[] {
    return slides.map((slide, index) => ({
      ...slide,
      index: startIndex + index
    }))
  }
}
