// 重导出原始公开 API（与原拆分前的 12 个函数保持一致的签名）

// patterns.ts — 论文翻译文本的片段类型检测函数
export {
  isPaperPersonClusterText,
  isPaperContactLikeSegment,
  isPaperAffiliationLikeSegment,
  isPaperAuthorLikeSegment,
  isPaperReferenceLikeSegment,
  normalizePaperTranslationText
} from './patterns.ts'

// helpers.ts — 翻译辅助工具函数
export {
  stripPaperTranslationMarkdown,
  hasPaperTranslationResult,
  buildFigureCaptionTranslationMap
} from './helpers.ts'

// toc.ts — 目录大纲构建
export { slugifyPaperHeadingText, buildPaperTocOutline } from './toc.ts'

// segments.ts — 翻译文本分段解析
export { parsePaperTranslationSegments } from './segments.ts'
