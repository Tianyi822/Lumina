// 重导出原始公开 API（仅 12 个函数，与拆分前保持一致）

// patterns.ts — 片段类型检测函数
export {
  isPaperPersonClusterText,
  isPaperContactLikeSegment,
  isPaperAffiliationLikeSegment,
  isPaperAuthorLikeSegment,
  isPaperReferenceLikeSegment,
  normalizePaperTranslationText
} from './patterns.ts'

// helpers.ts — 辅助工具函数
export {
  stripPaperTranslationMarkdown,
  hasPaperTranslationResult,
  buildFigureCaptionTranslationMap
} from './helpers.ts'

// toc.ts — TOC 大纲构建
export { slugifyPaperHeadingText, buildPaperTocOutline } from './toc.ts'

// segments.ts — 翻译分段
export { parsePaperTranslationSegments } from './segments.ts'
