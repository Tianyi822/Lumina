import type {
  PaperTocEntry,
  PaperTocItem,
  PaperTocOutline,
  PaperTranslationEntry
} from '../../types/paper'
import type { PaperTranslationSegment } from '../../types/paper'
import {
  HEADING_NUMBERING_PATTERN,
  APPENDIX_EXPLICIT_HEADING_PATTERN,
  APPENDIX_DOTTED_HEADING_PATTERN,
  APPENDIX_ROOT_HEADING_PATTERN,
  normalizePaperHeadingText,
  isPaperStructuralSectionTitle,
  isPaperBackMatterSectionTitle,
  isPaperAppendixSectionTitle,
  isPaperPageCommentSegment,
  extractParagraphAbstractTitle,
  isPaperAuthorLikeSegment,
  isPaperAffiliationLikeSegment,
  isPaperContactLikeSegment,
  isPaperKeywordLikeSegment,
  looksLikePaperTitleText,
  parsePaperHeading
} from './patterns.ts'
import { extractTranslatedHeadingText } from './helpers.ts'
import { extractTranslatedAbstractTitle } from './helpers.ts'

// ─── 内部类型 ───

interface ParsedPaperAppendixHeading {
  letter: string
  level: PaperTocItem['level']
  kind: 'explicit' | 'dotted' | 'root'
}

interface PaperTocCandidate {
  segmentId: string
  segmentIndex: number
  text: string
  translatedText?: string
  markdownLevel: number
  isSynthetic: boolean
}

interface PaperTocLevelState {
  afterBackMatter: boolean
  inAppendix: boolean
}

interface ResolvedPaperTocLevel {
  level: PaperTocItem['level']
  isAppendix: boolean
  isBackMatter: boolean
}

// ─── 辅助函数 ───

function clampPaperTocLevel(level: number): PaperTocItem['level'] {
  if (level <= 1) {
    return 1
  }

  if (level === 2) {
    return 2
  }

  return 3
}

function parsePaperAppendixHeading(titleText: string): ParsedPaperAppendixHeading | null {
  const normalizedText = normalizePaperHeadingText(titleText)
  if (!normalizedText) {
    return null
  }

  const explicitMatch = normalizedText.match(APPENDIX_EXPLICIT_HEADING_PATTERN)
  if (explicitMatch) {
    const numbering = explicitMatch[2]
    return {
      letter: explicitMatch[1].toUpperCase(),
      level: numbering ? clampPaperTocLevel(numbering.split('.').length + 1) : 1,
      kind: 'explicit'
    }
  }

  const dottedMatch = normalizedText.match(APPENDIX_DOTTED_HEADING_PATTERN)
  if (dottedMatch) {
    return {
      letter: dottedMatch[1].toUpperCase(),
      level: clampPaperTocLevel(dottedMatch[2].split('.').length + 1),
      kind: 'dotted'
    }
  }

  const rootMatch = normalizedText.match(APPENDIX_ROOT_HEADING_PATTERN)
  if (!rootMatch) {
    return null
  }

  return {
    letter: rootMatch[1].toUpperCase(),
    level: 1,
    kind: 'root'
  }
}

function findNextNonSyntheticTocCandidate(
  candidates: PaperTocCandidate[],
  candidateIndex: number
): PaperTocCandidate | undefined {
  return candidates.slice(candidateIndex + 1).find((candidate) => !candidate.isSynthetic)
}

function shouldTreatAppendixRootHeading(
  appendixHeading: ParsedPaperAppendixHeading,
  candidates: PaperTocCandidate[],
  candidateIndex: number,
  state: PaperTocLevelState
): boolean {
  if (appendixHeading.kind !== 'root') {
    return true
  }

  if (state.afterBackMatter || state.inAppendix) {
    return true
  }

  const nextCandidate = findNextNonSyntheticTocCandidate(candidates, candidateIndex)
  const nextAppendixHeading = nextCandidate ? parsePaperAppendixHeading(nextCandidate.text) : null

  return (
    !!nextAppendixHeading &&
    nextAppendixHeading.kind === 'dotted' &&
    nextAppendixHeading.letter === appendixHeading.letter
  )
}

function resolvePaperTocLevel(
  candidate: PaperTocCandidate,
  candidates: PaperTocCandidate[],
  candidateIndex: number,
  state: PaperTocLevelState
): ResolvedPaperTocLevel {
  const appendixHeading = parsePaperAppendixHeading(candidate.text)
  if (
    appendixHeading &&
    shouldTreatAppendixRootHeading(appendixHeading, candidates, candidateIndex, state)
  ) {
    return {
      level: appendixHeading.level,
      isAppendix: true,
      isBackMatter: true
    }
  }

  const numberingMatch = candidate.text.match(HEADING_NUMBERING_PATTERN)
  if (numberingMatch) {
    return {
      level: clampPaperTocLevel(numberingMatch[1].split('.').length),
      isAppendix: false,
      isBackMatter: false
    }
  }

  if (isPaperStructuralSectionTitle(candidate.text)) {
    return {
      level: 1,
      isAppendix: isPaperAppendixSectionTitle(candidate.text),
      isBackMatter: isPaperBackMatterSectionTitle(candidate.text)
    }
  }

  return {
    level: clampPaperTocLevel(candidate.markdownLevel),
    isAppendix: false,
    isBackMatter: false
  }
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

// ─── TOC 候选构建 ───

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

// ─── 公开 API ───

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
  const levelState: PaperTocLevelState = {
    afterBackMatter: false,
    inAppendix: false
  }
  const outline: PaperTocOutline = {
    items: []
  }

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex]
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

    const resolvedLevel = candidate.isSynthetic
      ? {
          level: 1 as PaperTocItem['level'],
          isAppendix: false,
          isBackMatter: false
        }
      : resolvePaperTocLevel(candidate, candidates, candidateIndex, levelState)

    outline.items.push({
      ...entry,
      level: resolvedLevel.level
    })

    if (resolvedLevel.isBackMatter) {
      levelState.afterBackMatter = true
    }

    if (resolvedLevel.isAppendix) {
      levelState.afterBackMatter = true
      levelState.inAppendix = true
    }
  }

  return outline
}
