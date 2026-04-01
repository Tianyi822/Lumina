import type { ParsedSlide } from '@shared/types/ppt-export'
import { BlockParser } from './BlockParser'
import { H1HeaderParser } from './H1HeaderParser'
import { H2HeaderParser } from './H2HeaderParser'
import { PagePlanParser } from './PagePlanParser'
import type { ParseStrategy, ParserMetrics, PptParseOptions } from './types'

/**
 * PPT 内容解析器
 * 负责策略选择与幻灯片数据生成
 */
export class PptContentParser {
  private readonly blockParser = new BlockParser()
  private readonly h1HeaderParser = new H1HeaderParser()
  private readonly strategies: ParseStrategy[] = [
    new PagePlanParser(),
    this.h1HeaderParser,
    new H2HeaderParser()
  ]

  /**
   * 解析 Markdown 为幻灯片数组
   * @param content - Markdown 内容
   * @param options - 解析选项
   * @returns 幻灯片数组
   */
  parse(content: string, options: PptParseOptions = {}): ParsedSlide[] {
    const normalizedContent = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
    if (!normalizedContent) {
      return []
    }

    const lines = normalizedContent.split('\n')
    const metrics = this.collectMetrics(lines)
    const context = {
      lines,
      options,
      metrics,
      blockParser: this.blockParser
    }

    for (const strategy of this.strategies) {
      if (!strategy.canHandle(context)) {
        continue
      }

      const slides = strategy.parse(context)
      if (slides.length > 0) {
        return slides
      }
    }

    return this.h1HeaderParser.parseWithoutH1(lines, this.blockParser)
  }

  /**
   * 统计标题信息
   * @param lines - 原始行数组
   * @returns 标题统计
   */
  private collectMetrics(lines: string[]): ParserMetrics {
    return {
      h1Count: lines.filter((line) => this.blockParser.isH1Header(line)).length,
      h2Count: lines.filter((line) => this.blockParser.isH2Header(line)).length
    }
  }
}
