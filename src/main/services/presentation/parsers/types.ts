import type { ParsedSlide, SlideContentBlock } from '@shared/types/ppt-export'

/**
 * 导出预览的内容类型
 */
export type ExportContentType = 'title' | 'content' | 'table' | 'list' | 'mixed'

/**
 * 解析选项
 */
export interface PptParseOptions {
  /** 期望的页面数量（通常来自模板） */
  expectedSlideCount?: number
}

/**
 * 解析前统计出的标题信息
 */
export interface ParserMetrics {
  h1Count: number
  h2Count: number
}

/**
 * 页面构建参数
 */
export interface ParsedSlideFactoryOptions {
  index: number
  title: string
  subtitle?: string
  blocks: SlideContentBlock[]
  preferTitlePage: boolean
}

/**
 * 内容块解析器能力
 */
export interface BlockParserLike {
  sanitizeInlineText(text: string): string
  isH1Header(line: string): boolean
  isH2Header(line: string): boolean
  isHorizontalRule(line: string): boolean
  isContentHeader(line: string): boolean
  extractTitle(line: string): string
  extractH2Title(line: string): string
  parseSlide(lines: string[], index: number): ParsedSlide | null
  parseSlideByHeading(lines: string[], index: number): ParsedSlide | null
  parseContentBlocks(lines: string[]): SlideContentBlock[]
  splitByHeading(lines: string[], isHeader: (line: string) => boolean): string[][]
  createParsedSlide(options: ParsedSlideFactoryOptions): ParsedSlide
  detectContentType(slide: ParsedSlide): ExportContentType
  generateSummary(slide: ParsedSlide): string
}

/**
 * 解析上下文
 */
export interface PptParseContext {
  lines: string[]
  options: PptParseOptions
  metrics: ParserMetrics
  blockParser: BlockParserLike
}

/**
 * 解析策略接口
 */
export interface ParseStrategy {
  canHandle(context: PptParseContext): boolean
  parse(context: PptParseContext): ParsedSlide[]
}

/**
 * 页码规划节
 */
export interface PagePlanSection {
  startPage: number
  endPage: number
  title: string
  lines: string[]
}

/**
 * 页码规划内容单元
 */
export type PagePlanContentUnit =
  | { kind: 'text'; text: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }
