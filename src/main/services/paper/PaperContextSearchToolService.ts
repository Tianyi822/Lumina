import type {
  PaperDocument,
  PaperReaderDocument,
  PaperReaderSegment,
  PaperTranslationCache,
  PaperTranslationEntry
} from '@shared/types/paper'
import type { MCPToolCallResult } from '@shared/types/mcp'
import { getPaperService, paperStorageService } from './index'

export type PaperContextSearchSource = 'original' | 'translation' | 'both'

export interface PaperContextSearchArgs {
  query?: string
  selectedText?: string
  source?: PaperContextSearchSource
  maxIterations?: number
  limit?: number
}

export interface PaperContextSentenceMatch {
  source: Exclude<PaperContextSearchSource, 'both'>
  segmentIndex: number
  segmentStableId?: string
  pageIndexes?: number[]
  sentence: string
  score: number
  matchedKeywords: string[]
}

export interface PaperContextSearchOutput {
  paperId: string
  source: PaperContextSearchSource
  query: string
  selectedText?: string
  iterations: number
  keywords: string[]
  usedReadingProgressFallback: boolean
  matches: PaperContextSentenceMatch[]
  warnings: string[]
}

interface PaperContextSearchDependencies {
  getReaderDocument: (paperId: string) => Promise<{
    success: boolean
    data?: PaperReaderDocument
    error?: string
  }>
  readTranslationCache: (paperId: string) =>
    | {
        success: boolean
        data?: PaperTranslationCache
        error?: string
      }
    | Promise<{
        success: boolean
        data?: PaperTranslationCache
        error?: string
      }>
  readMeta: (paperId: string) =>
    | {
        success: boolean
        data?: PaperDocument
        error?: string
      }
    | Promise<{
        success: boolean
        data?: PaperDocument
        error?: string
      }>
}

interface SentenceUnit {
  id: string
  source: Exclude<PaperContextSearchSource, 'both'>
  segmentIndex: number
  segmentStableId?: string
  pageIndexes?: number[]
  sentenceIndex: number
  text: string
  normalizedText: string
}

interface ScoredSentenceUnit extends SentenceUnit {
  score: number
  matchedKeywords: string[]
}

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 24
const DEFAULT_MAX_ITERATIONS = 10
const MAX_ITERATIONS = 10
const ENOUGH_SENTENCE_COUNT = 12
const ENOUGH_CONTEXT_CHARS = 6000
const READING_PROGRESS_WINDOW_BEFORE = 2
const READING_PROGRESS_WINDOW_AFTER = 5

const ENGLISH_STOP_WORDS = new Set([
  'about',
  'above',
  'after',
  'again',
  'against',
  'also',
  'answer',
  'because',
  'before',
  'between',
  'connect',
  'connected',
  'connects',
  'could',
  'does',
  'from',
  'have',
  'into',
  'lead',
  'leads',
  'more',
  'please',
  'question',
  'should',
  'show',
  'that',
  'their',
  'there',
  'these',
  'this',
  'those',
  'what',
  'when',
  'where',
  'which',
  'with',
  'would'
])

const CHINESE_FILLER_PATTERN =
  /(请|帮我|帮忙|一下|这个|这段|这部分|这里|其中|什么意思|是什么意思|什么含义|如何理解|解释|说明|分析|总结|论文|内容|原文|译文|作者|指出|提到|认为|部分|问题)/g

const CHINESE_GENERIC_WORDS = new Set([
  '内容',
  '论文',
  '原文',
  '译文',
  '问题',
  '部分',
  '这里',
  '这个',
  '这段',
  '意思',
  '总结',
  '解释',
  '分析'
])

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

function normalizeSentenceText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r/g, '\n').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }

  const matches = normalized.match(/[^。.!！?？;；]+[。.!！?？;；]?/g) ?? [normalized]
  return matches.map(normalizeSentenceText).filter((sentence) => sentence.length > 0)
}

function isUsefulChineseKeyword(keyword: string): boolean {
  const stripped = keyword.replace(CHINESE_FILLER_PATTERN, '').trim()
  if (stripped.length < 2) {
    return false
  }
  if (CHINESE_GENERIC_WORDS.has(stripped)) {
    return false
  }
  return true
}

