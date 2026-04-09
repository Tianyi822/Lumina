import type {
  PaperTranslationCache,
  PaperTranslationSegment,
  PaperTranslationSegmentKind
} from '../types/paper'

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

function isImageOnlyBlock(block: string): boolean {
  const trimmed = block.trim()
  if (!trimmed) {
    return false
  }

  const withoutMarkdownImages = trimmed.replace(/!\[[^\]]*]\([^)]+\)/g, '').trim()
  if (!withoutMarkdownImages) {
    return true
  }

  if (!/<img\b/i.test(trimmed)) {
    return false
  }

  const withoutImgTags = trimmed
    .replace(/<img\b[^>]*\/?>/gi, '')
    .replace(/<\/?(?:div|p|span|figure|a)\b[^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .trim()

  return withoutImgTags.length === 0
}

function detectPaperTranslationSegmentKind(block: string): PaperTranslationSegmentKind {
  if (/^#{1,6}\s/.test(block)) {
    return 'heading'
  }

  if (isImageOnlyBlock(block)) {
    return 'image'
  }

  if (/^```[\s\S]*```$/m.test(block) || /^ {4,}\S/m.test(block)) {
    return 'code'
  }

  if (/^\s{0,3}>\s/m.test(block)) {
    return 'quote'
  }

  if (/^\s*(?:[-*+]|\d+\.)\s/m.test(block)) {
    return 'list'
  }

  if (/\|/.test(block) && /\n\s*\|?[\s:-]+(?:\|[\s:-]+)+\|?\s*(?:\n|$)/.test(block)) {
    return 'table'
  }

  return 'paragraph'
}

export function normalizePaperTranslationText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function stripPaperTranslationMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hasPaperTranslationResult(
  cache: PaperTranslationCache | null | undefined
): boolean {
  if (!cache || cache.entries.length === 0) {
    return false
  }

  return cache.entries.some((entry) => {
    if (entry.status === 'completed') {
      return !!entry.translatedMarkdown?.trim()
    }

    return entry.status === 'failed' || entry.status === 'translating'
  })
}

export function isPaperPersonClusterText(text: string): boolean {
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

export function parsePaperTranslationSegments(markdown: string): PaperTranslationSegment[] {
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalizedMarkdown) {
    return []
  }

  const blocks = normalizedMarkdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block, index) => ({
    id: `seg-${index}`,
    index,
    kind: detectPaperTranslationSegmentKind(block),
    originalMarkdown: block,
    originalText: stripPaperTranslationMarkdown(block)
  }))
}
