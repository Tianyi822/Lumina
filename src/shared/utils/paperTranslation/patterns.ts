import type { PaperTranslationSegment } from '../../types/paper'

// ─── 正则常量 ───

const PERSON_NAME_CHUNK_PATTERN =
  /(?:[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3})(?:\s+[0-9¹²³⁴⁵⁶⁷⁸⁹⁰]+(?:,[0-9¹²³⁴⁵⁶⁷⁸⁹⁰]+)*[*†‡]*)*/g
const AFFILIATION_KEYWORD_PATTERN =
  /\b(?:university|institute|school|college|laboratory|department|academy|center|centre|ministry|faculty|hospital|research\s+center|engineering\s+research|research\s+institute|company|technology|technologies)\b|(?:大学|学院|研究所|实验室|中心|系|院|部|国家|中国|公司)/gi
const AFFILIATION_KEYWORD_TEST_PATTERN =
  /\b(?:university|institute|school|college|laboratory|department|academy|center|centre|ministry|faculty|hospital|research\s+center|engineering\s+research|research\s+institute|company|technology|technologies)\b|(?:大学|学院|研究所|实验室|中心|系|院|部|国家|中国|公司)/i
const REFERENCE_AUTHOR_TOKEN_PATTERN =
  /(?:^|[;,(]\s*|\s+)(?:[A-Z][A-Za-z'`-]+,\s*(?:[A-Z]\.\s*){1,4})/g
const REFERENCE_PUBLICATION_KEYWORD_PATTERN =
  /\b(?:arxiv|doi|journal|transactions|conference|proceedings|proc\.|symposium|workshop|letters|press|springer|elsevier|wiley|acm|ieee|cvpr|iccv|eccv|aaai|neurips|icml|iclr|pattern\s+analysis|machine\s+intelligence|vol\.|no\.|pp\.|pages)\b|(?:会议|期刊|学报|出版社|卷|页)/i
const REFERENCE_HEADING_PATTERN = /^(?:references?|bibliography|参考文献|文献)\s*[：:\s]*$/i
const REFERENCE_MARKER_PATTERN = /^\s*(?:\[\d+\]|\[\[\d+\]\]|\d+\.)\s+/

const HEADING_PREFIX_PATTERN = /^(#{1,6})\s+(.+?)\s*$/
export const HEADING_NUMBERING_PATTERN = /^(\d+(?:\.\d+)*)(?:\.)?(?:\s+|$)/
export const APPENDIX_EXPLICIT_HEADING_PATTERN =
  /^(?:appendix|附录)\s*([A-Z])(?:\.(\d+(?:\.\d+)*))?(?:[\s:：.-]+|$)/i
export const APPENDIX_DOTTED_HEADING_PATTERN = /^([A-Z])\.(\d+(?:\.\d+)*)(?:\.)?(?:\s+|$)/i
export const APPENDIX_ROOT_HEADING_PATTERN = /^([A-Z])\s+\S.+$/
const ABSTRACT_PARAGRAPH_PATTERN = /^(abstract|摘要)\s*(?:[:：.。]\s*|\s+|$)/i
const KEYWORD_SECTION_PATTERN = /^(?:keywords?|index terms)\s*[:：.。]|^关键词\s*[:：.。]/i
const PAGE_COMMENT_PATTERN = /^\s*<!--\s*Page\s+\d+\s*-->\s*$/i

const STRUCTURAL_SECTION_TITLES = new Set([
  'abstract',
  '摘要',
  'introduction',
  '引言',
  'related work',
  '相关工作',
  'method',
  'methods',
  '方法',
  'experiment',
  'experiments',
  '实验',
  'conclusion',
  'conclusions',
  '结论',
  'references',
  'bibliography',
  '参考文献',
  'appendix',
  'appendices',
  '附录',
  'acknowledgment',
  'acknowledgments',
  'acknowledgements',
  'ethics statement',
  'reproducibility statement',
  'llm usage',
  '致谢'
])

const BACK_MATTER_SECTION_TITLES = new Set([
  'references',
  'bibliography',
  '参考文献',
  '文献',
  'appendix',
  'appendices',
  '附录',
  'acknowledgment',
  'acknowledgments',
  'acknowledgements',
  'ethics statement',
  'reproducibility statement',
  'llm usage',
  '致谢'
])

// ─── 标题文本归一化 ───

export function normalizePaperHeadingText(text: string): string {
  return text
    .replace(/\s+#+\s*$/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePaperSectionTitleForMatch(text: string): string {
  return normalizePaperHeadingText(text)
    .replace(HEADING_NUMBERING_PATTERN, '')
    .replace(/^[\s:：.。-]+/, '')
    .replace(/[\s:：.。-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// ─── 片段类型检测 ───

export function isPaperStructuralSectionTitle(titleText: string): boolean {
  return STRUCTURAL_SECTION_TITLES.has(normalizePaperSectionTitleForMatch(titleText))
}

export function isPaperBackMatterSectionTitle(titleText: string): boolean {
  return BACK_MATTER_SECTION_TITLES.has(normalizePaperSectionTitleForMatch(titleText))
}

export function isPaperAppendixSectionTitle(titleText: string): boolean {
  return ['appendix', 'appendices', '附录'].includes(normalizePaperSectionTitleForMatch(titleText))
}

function isPaperPersonClusterText(text: string): boolean {
  const matches = text.match(PERSON_NAME_CHUNK_PATTERN) ?? []
  if (matches.length < 2) {
    return false
  }

  const remainder = text
    .replace(PERSON_NAME_CHUNK_PATTERN, '')
    .replace(/\b(?:and|et)\b/gi, '')
    .replace(/[,\s*†‡()[\].-]+/g, '')

  return remainder.length === 0
}

export function isPaperContactLikeSegment(
  segment: Pick<PaperTranslationSegment, 'originalText'>
): boolean {
  const text = normalizePaperTranslationText(segment.originalText)
  if (!text) {
    return false
  }

  if (
    /\bORCID\b/i.test(text) ||
    /correspond(?:ing)?\s+author/i.test(text) ||
    /通讯作者|共同一作|equal contribution/i.test(text)
  ) {
    return true
  }

  const emailMatches = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []
  if (emailMatches.length === 0) {
    return false
  }

  const stripped = text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '')
    .replace(/[{}\s,;|/\\]+/g, '')

  return stripped.length <= 48 && !AFFILIATION_KEYWORD_TEST_PATTERN.test(text)
}

export function isPaperAffiliationLikeSegment(
  segment: Pick<PaperTranslationSegment, 'originalText'>
): boolean {
  const text = normalizePaperTranslationText(segment.originalText)
  if (!text) {
    return false
  }

  const keywordMatches = text.match(AFFILIATION_KEYWORD_PATTERN) ?? []
  if (keywordMatches.length === 0) {
    return false
  }

  const startsWithAffiliationMarker =
    /^(?:\(?[0-9¹²³⁴⁵⁶⁷⁸⁹⁰]+(?:,[0-9¹²³⁴⁵⁶⁷⁸⁹⁰]+)*\)?|[*†‡]+\s*[0-9¹²³⁴⁵⁶⁷⁸⁹⁰]*)\s*/.test(text)
  const commaCount = (text.match(/[，,]/g) ?? []).length
  const hasSentenceTerminator = /[.!?。？！]\s*$/.test(text)
  const hasMultipleInstitutionKeywords = keywordMatches.length >= 2
  const hasLocationCue =
    /\b(?:china|beijing|shanghai|tianjin|province|city|road|street)\b/i.test(text) ||
    /(?:中国|北京|上海|天津|省|市|路|街)/.test(text)

  return (
    startsWithAffiliationMarker ||
    (hasMultipleInstitutionKeywords && !hasSentenceTerminator) ||
    (commaCount >= 2 && !hasSentenceTerminator) ||
    (hasLocationCue && !hasSentenceTerminator)
  )
}

export function isPaperAuthorLikeSegment(
  segment: Pick<PaperTranslationSegment, 'kind' | 'originalText'>
): boolean {
  if (segment.kind === 'code') {
    return false
  }

  const text = normalizePaperTranslationText(segment.originalText)
  if (!text) {
    return false
  }

  if (/^[0-9¹²³⁴⁵⁶⁷⁸⁹⁰]+(?:\s*,\s*[0-9¹²³⁴⁵⁶⁷⁸⁹⁰]+)*$/.test(text)) {
    return true
  }

  if (/^\*+\s*[A-Za-z]/.test(text)) {
    return true
  }

  return isPaperPersonClusterText(text)
}

export function isPaperReferenceLikeSegment(
  segment: Pick<PaperTranslationSegment, 'kind' | 'originalMarkdown' | 'originalText'>
): boolean {
  const text = normalizePaperTranslationText(segment.originalText)
  if (!text) {
    return false
  }

  if (REFERENCE_HEADING_PATTERN.test(text)) {
    return true
  }

  const hasReferenceMarker = REFERENCE_MARKER_PATTERN.test(segment.originalMarkdown)
  const hasYear = /\b(?:19|20)\d{2}\b/.test(text)
  const hasPublicationKeyword = REFERENCE_PUBLICATION_KEYWORD_PATTERN.test(text)
  const authorMatches = text.match(REFERENCE_AUTHOR_TOKEN_PATTERN) ?? []
  const hasAuthorCluster = authorMatches.length >= 2

  if (hasReferenceMarker && (hasAuthorCluster || hasYear || hasPublicationKeyword)) {
    return true
  }

  return hasAuthorCluster && hasYear && hasPublicationKeyword
}

export function isPaperKeywordLikeSegment(
  segment: Pick<PaperTranslationSegment, 'originalText'>
): boolean {
  return KEYWORD_SECTION_PATTERN.test(normalizePaperTranslationText(segment.originalText))
}

export function isPaperPageCommentSegment(
  segment: Pick<PaperTranslationSegment, 'originalMarkdown'>
): boolean {
  return PAGE_COMMENT_PATTERN.test(segment.originalMarkdown)
}

export function looksLikePaperTitleText(titleText: string): boolean {
  const normalizedText = normalizePaperHeadingText(titleText)
  const wordCount = normalizedText.split(/\s+/).filter(Boolean).length
  const englishWordCount = (normalizedText.match(/[A-Za-z][A-Za-z-]*/g) ?? []).length
  const cjkCharCount = (normalizedText.match(/[\u4e00-\u9fff]/g) ?? []).length

  return (
    /[:：]/.test(normalizedText) ||
    normalizedText.length >= 36 ||
    wordCount >= 6 ||
    englishWordCount >= 5 ||
    cjkCharCount >= 12
  )
}

export function extractParagraphAbstractTitle(text: string): string | undefined {
  const normalizedText = normalizePaperTranslationText(text)
  if (!normalizedText) {
    return undefined
  }

  const match = normalizedText.match(ABSTRACT_PARAGRAPH_PATTERN)
  if (!match) {
    return undefined
  }

  return /摘要/.test(match[1]) ? '摘要' : 'Abstract'
}

// ─── 标题解析 ───

export interface ParsedPaperHeading {
  markdownLevel: number
  titleText: string
}

export function parsePaperHeading(markdown: string): ParsedPaperHeading | null {
  const firstMeaningfulLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstMeaningfulLine) {
    return null
  }

  const match = firstMeaningfulLine.match(HEADING_PREFIX_PATTERN)
  if (!match) {
    return null
  }

  const titleText = normalizePaperHeadingText(match[2])
  if (!titleText) {
    return null
  }

  return {
    markdownLevel: match[1].length,
    titleText
  }
}

// ─── 辅助：文本归一化 ───

export function normalizePaperTranslationText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}