function collectKeywords(text: string, maxKeywords = 16): string[] {
  const keywords: string[] = []
  const seen = new Set<string>()
  const normalized = normalizeText(text)

  for (const match of normalized.matchAll(/[a-z][a-z0-9_-]{2,}/gi)) {
    const token = match[0].toLowerCase()
    if (ENGLISH_STOP_WORDS.has(token) || seen.has(token)) {
      continue
    }
    seen.add(token)
    keywords.push(token)
    if (keywords.length >= maxKeywords) {
      return keywords
    }
  }

  for (const match of text.matchAll(/[\u4e00-\u9fff]{2,12}/g)) {
    const raw = match[0]
    const compact = raw.replace(CHINESE_FILLER_PATTERN, '').trim()
    if (!isUsefulChineseKeyword(compact)) {
      continue
    }

    const candidates =
      compact.length <= 8
        ? [compact]
        : Array.from({ length: compact.length - 1 }, (_, index) =>
            compact.slice(index, Math.min(compact.length, index + 8))
          ).filter((candidate) => candidate.length >= 2)

    for (const candidate of candidates) {
      if (seen.has(candidate) || !isUsefulChineseKeyword(candidate)) {
        continue
      }
      seen.add(candidate)
      keywords.push(candidate)
      if (keywords.length >= maxKeywords) {
        return keywords
      }
    }
  }

  return keywords
}

function normalizeSource(value: unknown): PaperContextSearchSource {
  if (value === 'original' || value === 'translation' || value === 'both') {
    return value
  }
  return 'both'
}

function matchKeyword(sentence: SentenceUnit, keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword)
  if (!normalizedKeyword) {
    return false
  }
  return sentence.normalizedText.includes(normalizedKeyword)
}

function scoreSentence(
  sentence: SentenceUnit,
  keywords: string[],
  selectedText: string
): ScoredSentenceUnit | null {
  let score = 0
  const matchedKeywords: string[] = []

  for (const keyword of keywords) {
    if (matchKeyword(sentence, keyword)) {
      matchedKeywords.push(keyword)
      score += Math.min(8, Math.max(1, keyword.length))
    }
  }

  const normalizedSelectedText = normalizeText(selectedText)
  if (normalizedSelectedText && sentence.normalizedText.includes(normalizedSelectedText)) {
    score += 32
  }

  if (score <= 0) {
    return null
  }

  return {
    ...sentence,
    score,
    matchedKeywords
  }
}

function toSentenceUnits(
  source: Exclude<PaperContextSearchSource, 'both'>,
  segment: Pick<PaperReaderSegment, 'index' | 'stableId' | 'sourceRefs'>,
  text: string
): SentenceUnit[] {
  return splitSentences(text).map((sentence, sentenceIndex) => ({
    id: `${source}:${segment.index}:${sentenceIndex}`,
    source,
    segmentIndex: segment.index,
    segmentStableId: segment.stableId,
    pageIndexes: segment.sourceRefs?.pageIndexes ? [...segment.sourceRefs.pageIndexes] : undefined,
    sentenceIndex,
    text: sentence,
    normalizedText: normalizeText(sentence)
  }))
}

function createSegmentLookup(readerDocument: PaperReaderDocument): Map<string, PaperReaderSegment> {
  const lookup = new Map<string, PaperReaderSegment>()
  for (const segment of readerDocument.segments) {
    lookup.set(segment.id, segment)
    lookup.set(String(segment.index), segment)
  }
  return lookup
}

function getTranslationSegment(
  entry: PaperTranslationEntry,
  lookup: Map<string, PaperReaderSegment>
): PaperReaderSegment | undefined {
  return lookup.get(entry.id) ?? lookup.get(String(entry.index))
}

export class PaperContextSearchToolService {
  private readonly dependencies: PaperContextSearchDependencies

  constructor(dependencies?: Partial<PaperContextSearchDependencies>) {
    this.dependencies = {
      getReaderDocument: (paperId) => getPaperService().getReaderDocument(paperId),
      readTranslationCache: (paperId) => paperStorageService.readTranslationCache(paperId),
      readMeta: (paperId) => paperStorageService.readMeta(paperId),
      ...dependencies
    }
  }

