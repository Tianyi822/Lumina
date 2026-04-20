import type {
  PaperTranslationCache,
  PaperTocEntry,
  PaperTocItem,
  PaperTocOutline,
  PaperTranslationEntry,
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
const HEADING_PREFIX_PATTERN = /^(#{1,6})\s+(.+?)\s*$/
const HEADING_NUMBERING_PATTERN = /^(\d+(?:\.\d+)*)(?:\.)?(?:\s+|$)/
const ABSTRACT_PARAGRAPH_PATTERN = /^(abstract|摘要)\s*(?:[:：.。]\s*|\s+|$)/i
const KEYWORD_SECTION_PATTERN = /^(?:keywords?|index terms)\s*[:：.。]|^关键词\s*[:：.。]/i
const PAGE_COMMENT_PATTERN = /^\s*<!--\s*Page\s+\d+\s*-->\s*$/i
const FENCE_OPEN_PATTERN = /^ {0,3}(`{3,}|~{3,})/
const FIGURE_CAPTION_TRANSLATION_ID_PREFIX = 'fig-caption-'
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
  'acknowledgements',
  '致谢'
])

interface ParsedPaperHeading {
  markdownLevel: number
  titleText: string
}

interface MarkdownFence {
  marker: '`' | '~'
  length: number
}

interface PaperTocCandidate {
  segmentId: string
  segmentIndex: number
  text: string
  translatedText?: string
  markdownLevel: number
  isSynthetic: boolean
}

function parseMarkdownFenceOpener(line: string): MarkdownFence | null {
  const match = line.match(FENCE_OPEN_PATTERN)
  if (!match) {
    return null
  }

  const sequence = match[1]
  return {
    marker: sequence[0] as MarkdownFence['marker'],
    length: sequence.length
  }
}

function isMarkdownFenceCloser(line: string, fence: MarkdownFence): boolean {
  const leadingSpaceLength = line.match(/^ */)?.[0].length ?? 0
  if (leadingSpaceLength > 3) {
    return false
  }

  const trimmed = line.trim()
  if (trimmed.length < fence.length) {
    return false
  }

  for (const char of trimmed) {
    if (char !== fence.marker) {
      return false
    }
  }

  return true
}

function isFencedCodeBlock(block: string): boolean {
  const firstLine = block.replace(/\r\n/g, '\n').trim().split('\n')[0] || ''
  return !!parseMarkdownFenceOpener(firstLine)
}

function splitPaperMarkdownBlocks(markdown: string): string[] {
  const blocks: string[] = []
  const lines = markdown.replace(/\r\n/g, '\n').trim().split('\n')
  let buffer: string[] = []
  let activeFence: MarkdownFence | null = null

  const flushBuffer = (): void => {
    const block = buffer.join('\n').trim()
    if (block) {
      blocks.push(block)
    }
    buffer = []
  }

  for (const line of lines) {
    if (activeFence) {
      buffer.push(line)
      if (isMarkdownFenceCloser(line, activeFence)) {
        activeFence = null
        flushBuffer()
      }
      continue
    }

    const fence = parseMarkdownFenceOpener(line)
    if (fence) {
      flushBuffer()
      buffer.push(line)
      activeFence = fence
      continue
    }

    if (!line.trim()) {
      flushBuffer()
      continue
    }

    buffer.push(line)
  }

  flushBuffer()
  return blocks
}

function extractFencedCodeText(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').trim().split('\n')
  const fence = parseMarkdownFenceOpener(lines[0] || '')
  if (!fence) {
    return markdown.replace(/^ {4}/gm, '').replace(/\s+$/g, '')
  }

  let closeIndex = lines.length
  for (let index = 1; index < lines.length; index += 1) {
    if (isMarkdownFenceCloser(lines[index], fence)) {
      closeIndex = index
      break
    }
  }

  return lines.slice(1, closeIndex).join('\n')
}

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

/**
 * 检测块是否为表格（含标准分隔行表格、纯管道行表格、HTML 表格）
 */
function isTableLikeBlock(block: string): boolean {
  // HTML 表格
  if (/<table[\s>]/i.test(block)) {
    return true
  }

  if (!/\|/.test(block)) {
    return false
  }

  // 含标准分隔行的管道表格（原有逻辑）
  if (/\n\s*\|?[\s:-]+(?:\|[\s:-]+)+\|?\s*(?:\n|$)/.test(block)) {
    return true
  }

  // 无分隔行但多行为管道行的表格（因空行拆分后残留的数据行等场景）
  const lines = block.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length < 2) {
    return false
  }

  const pipeRows = lines.filter((line) => /^\s*\|.+\|\s*$/.test(line))
  return pipeRows.length >= Math.ceil(lines.length * 0.5)
}

function detectPaperTranslationSegmentKind(block: string): PaperTranslationSegmentKind {
  if (isFencedCodeBlock(block) || /^ {4,}\S/m.test(block)) {
    return 'code'
  }

  if (/^#{1,6}\s/.test(block)) {
    return 'heading'
  }

  if (isImageOnlyBlock(block)) {
    return 'image'
  }

  if (/^\s{0,3}>\s/m.test(block)) {
    return 'quote'
  }

  if (/^\s*(?:[-*+]|\d+\.)\s/m.test(block)) {
    return 'list'
  }

  if (isTableLikeBlock(block)) {
    return 'table'
  }

  return 'paragraph'
}

function normalizePaperHeadingText(text: string): string {
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

function clampPaperTocLevel(level: number): PaperTocItem['level'] {
  if (level <= 1) {
    return 1
  }

  if (level === 2) {
    return 2
  }

  return 3
}

function parsePaperHeading(markdown: string): ParsedPaperHeading | null {
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

function extractParagraphAbstractTitle(text: string): string | undefined {
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

function extractTranslatedHeadingText(
  entry: PaperTranslationEntry | undefined
): string | undefined {
  if (!entry || entry.status !== 'completed') {
    return undefined
  }

  const translatedHeading = entry.translatedMarkdown
    ? parsePaperHeading(entry.translatedMarkdown)
    : null

  if (translatedHeading?.titleText) {
    return translatedHeading.titleText
  }

  const fallbackText = entry.translatedText ? normalizePaperHeadingText(entry.translatedText) : ''
  return fallbackText || undefined
}

function extractTranslatedAbstractTitle(
  entry: PaperTranslationEntry | undefined
): string | undefined {
  if (!entry || entry.status !== 'completed') {
    return undefined
  }

  const translatedMarkdownText = entry.translatedMarkdown
    ? stripPaperTranslationMarkdown(entry.translatedMarkdown)
    : ''
  const translatedParagraphTitle =
    extractParagraphAbstractTitle(translatedMarkdownText) ||
    extractParagraphAbstractTitle(entry.translatedText || '')

  return translatedParagraphTitle || '摘要'
}

function isPaperStructuralSectionTitle(titleText: string): boolean {
  return STRUCTURAL_SECTION_TITLES.has(normalizePaperSectionTitleForMatch(titleText))
}

function isPaperKeywordLikeSegment(
  segment: Pick<PaperTranslationSegment, 'originalText'>
): boolean {
  return KEYWORD_SECTION_PATTERN.test(normalizePaperTranslationText(segment.originalText))
}

function isPaperPageCommentSegment(
  segment: Pick<PaperTranslationSegment, 'originalMarkdown'>
): boolean {
  return PAGE_COMMENT_PATTERN.test(segment.originalMarkdown)
}

function looksLikePaperTitleText(titleText: string): boolean {
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

function resolvePaperTocLevel(titleText: string, markdownLevel: number): PaperTocItem['level'] {
  const numberingMatch = titleText.match(HEADING_NUMBERING_PATTERN)
  if (numberingMatch) {
    return clampPaperTocLevel(numberingMatch[1].split('.').length)
  }

  if (isPaperStructuralSectionTitle(titleText)) {
    return 1
  }

  return clampPaperTocLevel(markdownLevel)
}

export function slugifyPaperHeadingText(text: string): string {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'section'
}

function createUniquePaperTocId(text: string, usedCounts: Map<string, number>): string {
  const baseSlug = slugifyPaperHeadingText(text)
  const count = (usedCounts.get(baseSlug) || 0) + 1
  usedCounts.set(baseSlug, count)
  return count === 1 ? baseSlug : `${baseSlug}-${count}`
}

export function normalizePaperTranslationText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function getPaperSegmentOriginalText(kind: PaperTranslationSegmentKind, markdown: string): string {
  if (kind === 'code') {
    return extractFencedCodeText(markdown)
  }

  return stripPaperTranslationMarkdown(markdown)
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

export function buildFigureCaptionTranslationMap(
  cache: PaperTranslationCache | null | undefined
): Record<string, string> {
  if (!cache) {
    return {}
  }

  const map: Record<string, string> = {}

  for (const entry of cache.entries) {
    if (
      !entry.id.startsWith(FIGURE_CAPTION_TRANSLATION_ID_PREFIX) ||
      entry.status !== 'completed'
    ) {
      continue
    }

    const translatedText = normalizePaperTranslationText(
      entry.translatedText ||
        (entry.translatedMarkdown ? stripPaperTranslationMarkdown(entry.translatedMarkdown) : '')
    )
    if (!translatedText) {
      continue
    }

    map[entry.id.slice(FIGURE_CAPTION_TRANSLATION_ID_PREFIX.length)] = translatedText
  }

  return map
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

function buildPaperTocCandidates(
  segments: PaperTranslationSegment[],
  translationMap: Map<string, PaperTranslationEntry>
): PaperTocCandidate[] {
  const candidates: PaperTocCandidate[] = []

  for (const segment of segments) {
    if (isPaperPageCommentSegment(segment)) {
      continue
    }

    if (segment.kind === 'heading') {
      const heading = parsePaperHeading(segment.originalMarkdown)
      if (!heading) {
        continue
      }

      candidates.push({
        segmentId: segment.id,
        segmentIndex: segment.index,
        text: heading.titleText,
        translatedText: extractTranslatedHeadingText(translationMap.get(segment.id)),
        markdownLevel: heading.markdownLevel,
        isSynthetic: false
      })
      continue
    }

    const abstractTitle = extractParagraphAbstractTitle(segment.originalText)
    if (!abstractTitle) {
      continue
    }

    candidates.push({
      segmentId: segment.id,
      segmentIndex: segment.index,
      text: abstractTitle,
      translatedText: extractTranslatedAbstractTitle(translationMap.get(segment.id)),
      markdownLevel: 1,
      isSynthetic: true
    })
  }

  return candidates
}

function shouldTreatFirstHeadingAsDocumentTitle(
  segments: PaperTranslationSegment[],
  candidate: PaperTocCandidate
): boolean {
  if (candidate.isSynthetic) {
    return false
  }

  if (candidate.segmentIndex > 2) {
    return false
  }

  if (
    HEADING_NUMBERING_PATTERN.test(candidate.text) ||
    isPaperStructuralSectionTitle(candidate.text)
  ) {
    return false
  }

  const followingSegments = segments.slice(candidate.segmentIndex + 1, candidate.segmentIndex + 7)

  for (const segment of followingSegments) {
    if (isPaperPageCommentSegment(segment)) {
      continue
    }

    if (
      isPaperAuthorLikeSegment(segment) ||
      isPaperAffiliationLikeSegment(segment) ||
      isPaperContactLikeSegment(segment) ||
      isPaperKeywordLikeSegment(segment) ||
      !!extractParagraphAbstractTitle(segment.originalText)
    ) {
      return true
    }

    if (segment.kind === 'heading') {
      const heading = parsePaperHeading(segment.originalMarkdown)
      if (!heading) {
        continue
      }

      if (
        HEADING_NUMBERING_PATTERN.test(heading.titleText) ||
        isPaperStructuralSectionTitle(heading.titleText)
      ) {
        return looksLikePaperTitleText(candidate.text)
      }

      break
    }

    if (segment.originalText.trim()) {
      break
    }
  }

  return looksLikePaperTitleText(candidate.text)
}

export function parsePaperTranslationSegments(markdown: string): PaperTranslationSegment[] {
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalizedMarkdown) {
    return []
  }

  const blocks = splitPaperMarkdownBlocks(normalizedMarkdown)

  return blocks.map((block, index) => {
    const kind = detectPaperTranslationSegmentKind(block)
    return {
      id: `seg-${index}`,
      index,
      kind,
      originalMarkdown: block,
      originalText: getPaperSegmentOriginalText(kind, block)
    }
  })
}

export function buildPaperTocOutline(
  segments: PaperTranslationSegment[],
  entries: PaperTranslationEntry[] = []
): PaperTocOutline {
  const translationMap = new Map(entries.map((entry) => [entry.id, entry]))
  const candidates = buildPaperTocCandidates(segments, translationMap)
  const usedIdCounts = new Map<string, number>()
  const firstHeadingCandidate = candidates.find((candidate) => !candidate.isSynthetic)
  const documentTitleCandidate =
    firstHeadingCandidate && shouldTreatFirstHeadingAsDocumentTitle(segments, firstHeadingCandidate)
      ? firstHeadingCandidate
      : undefined
  const outline: PaperTocOutline = {
    items: []
  }

  for (const candidate of candidates) {
    const id = createUniquePaperTocId(candidate.text, usedIdCounts)
    const entry: PaperTocEntry = {
      id,
      segmentId: candidate.segmentId,
      text: candidate.text,
      translatedText: candidate.translatedText
    }

    if (documentTitleCandidate && candidate.segmentId === documentTitleCandidate.segmentId) {
      outline.documentTitle = entry
      continue
    }

    outline.items.push({
      ...entry,
      level: candidate.isSynthetic
        ? 1
        : resolvePaperTocLevel(candidate.text, candidate.markdownLevel)
    })
  }

  return outline
}
