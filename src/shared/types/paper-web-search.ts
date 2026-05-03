/** 模型可见的工具参数 */
export interface PaperWebSearchCallArgs {
  query: string
  reason: string
  target?: 'paper' | 'method' | 'dataset' | 'tool' | 'citation' | 'recent_progress'
  recency?: 'any' | 'recent'
}

/** 系统自动注入的论文上下文 */
export interface PaperWebSearchContext {
  paperId: string
  fileName: string
  paperTitle?: string
  paperAuthors?: string[]
  paperKeywords?: string[]
  selectedQuote?: string
  selectedQuoteContext?: string
  userQuestion: string
  referenceHints?: string[]
}

/** Python 运行时类型 */
export type PaperWebSearchRuntime = 'uv' | 'conda' | 'python'

/** Python 依赖模式 */
export type PaperWebSearchDependencyMode = 'isolated' | 'system' | 'stdlib'

/** Python 环境检测结果 */
export interface PaperWebSearchEnvironmentInfo {
  available: boolean
  runtime?: PaperWebSearchRuntime
  executable?: string
  version?: string
  dependencyMode?: PaperWebSearchDependencyMode
  missingPackages?: string[]
  error?: string
}

/** 单条搜索结果 */
export interface PaperWebSearchResultItem {
  title: string
  url: string
  source: string
  publishedDate?: string
  summary?: string
  snippet: string
  relevanceScore: number
}

/** 搜索结果质量 */
export type PaperWebSearchQuality = 'high' | 'medium' | 'low' | 'empty'

/** 搜索输出结果 */
export interface PaperWebSearchOutput {
  success: boolean
  query: string
  quality: PaperWebSearchQuality
  results: PaperWebSearchResultItem[]
  totalDiscovered: number
  totalCrawled: number
  totalRetained: number
  elapsedMs: number
  warnings?: string[]
  error?: string
}

/** 搜索工具输入（含论文上下文，由系统注入） */
export interface PaperWebSearchToolInput {
  query: string
  reason: string
  target?: string
  recency?: string
  paperContext: PaperWebSearchContext
}