  async search(paperId: string, args: PaperContextSearchArgs): Promise<MCPToolCallResult> {
    const source = normalizeSource(args.source)
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    const selectedText = typeof args.selectedText === 'string' ? args.selectedText.trim() : ''
    const limit = clampInteger(args.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
    const maxIterations = clampInteger(
      args.maxIterations,
      DEFAULT_MAX_ITERATIONS,
      1,
      MAX_ITERATIONS
    )

    if (!paperId.trim()) {
      return { success: false, error: '缺少论文 ID，无法检索论文上下文' }
    }

    const readerResult = await this.dependencies.getReaderDocument(paperId)
    if (!readerResult.success || !readerResult.data) {
      return {
        success: false,
        error: readerResult.error || '读取论文原文内容失败'
      }
    }

    const warnings: string[] = []
    const corpus = await this.buildCorpus(paperId, readerResult.data, source, warnings)
    if (corpus.length === 0) {
      return {
        success: false,
        error: '论文 OCR/译文文本为空，无法检索上下文'
      }
    }

    const selectedKeywords = collectKeywords(selectedText)
    const queryKeywords = selectedKeywords.length > 0 ? [] : collectKeywords(query)
    const hasExplicitKeywords = selectedKeywords.length > 0 || queryKeywords.length > 0
    let candidates = corpus
    let usedReadingProgressFallback = false
    let keywords = selectedKeywords.length > 0 ? selectedKeywords : queryKeywords

    if (!hasExplicitKeywords) {
      const fallback = await this.buildReadingProgressCandidates(
        paperId,
        readerResult.data,
        corpus,
        source,
        warnings
      )
      if (fallback.length > 0) {
        candidates = fallback
        usedReadingProgressFallback = true
      }

      keywords = collectKeywords(
        [query, ...candidates.slice(0, 16).map((candidate) => candidate.text)].join('\n')
      )
    }

    if (keywords.length === 0) {
      return {
        success: true,
        content: {
          paperId,
          source,
          query,
          selectedText,
          iterations: 0,
          keywords,
          usedReadingProgressFallback,
          matches: candidates.slice(0, limit).map((candidate) => ({
            source: candidate.source,
            segmentIndex: candidate.segmentIndex,
            segmentStableId: candidate.segmentStableId,
            pageIndexes: candidate.pageIndexes,
            sentence: candidate.text,
            score: 0,
            matchedKeywords: []
          })),
          warnings: [...warnings, '未提取到明确关键词，已返回候选阅读上下文']
        }
      }
    }

    const searchResult = this.recursiveSearch({
      candidates,
      selectedText,
      initialKeywords: keywords,
      maxIterations,
      limit
    })

    return {
      success: true,
      content: {
        paperId,
        source,
        query,
        selectedText,
        iterations: searchResult.iterations,
        keywords: searchResult.keywords,
        usedReadingProgressFallback,
        matches: searchResult.matches.map((match) => ({
          source: match.source,
          segmentIndex: match.segmentIndex,
          segmentStableId: match.segmentStableId,
          pageIndexes: match.pageIndexes,
          sentence: match.text,
          score: match.score,
          matchedKeywords: match.matchedKeywords
        })),
        warnings
      }
    }
  }

  private async buildCorpus(
    paperId: string,
    readerDocument: PaperReaderDocument,
    source: PaperContextSearchSource,
    warnings: string[]
  ): Promise<SentenceUnit[]> {
    const corpus: SentenceUnit[] = []

    if (source === 'original' || source === 'both') {
      for (const segment of readerDocument.segments) {
        corpus.push(...toSentenceUnits('original', segment, segment.originalText))
      }
    }

    if (source === 'translation' || source === 'both') {
      const translationResult = await this.dependencies.readTranslationCache(paperId)
      if (!translationResult.success || !translationResult.data) {
        warnings.push(translationResult.error || '译文缓存不存在，已跳过译文检索')
      } else {
        const segmentLookup = createSegmentLookup(readerDocument)
        let translatedCount = 0
        for (const entry of translationResult.data.entries) {
          if (!entry.translatedText?.trim()) {
            continue
          }

          const segment = getTranslationSegment(entry, segmentLookup)
          corpus.push(
            ...toSentenceUnits(
              'translation',
              segment ?? {
                index: entry.index,
                stableId: entry.id,
                sourceRefs: { pageIndexes: [], blockIndexes: [] }
              },
              entry.translatedText
            )
          )
          translatedCount += 1
        }

        if (translatedCount === 0) {
          warnings.push('译文缓存中没有可用译文段落')
        }
      }
    }

    return corpus
  }

  private async buildReadingProgressCandidates(
    paperId: string,
    readerDocument: PaperReaderDocument,
    corpus: SentenceUnit[],
    source: PaperContextSearchSource,
    warnings: string[]
  ): Promise<SentenceUnit[]> {
    const metaResult = await this.dependencies.readMeta(paperId)
    const progress = metaResult.success ? metaResult.data?.readingProgress : undefined
    if (!progress) {
      warnings.push('未找到阅读进度，已使用论文开头候选上下文')
      return this.filterCorpusBySegmentRange(corpus, 0, READING_PROGRESS_WINDOW_AFTER, source)
    }

    const totalSegments = readerDocument.segments.length
    if (totalSegments === 0) {
      warnings.push('阅读进度对应段落为空，已使用论文开头候选上下文')
      return this.filterCorpusBySegmentRange(corpus, 0, READING_PROGRESS_WINDOW_AFTER, source)
    }

    const currentIndex = Math.min(
      Math.floor((progress.scrollPercent / 100) * Math.max(1, totalSegments - 1)),
      totalSegments - 1
    )

    return this.filterCorpusBySegmentRange(
      corpus,
      Math.max(0, currentIndex - READING_PROGRESS_WINDOW_BEFORE),
      currentIndex + Math.max(0, READING_PROGRESS_WINDOW_AFTER - READING_PROGRESS_WINDOW_BEFORE),
      source
    )
  }

  private filterCorpusBySegmentRange(
    corpus: SentenceUnit[],
    startIndex: number,
    endIndex: number,
    source: PaperContextSearchSource
  ): SentenceUnit[] {
    return corpus.filter((unit) => {
      const sourceMatches = source === 'both' || unit.source === source
      return sourceMatches && unit.segmentIndex >= startIndex && unit.segmentIndex <= endIndex
    })
  }

  private recursiveSearch(params: {
    candidates: SentenceUnit[]
    selectedText: string
    initialKeywords: string[]
    maxIterations: number
    limit: number
  }): {
    iterations: number
    keywords: string[]
    matches: ScoredSentenceUnit[]
  } {
    const allKeywords: string[] = []
    const seenKeywords = new Set<string>()
    let frontier = params.initialKeywords
    const matchesById = new Map<string, ScoredSentenceUnit>()
    let iterations = 0

    for (let i = 0; i < params.maxIterations; i++) {
      const activeKeywords = frontier.filter((keyword) => {
        if (seenKeywords.has(keyword)) {
          return false
        }
        seenKeywords.add(keyword)
        allKeywords.push(keyword)
        return true
      })

      if (activeKeywords.length === 0) {
        break
      }

      iterations += 1
      const roundMatches: ScoredSentenceUnit[] = []
      for (const candidate of params.candidates) {
        const scored = scoreSentence(candidate, activeKeywords, params.selectedText)
        if (!scored) {
          continue
        }

        const existing = matchesById.get(scored.id)
        if (!existing || scored.score > existing.score) {
          matchesById.set(scored.id, scored)
        }
        roundMatches.push(scored)
      }

      if (roundMatches.length === 0) {
        break
      }

      const sortedMatches = this.sortMatches(Array.from(matchesById.values()))
      if (this.hasEnoughContext(sortedMatches, params.limit)) {
        break
      }

      frontier = collectKeywords(roundMatches.map((match) => match.text).join('\n')).filter(
        (keyword) => !seenKeywords.has(keyword)
      )
    }

    return {
      iterations,
      keywords: allKeywords,
      matches: this.sortMatches(Array.from(matchesById.values())).slice(0, params.limit)
    }
  }

  private sortMatches(matches: ScoredSentenceUnit[]): ScoredSentenceUnit[] {
    return matches.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score
      }
      if (a.segmentIndex !== b.segmentIndex) {
        return a.segmentIndex - b.segmentIndex
      }
      return a.sentenceIndex - b.sentenceIndex
    })
  }

  private hasEnoughContext(matches: ScoredSentenceUnit[], limit: number): boolean {
    const targetCount = Math.min(limit, ENOUGH_SENTENCE_COUNT)
    if (matches.length >= targetCount) {
      return true
    }

    const totalChars = matches.reduce((sum, match) => sum + match.text.length, 0)
    return totalChars >= ENOUGH_CONTEXT_CHARS
  }
}

export const paperContextSearchToolService = new PaperContextSearchToolService()
