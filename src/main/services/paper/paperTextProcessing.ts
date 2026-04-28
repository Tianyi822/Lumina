import { isFalseOrderedListContinuation } from '../../../shared/utils/paperMarkdown.ts'
import type { PaperLayoutBlock } from '../../../shared/types/paper'
import {
  decodeHtmlEntities,
  getPlainText,
  isCenteredTextBlock,
  isFigureCaptionBlock,
  isFigureSupportBlock,
  isHeadingBlock
} from './paperBlockClassifiers.ts'

const SIMPLE_TEXT_CONTAINER_TAGS = [
  'div',
  'p',
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'sup',
  'sub',
  'a',
  'font',
  'small',
  'mark',
  'br'
].join('|')

const SIMPLE_TEXT_CONTAINER_PATTERN = new RegExp(
  `<\\/?(?:${SIMPLE_TEXT_CONTAINER_TAGS})\\b[^>]*\\/?>`,
  'gi'
)

const STRUCTURAL_HTML_PATTERN =
  /<\/?(?:img|table|thead|tbody|tfoot|tr|td|th|ul|ol|li|blockquote|pre|code|figure|figcaption|h[1-6]|hr|svg|math)\b/i
const FENCED_SIMPLE_TEXT_CONTAINER_PATTERN =
  /^ {0,3}(`{3,}|~{3,})(?:[ \t]*(?:markdown|md)?)?[ \t]*\n([\s\S]*?)\n {0,3}\1[ \t]*$/i
const FENCED_SIMPLE_TEXT_CONTAINER_GLOBAL_PATTERN =
  /(^|\n)( {0,3}(`{3,}|~{3,})(?:[ \t]*(?:markdown|md)?)?[ \t]*\n([\s\S]*?)\n {0,3}\3[ \t]*(?=\n|$))/g

function endsWithStrongTerminalPunctuation(text: string): boolean {
  return /[.!?。？！]["')\]]*\s*$/.test(text)
}

function startsWithContinuationText(text: string): boolean {
  return /^(?:\[|[a-z0-9(,:;'"“‘])/.test(text)
}

function startsWithInlineContinuationCue(text: string): boolean {
  return /^(?:\[|[a-z(,:;'"“‘])/.test(text)
}

function startsWithUppercaseLatin(text: string): boolean {
  return /^[A-Z]/.test(text)
}

function startsWithNewParagraphMarker(content: string): boolean {
  if (isFalseOrderedListContinuation(content)) {
    return false
  }

  return /^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+|>\s+)/.test(content)
}

function isReferenceSectionHeading(text: string): boolean {
  return /^(?:references|bibliography|reference|参考文献)$/.test(text.trim())
}

function startsWithReferenceEntry(text: string, source: string): boolean {
  const trimmedText = text.trim()
  const trimmedSource = source.trim()

  if (
    /^(?:\d+\s+)?(?:\[\d{1,4}\]|\(\d{1,4}\))\s+/.test(trimmedText) ||
    /^(?:\d+\s+)?(?:\[\d{1,4}\]|\(\d{1,4}\))\s+/.test(trimmedSource)
  ) {
    return true
  }

  return /^(?:\d+\s+)?\d+\.\s+[A-Z\u00C0-\u024F]/.test(trimmedText)
}

export function shouldMergeTextFlow(
  previousText: string | undefined,
  nextText: string | undefined,
  nextSource: string
): boolean {
  if (!previousText || !nextText) {
    return false
  }

  if (
    isReferenceSectionHeading(previousText) ||
    startsWithNewParagraphMarker(nextSource) ||
    startsWithReferenceEntry(nextText, nextSource)
  ) {
    return false
  }

  if (previousText.endsWith('-')) {
    return true
  }

  const previousEndsStrong = endsWithStrongTerminalPunctuation(previousText)
  if (
    previousEndsStrong &&
    (startsWithUppercaseLatin(nextText) || startsWithNewParagraphMarker(nextSource))
  ) {
    return false
  }

  return !previousEndsStrong || startsWithContinuationText(nextText)
}

export function getTextFlowReplacement(
  previousText: string | undefined,
  nextText: string | undefined,
  nextSource: string
): string {
  if (!shouldMergeTextFlow(previousText, nextText, nextSource)) {
    return '\n\n'
  }

  return (previousText ?? '').endsWith('-') ? '' : ' '
}

function getBlockVerticalGap(previousBlock: PaperLayoutBlock, nextBlock: PaperLayoutBlock): number {
  return nextBlock.bbox.y - (previousBlock.bbox.y + previousBlock.bbox.height)
}

function hasSimilarHorizontalCenter(
  previousBlock: PaperLayoutBlock,
  nextBlock: PaperLayoutBlock
): boolean {
  const previousCenter = previousBlock.bbox.x + previousBlock.bbox.width / 2
  const nextCenter = nextBlock.bbox.x + nextBlock.bbox.width / 2
  return Math.abs(previousCenter - nextCenter) <= previousBlock.width * 0.08
}

function shouldMergeCenteredTextBlocks(
  previousBlock: PaperLayoutBlock,
  nextBlock: PaperLayoutBlock
): boolean {
  const verticalGap = getBlockVerticalGap(previousBlock, nextBlock)
  const compactGapThreshold = Math.max(
    24,
    Math.min(previousBlock.bbox.height, nextBlock.bbox.height) * 0.6
  )

  return verticalGap <= compactGapThreshold && hasSimilarHorizontalCenter(previousBlock, nextBlock)
}

function normalizeSegmentForMathDetection(segment: string): string {
  return decodeHtmlEntities(
    segment
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li|tr|td|th|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function isStandaloneMathDelimiter(segment: string): boolean {
  return /^(?:\${1,2}|\\\(|\\\)|\\\[|\\\])$/.test(segment.trim())
}

function hasMathDelimiters(segment: string): boolean {
  const normalized = normalizeSegmentForMathDetection(segment)
  if (!normalized) {
    return false
  }

  return /(^|[^\\])\${1,2}/.test(normalized) || /\\\[|\\\]|\\\(|\\\)/.test(normalized)
}

function hasLatexEnvironment(segment: string): boolean {
  return /\\(?:begin|end)\{[^}]+\}/.test(normalizeSegmentForMathDetection(segment))
}

function looksLikeMathBody(segment: string): boolean {
  const normalized = normalizeSegmentForMathDetection(segment)
  if (!normalized) {
    return false
  }

  const texCommandCount = (normalized.match(/\\[A-Za-z]+/g) || []).length
  const mathStructureCount = (normalized.match(/[=^_{}]/g) || []).length
  const formulaLikeWordCount = (normalized.match(/[A-Za-z]{2,}/g) || []).length

  if (/^\\[A-Za-z]+/.test(normalized)) {
    return true
  }

  if (texCommandCount >= 2) {
    return true
  }

  if (texCommandCount >= 1 && mathStructureCount >= 2) {
    return true
  }

  if (
    texCommandCount >= 1 &&
    mathStructureCount >= 1 &&
    formulaLikeWordCount <= texCommandCount + 4 &&
    !/[.!?。？！]/.test(normalized)
  ) {
    return true
  }

  return false
}

export function isMathLikeSegment(segment: string): boolean {
  return (
    isStandaloneMathDelimiter(segment) ||
    hasMathDelimiters(segment) ||
    hasLatexEnvironment(segment) ||
    looksLikeMathBody(segment)
  )
}

export function isSimpleTextContainerSegment(segment: string): boolean {
  const trimmed = segment.trim()
  if (!trimmed.startsWith('<') || STRUCTURAL_HTML_PATTERN.test(trimmed)) {
    return false
  }

  const withoutAllowedTags = trimmed.replace(SIMPLE_TEXT_CONTAINER_PATTERN, '').trim()
  return withoutAllowedTags.length > 0 && !/[<>]/.test(withoutAllowedTags)
}

export function unwrapFencedSimpleTextContainerHtml(segment: string): string {
  const match = segment.trim().match(FENCED_SIMPLE_TEXT_CONTAINER_PATTERN)
  if (!match) {
    return segment
  }

  const innerHtml = match[2].trim()
  return isSimpleTextContainerSegment(innerHtml) ? innerHtml : segment
}

export function isFencedSimpleTextContainerHtml(segment: string): boolean {
  return unwrapFencedSimpleTextContainerHtml(segment) !== segment
}

export function normalizeFencedSimpleTextContainerHtml(markdown: string): string {
  return markdown.replace(
    FENCED_SIMPLE_TEXT_CONTAINER_GLOBAL_PATTERN,
    (match: string, prefix: string, _fencedBlock: string, _fence: string, innerHtml: string) => {
      const trimmedInnerHtml = innerHtml.trim()
      if (!isSimpleTextContainerSegment(trimmedInnerHtml)) {
        return match
      }

      return `${prefix}${trimmedInnerHtml}`
    }
  )
}

export function isMergeableTextSegment(segment: string): boolean {
  const trimmed = unwrapFencedSimpleTextContainerHtml(segment).trim()
  if (!trimmed) {
    return false
  }

  const startsWithOrderedListMarker = /^\s{0,3}\d+[.)]\s+/.test(trimmed)

  if (
    /^<!--[\s\S]*?-->$/.test(trimmed) ||
    /^\s{0,3}#{1,6}\s+/.test(trimmed) ||
    /^\s{0,3}(?:[-*+]\s+|>\s+)/.test(trimmed) ||
    (startsWithOrderedListMarker && !isFalseOrderedListContinuation(trimmed)) ||
    /^\s*(?:```|~~~)/.test(trimmed) ||
    /^\s*\|/.test(trimmed) ||
    isMathLikeSegment(trimmed)
  ) {
    return false
  }

  if (/^\s*</.test(trimmed) && !isSimpleTextContainerSegment(trimmed)) {
    return false
  }

  return getPlainText(trimmed).length > 0
}

export function isOrdinaryParagraphSegment(segment: string): boolean {
  const trimmed = segment.trim()
  return isMergeableTextSegment(trimmed) && !/^\s*</.test(trimmed)
}

export function normalizeSoftWrappedLines(segment: string): string {
  if (!isOrdinaryParagraphSegment(segment) || !segment.includes('\n')) {
    return segment
  }

  const lines = segment
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length <= 1) {
    return lines[0] ?? ''
  }

  const normalizedParagraphs: string[] = [lines[0]]

  for (const line of lines.slice(1)) {
    const previousParagraph = normalizedParagraphs[normalizedParagraphs.length - 1]
    const replacement = getTextFlowReplacement(
      getPlainText(previousParagraph),
      getPlainText(line),
      line
    )

    if (replacement === '\n\n') {
      normalizedParagraphs.push(line)
      continue
    }

    normalizedParagraphs[normalizedParagraphs.length - 1] =
      `${previousParagraph}${replacement}${line}`
  }

  return normalizedParagraphs.join('\n\n')
}

export function reflowOrdinaryParagraphs(markdown: string): string {
  const segments = markdown
    .split(/\n{2,}/)
    .flatMap((segment) => normalizeSoftWrappedLines(segment).split(/\n{2,}/))
  const normalizedMarkdown = segments.join('\n\n')
  if (segments.length <= 1) {
    return normalizedMarkdown || markdown
  }

  const reflowedSegments: string[] = []

  for (const segment of segments) {
    if (reflowedSegments.length === 0) {
      reflowedSegments.push(segment)
      continue
    }

    const previousSegment = reflowedSegments[reflowedSegments.length - 1]
    if (!isOrdinaryParagraphSegment(previousSegment) || !isOrdinaryParagraphSegment(segment)) {
      reflowedSegments.push(segment)
      continue
    }

    const replacement = getTextFlowReplacement(
      getPlainText(previousSegment),
      getPlainText(segment),
      segment
    )

    if (replacement === '\n\n') {
      reflowedSegments.push(segment)
      continue
    }

    reflowedSegments[reflowedSegments.length - 1] =
      `${previousSegment}${replacement}${segment.trimStart()}`
  }

  return reflowedSegments.join('\n\n')
}

function getSimpleTextContainerReflowSource(content: string): string {
  const withLineBreaks = decodeHtmlEntities(
    content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li|tr|td|th|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )

  const segments = withLineBreaks
    .split(/\n{2,}/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  return segments.join('\n\n')
}

export function normalizeMergeableTextBlockContent(content: string): string {
  const normalizedContent = unwrapFencedSimpleTextContainerHtml(content)

  if (!isMergeableTextSegment(normalizedContent)) {
    return content
  }

  if (isSimpleTextContainerSegment(normalizedContent)) {
    const reflowSource = getSimpleTextContainerReflowSource(normalizedContent)
    return reflowSource ? reflowOrdinaryParagraphs(reflowSource) : normalizedContent
  }

  return reflowOrdinaryParagraphs(normalizedContent)
}

export function isBodyTextBlock(block: PaperLayoutBlock | undefined): block is PaperLayoutBlock {
  if (!block || block.label !== 'text') {
    return false
  }

  if (
    isHeadingBlock(block) ||
    isFigureCaptionBlock(block) ||
    isFigureSupportBlock(block) ||
    isMathLikeSegment(block.content)
  ) {
    return false
  }

  return isMergeableTextSegment(block.content)
}

export function shouldMergeAdjacentTextBlocks(
  previousBlock: PaperLayoutBlock | undefined,
  nextBlock: PaperLayoutBlock | undefined
): boolean {
  if (!isBodyTextBlock(previousBlock) || !isBodyTextBlock(nextBlock)) {
    return false
  }

  const replacement = getTextFlowReplacement(
    getPlainText(previousBlock.content),
    getPlainText(nextBlock.content),
    nextBlock.content
  )
  if (replacement === '\n\n') {
    return false
  }

  const previousCentered = isCenteredTextBlock(previousBlock)
  const nextCentered = isCenteredTextBlock(nextBlock)
  if (
    previousCentered &&
    nextCentered &&
    !startsWithInlineContinuationCue(getPlainText(nextBlock.content))
  ) {
    return (
      previousCentered && nextCentered && shouldMergeCenteredTextBlocks(previousBlock, nextBlock)
    )
  }

  return true
}

export function getBodyBlockGapReplacement(
  previousBlock: PaperLayoutBlock | undefined,
  nextBlock: PaperLayoutBlock | undefined
): string {
  if (!isBodyTextBlock(previousBlock) || !isBodyTextBlock(nextBlock)) {
    return '\n\n'
  }

  return shouldMergeAdjacentTextBlocks(previousBlock, nextBlock)
    ? getTextFlowReplacement(
        getPlainText(previousBlock.content),
        getPlainText(nextBlock.content),
        nextBlock.content
      )
    : '\n\n'
}
