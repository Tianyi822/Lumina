import { createHash } from 'crypto'
import type {
  PaperLayoutBlock,
  PaperPageOcrResult,
  PaperReaderDocument,
  PaperReaderSegment,
  PaperReaderSegmentSourceRefs
} from '../../../shared/types/paper'
import { parsePaperTranslationSegments } from '../../../shared/utils/paperTranslation'
import {
  getPlainText,
  isTableCaptionBlock
} from './paperBlockClassifiers.ts'
import {
  getBodyBlockGapReplacement,
  isFencedSimpleTextContainerHtml,
  isBodyTextBlock,
  isSimpleTextContainerSegment,
  normalizeFencedSimpleTextContainerHtml,
  normalizeMergeableTextBlockContent,
  shouldMergeAdjacentTextBlocks
} from './paperTextProcessing.ts'
import type {
  BlockOccurrence,
  ExtractedPaperFigureData,
  ReaderPageFragment,
  TextRunReplacement
} from './paperFigureExtractorTypes.ts'

interface ReaderVisibleBlockOccurrence {
  pageIndex: number
  blockIndex: number
  start: number
  end: number
}

function escapeRegExp(content: string): string {
  return content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceTokenWithGap(markdown: string, token: string, replacement: string): string {
  const tokenPattern = new RegExp(`\\s*${escapeRegExp(token)}\\s*`, 'g')
  return markdown.replace(tokenPattern, replacement)
}

function normalizeReaderPageResult(pageResult: PaperPageOcrResult): PaperPageOcrResult {
  return {
    ...pageResult,
    markdown: normalizeFencedSimpleTextContainerHtml(pageResult.markdown),
    blocks: pageResult.blocks.map((block) => {
      const normalizedContent = normalizeFencedSimpleTextContainerHtml(block.content)
      if (normalizedContent === block.content && block.label !== 'code') {
        return block
      }

      return {
        ...block,
        label: isFencedSimpleTextContainerHtml(block.content) ? 'text' : block.label,
        content: normalizedContent
      }
    })
  }
}

function normalizeReaderPageResults(pageResults: PaperPageOcrResult[]): PaperPageOcrResult[] {
  return pageResults.map(normalizeReaderPageResult)
}

/**
 * 在 Markdown 中查找每个可见块的出现位置（start/end offset）
 * 跳过 removalIndexes 中的块
 */
export function findBlockOccurrences(
  markdown: string,
  pageBlocks: PaperLayoutBlock[],
  removalIndexes: Set<number>
): Map<number, BlockOccurrence> {
  const occurrences = new Map<number, BlockOccurrence>()
  let searchStart = 0

  for (const block of pageBlocks) {
    if (removalIndexes.has(block.index) || !block.content) {
      continue
    }

    const searchValues = [
      block.content,
      ...(block.label === 'text' ? [normalizeMergeableTextBlockContent(block.content)] : [])
    ].filter((value, index, values) => value && values.indexOf(value) === index)

    let matchedStart = -1
    let matchedContent = ''

    for (const searchValue of searchValues) {
      const start = markdown.indexOf(searchValue, searchStart)
      if (start < 0) {
        continue
      }

      if (matchedStart < 0 || start < matchedStart) {
        matchedStart = start
        matchedContent = searchValue
      }
    }

    if (matchedStart < 0) {
      continue
    }

    const end = matchedStart + matchedContent.length
    occurrences.set(block.index, {
      block,
      start: matchedStart,
      end,
      content: markdown.slice(matchedStart, end)
    })
    searchStart = end
  }

  return occurrences
}

function applyTextRunReplacements(markdown: string, replacements: TextRunReplacement[]): string {
  if (replacements.length === 0) {
    return markdown
  }

  let nextMarkdown = ''
  let cursor = 0

  for (const replacement of replacements) {
    nextMarkdown += markdown.slice(cursor, replacement.start)
    nextMarkdown += replacement.replacement
    cursor = replacement.end
  }

  nextMarkdown += markdown.slice(cursor)
  return nextMarkdown
}

function normalizeVisibleTextBlocks(
  markdown: string,
  pageBlocks: PaperLayoutBlock[],
  removalIndexes: Set<number>
): string {
  const occurrences = findBlockOccurrences(markdown, pageBlocks, removalIndexes)
  const replacements: TextRunReplacement[] = []

  for (const block of pageBlocks) {
    if (removalIndexes.has(block.index) || block.label !== 'text') {
      continue
    }

    const occurrence = occurrences.get(block.index)
    if (!occurrence) {
      continue
    }

    const replacement = normalizeMergeableTextBlockContent(occurrence.content)
    if (replacement === occurrence.content) {
      continue
    }

    replacements.push({
      start: occurrence.start,
      end: occurrence.end,
      replacement
    })
  }

  return applyTextRunReplacements(markdown, replacements)
}

function getMergeableTextContent(content: string): string {
  return isSimpleTextContainerSegment(content) ? getPlainText(content) : content.trim()
}

function buildMergedTextRunContent(
  blocks: PaperLayoutBlock[],
  occurrences: Map<number, BlockOccurrence>
): string {
  const [firstBlock, ...restBlocks] = blocks
  const firstOccurrence = occurrences.get(firstBlock.index)
  let mergedContent = getMergeableTextContent(firstOccurrence?.content || firstBlock.content)
  let previousBlock = firstBlock

  for (const block of restBlocks) {
    const occurrence = occurrences.get(block.index)
    const gapReplacement = getBodyBlockGapReplacement(previousBlock, block)
    const nextContent = getMergeableTextContent(occurrence?.content || block.content).trimStart()
    mergedContent += `${gapReplacement}${nextContent}`
    previousBlock = block
  }

  return mergedContent
}

function mergeAdjacentTextBlocks(
  markdown: string,
  pageBlocks: PaperLayoutBlock[],
  removalIndexes: Set<number>
): string {
  const visibleBlocks = pageBlocks.filter((block) => !removalIndexes.has(block.index))
  const occurrences = findBlockOccurrences(markdown, pageBlocks, removalIndexes)
  const replacements: TextRunReplacement[] = []

  for (let index = 0; index < visibleBlocks.length; index += 1) {
    const currentBlock = visibleBlocks[index]
    if (currentBlock.label !== 'text' || !occurrences.has(currentBlock.index)) {
      continue
    }

    const runBlocks = [currentBlock]
    let cursor = index

    while (cursor + 1 < visibleBlocks.length) {
      const previousBlock = visibleBlocks[cursor]
      const nextBlock = visibleBlocks[cursor + 1]
      if (
        previousBlock.label !== 'text' ||
        nextBlock.label !== 'text' ||
        !shouldMergeAdjacentTextBlocks(previousBlock, nextBlock)
      ) {
        break
      }

      const previousOccurrence = occurrences.get(previousBlock.index)
      const nextOccurrence = occurrences.get(nextBlock.index)
      if (!previousOccurrence || !nextOccurrence || previousOccurrence.end > nextOccurrence.start) {
        break
      }

      const gapContent = markdown.slice(previousOccurrence.end, nextOccurrence.start)
      if (!/^\s+$/.test(gapContent)) {
        break
      }

      runBlocks.push(nextBlock)
      cursor += 1
    }

    if (runBlocks.length > 1) {
      const firstOccurrence = occurrences.get(runBlocks[0].index)
      const lastOccurrence = occurrences.get(runBlocks[runBlocks.length - 1].index)
      if (firstOccurrence && lastOccurrence) {
        replacements.push({
          start: firstOccurrence.start,
          end: lastOccurrence.end,
          replacement: buildMergedTextRunContent(runBlocks, occurrences)
        })
      }
      index = cursor
    }
  }

  return applyTextRunReplacements(markdown, replacements)
}

function cleanupReaderMarkdown(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n+\s*$/g, '')
    .trim()
}

function buildPageComment(pageIndex: number): string {
  return `<!-- Page ${pageIndex + 1} -->`
}

const PAPER_SEQUENCE_ITEM_PATTERN =
  /^ {0,3}(\d{1,2}[.)]\s+)(?:\*\*)?[\p{Lu}A-Z][^:\n]{2,120}:(?:\*\*)?\s+\S/u

function isPaperPageCommentBlock(markdownBlock: string): boolean {
  return /^<!--\s*Page\s+\d+\s*-->$/i.test(markdownBlock.trim())
}

function isRomanSectionHeadingBlock(markdownBlock: string): boolean {
  const text = getPlainText(markdownBlock)
  return /^(?:[IVX]+)\.\s+[A-Z][A-Z0-9\s,;:()/-]{2,}$/.test(text) && text.length <= 120
}

function isPaperSequenceItemBlock(markdownBlock: string): boolean {
  const firstLine = markdownBlock
    .split('\n')
    .map((line) => line.trimEnd())
    .find((line) => line.trim())

  return !!firstLine && PAPER_SEQUENCE_ITEM_PATTERN.test(firstLine)
}

function getPaperSequenceContinuationIndent(markdownBlock: string): string {
  const firstLine = markdownBlock
    .split('\n')
    .map((line) => line.trimEnd())
    .find((line) => line.trim())
  const match = firstLine?.match(PAPER_SEQUENCE_ITEM_PATTERN)
  return ' '.repeat(match?.[1].length ?? 3)
}

function shouldEndPaperSequenceBefore(markdownBlock: string): boolean {
  const trimmed = markdownBlock.trim()
  if (!trimmed || isPaperPageCommentBlock(trimmed)) {
    return false
  }

  if (
    /^#{1,6}\s+/.test(trimmed) ||
    isRomanSectionHeadingBlock(trimmed) ||
    /^(?:<img\b|!\[[^\]]*]\([^)]+\))/i.test(trimmed) ||
    /^\s{0,3}>/.test(trimmed)
  ) {
    return true
  }

  return /^\s{0,3}(?:[-*+]|\d+[.)])\s+\S/.test(trimmed)
}

function indentMarkdownBlock(markdownBlock: string, indentation: string): string {
  return markdownBlock
    .split('\n')
    .map((line) => (line.trim() ? `${indentation}${line}` : line))
    .join('\n')
}

function applyPaperSequenceListIndentation(markdown: string): string {
  const trimmedMarkdown = markdown.trim()
  if (!trimmedMarkdown) {
    return markdown
  }

  const blocks = trimmedMarkdown.split(/\n{2,}/)
  const nextBlocks: string[] = []
  let activeContinuationIndent: string | null = null

  for (const block of blocks) {
    if (isPaperSequenceItemBlock(block)) {
      activeContinuationIndent = getPaperSequenceContinuationIndent(block)
      nextBlocks.push(block)
      continue
    }

    if (activeContinuationIndent && shouldEndPaperSequenceBefore(block)) {
      activeContinuationIndent = null
    }

    nextBlocks.push(
      activeContinuationIndent ? indentMarkdownBlock(block, activeContinuationIndent) : block
    )
  }

  return nextBlocks.join('\n\n')
}

function appendMarkdownBlock(markdown: string, block: string | undefined): string {
  if (!block) {
    return markdown
  }

  if (!markdown) {
    return block
  }

  return `${markdown}\n\n${block}`
}

function findNeighborBlock(
  pageBlocks: PaperLayoutBlock[],
  startPosition: number,
  step: -1 | 1,
  removalIndexes: Set<number>
): PaperLayoutBlock | undefined {
  for (
    let position = startPosition;
    position >= 0 && position < pageBlocks.length;
    position += step
  ) {
    const block = pageBlocks[position]
    if (!removalIndexes.has(block.index)) {
      return block
    }
  }

  return undefined
}

function findBoundaryBlock(
  pageBlocks: PaperLayoutBlock[],
  removalIndexes: Set<number>,
  direction: 'start' | 'end'
): PaperLayoutBlock | undefined {
  const startPosition = direction === 'start' ? 0 : pageBlocks.length - 1
  const step = direction === 'start' ? 1 : -1

  return findNeighborBlock(pageBlocks, startPosition, step, removalIndexes)
}

function collectLeadingFloatingTableBlocks(visibleBlocks: PaperLayoutBlock[]): PaperLayoutBlock[] {
  const leadingBlocks: PaperLayoutBlock[] = []

  for (const block of visibleBlocks) {
    if (block.label === 'table') {
      leadingBlocks.push(block)
      continue
    }

    if (leadingBlocks.length > 0 && isTableCaptionBlock(block)) {
      leadingBlocks.push(block)
      continue
    }

    break
  }

  return leadingBlocks
}

function extractLeadingFloatingTableLayout(
  markdown: string,
  pageBlocks: PaperLayoutBlock[],
  removalIndexes: Set<number>
): Pick<
  ReaderPageFragment,
  | 'leadingContinuationBlock'
  | 'leadingContinuationMarkdown'
  | 'leadingFloatingTableMarkdown'
  | 'markdownAfterLeadingContinuation'
> | null {
  const visibleBlocks = pageBlocks.filter((block) => !removalIndexes.has(block.index))
  const leadingFloatingTableBlocks = collectLeadingFloatingTableBlocks(visibleBlocks)
  if (leadingFloatingTableBlocks.length === 0) {
    return null
  }

  const leadingContinuationBlock = visibleBlocks[leadingFloatingTableBlocks.length]
  if (!isBodyTextBlock(leadingContinuationBlock)) {
    return null
  }

  const occurrences = findBlockOccurrences(markdown, pageBlocks, removalIndexes)
  const firstFloatingOccurrence = occurrences.get(leadingFloatingTableBlocks[0].index)
  const lastFloatingOccurrence = occurrences.get(
    leadingFloatingTableBlocks[leadingFloatingTableBlocks.length - 1].index
  )
  const continuationOccurrence = occurrences.get(leadingContinuationBlock.index)

  if (!firstFloatingOccurrence || !lastFloatingOccurrence || !continuationOccurrence) {
    return null
  }

  if (markdown.slice(0, firstFloatingOccurrence.start).trim()) {
    return null
  }

  if (lastFloatingOccurrence.end > continuationOccurrence.start) {
    return null
  }

  if (markdown.slice(lastFloatingOccurrence.end, continuationOccurrence.start).trim()) {
    return null
  }

  const leadingFloatingTableMarkdown = cleanupReaderMarkdown(
    markdown.slice(firstFloatingOccurrence.start, lastFloatingOccurrence.end)
  )
  const leadingContinuationMarkdown = cleanupReaderMarkdown(
    markdown.slice(continuationOccurrence.start, continuationOccurrence.end)
  )
  const markdownAfterLeadingContinuation = cleanupReaderMarkdown(
    markdown.slice(continuationOccurrence.end)
  )

  if (!leadingFloatingTableMarkdown || !leadingContinuationMarkdown) {
    return null
  }

  return {
    leadingContinuationBlock,
    leadingContinuationMarkdown,
    leadingFloatingTableMarkdown,
    markdownAfterLeadingContinuation
  }
}

function buildReaderPageFragment(
  pageResult: PaperPageOcrResult,
  figureData: Pick<ExtractedPaperFigureData, 'pageRemovalBlockIndexes' | 'pageRemovalGroups'>
): ReaderPageFragment {
  const removalIndexes = new Set(figureData.pageRemovalBlockIndexes[pageResult.pageIndex] || [])

  // 图片块保留在正文中（inline 显示），不再删除 <img> 标记。
  // removalIndexes 仍用于 normalizeVisibleTextBlocks / mergeAdjacentTextBlocks /
  // extractLeadingFloatingTableLayout / findBoundaryBlock 跳过图片块做文本锚点计算
  // （图片不是文本，不应参与锚点）。
  let pageMarkdown = pageResult.markdown

  pageMarkdown = normalizeVisibleTextBlocks(pageMarkdown, pageResult.blocks, removalIndexes)
  pageMarkdown = mergeAdjacentTextBlocks(pageMarkdown, pageResult.blocks, removalIndexes)
  const cleanedMarkdown = cleanupReaderMarkdown(pageMarkdown)
  if (!cleanedMarkdown) {
    return {
      pageIndex: pageResult.pageIndex,
      markdown: ''
    }
  }

  const leadingFloatingTableLayout = extractLeadingFloatingTableLayout(
    cleanedMarkdown,
    pageResult.blocks,
    removalIndexes
  )

  return {
    pageIndex: pageResult.pageIndex,
    markdown: cleanedMarkdown,
    leadingBlock: findBoundaryBlock(pageResult.blocks, removalIndexes, 'start'),
    trailingBlock: findBoundaryBlock(pageResult.blocks, removalIndexes, 'end'),
    ...leadingFloatingTableLayout
  }
}

function createReaderHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function findDocumentBlockOccurrences(
  markdown: string,
  pageResults: PaperPageOcrResult[],
  figureData: Pick<ExtractedPaperFigureData, 'pageRemovalBlockIndexes'>
): ReaderVisibleBlockOccurrence[] {
  const occurrences: ReaderVisibleBlockOccurrence[] = []
  let searchStart = 0

  for (const pageResult of pageResults) {
    const removalIndexes = new Set(figureData.pageRemovalBlockIndexes[pageResult.pageIndex] || [])

    for (const block of pageResult.blocks) {
      if (removalIndexes.has(block.index) || !block.content) {
        continue
      }

      const searchValues = [
        block.content,
        ...(block.label === 'text' ? [normalizeMergeableTextBlockContent(block.content)] : [])
      ].filter((value, index, values) => value && values.indexOf(value) === index)

      let matchedStart = -1
      let matchedContent = ''

      for (const searchValue of searchValues) {
        const start = markdown.indexOf(searchValue, searchStart)
        if (start < 0) {
          continue
        }

        if (matchedStart < 0 || start < matchedStart) {
          matchedStart = start
          matchedContent = searchValue
        }
      }

      if (matchedStart < 0) {
        continue
      }

      const end = matchedStart + matchedContent.length
      occurrences.push({
        pageIndex: pageResult.pageIndex,
        blockIndex: block.index,
        start: matchedStart,
        end
      })
      searchStart = end
    }
  }

  return occurrences
}

function buildSegmentSourceRefs(
  segmentStart: number,
  segmentEnd: number,
  occurrences: ReaderVisibleBlockOccurrence[]
): PaperReaderSegmentSourceRefs {
  const matched = occurrences.filter((occurrence) => {
    return occurrence.start < segmentEnd && occurrence.end > segmentStart
  })

  const pageIndexes = Array.from(new Set(matched.map((occurrence) => occurrence.pageIndex))).sort(
    (left, right) => left - right
  )
  const blockIndexes = Array.from(new Set(matched.map((occurrence) => occurrence.blockIndex))).sort(
    (left, right) => left - right
  )
  const first = matched[0]
  const last = matched[matched.length - 1]

  return {
    pageIndexes,
    blockIndexes,
    start: first
      ? {
          pageIndex: first.pageIndex,
          blockIndex: first.blockIndex
        }
      : undefined,
    end: last
      ? {
          pageIndex: last.pageIndex,
          blockIndex: last.blockIndex
        }
      : undefined
  }
}

function buildReaderSegments(
  paperId: string,
  markdown: string,
  pageResults: PaperPageOcrResult[],
  figureData: Pick<ExtractedPaperFigureData, 'pageRemovalBlockIndexes'>,
  sourceRevisionId: string
): PaperReaderSegment[] {
  const parsedSegments = parsePaperTranslationSegments(markdown)
  const blockOccurrences = findDocumentBlockOccurrences(markdown, pageResults, figureData)
  const duplicateCounts = new Map<string, number>()
  const segments: PaperReaderSegment[] = []
  let searchStart = 0

  for (const segment of parsedSegments) {
    const renderId = segment.id
    const segmentStart = markdown.indexOf(segment.originalMarkdown, searchStart)
    const segmentEnd =
      segmentStart >= 0 ? segmentStart + segment.originalMarkdown.length : searchStart
    const sourceRefs = buildSegmentSourceRefs(segmentStart, segmentEnd, blockOccurrences)
    const textHash = createReaderHash(segment.originalText)
    const stableBase = [
      segment.kind,
      textHash,
      sourceRefs.start?.pageIndex ?? -1,
      sourceRefs.start?.blockIndex ?? -1,
      sourceRefs.end?.pageIndex ?? -1,
      sourceRefs.end?.blockIndex ?? -1
    ].join('|')
    const duplicateOrdinal = (duplicateCounts.get(stableBase) || 0) + 1
    duplicateCounts.set(stableBase, duplicateOrdinal)
    const stableId = createReaderHash(`${paperId}|${stableBase}|${duplicateOrdinal}`)

    segments.push({
      ...segment,
      renderId,
      stableId,
      textHash,
      duplicateOrdinal,
      sourceRevisionId,
      sourceRefs
    })

    if (segmentStart >= 0) {
      searchStart = segmentEnd
    }
  }

  return segments
}

/**
 * 构建完整的阅读器文档
 * 1. 归一化 OCR 结果
 * 2. 合并各页 Markdown，处理跨页段落拼接
 * 3. 分割为段落实体（segments），每段包含原文文本、来源引用等信息
 */
export function buildReaderDocument(
  paperId: string,
  pageResults: PaperPageOcrResult[],
  figureData: Pick<ExtractedPaperFigureData, 'pageRemovalBlockIndexes' | 'pageRemovalGroups'>
): PaperReaderDocument {
  const normalizedPageResults = normalizeReaderPageResults(pageResults)
  const markdown = buildReaderMarkdown(normalizedPageResults, figureData)
  const sourceRevisionId = createReaderHash(markdown)

  return {
    paperId,
    markdown,
    sourceRevisionId,
    updatedAt: new Date().toISOString(),
    segments: buildReaderSegments(
      paperId,
      markdown,
      normalizedPageResults,
      figureData,
      sourceRevisionId
    )
  }
}

/**
 * 构建阅读器 Markdown
 * 合并所有页面，处理跨页边界（浮动表格前移、段落间距优化等）
 */
export function buildReaderMarkdown(
  pageResults: PaperPageOcrResult[],
  figureData: Pick<ExtractedPaperFigureData, 'pageRemovalBlockIndexes' | 'pageRemovalGroups'>
): string {
  const normalizedPageResults = normalizeReaderPageResults(pageResults)
  let combinedMarkdown = ''
  let previousFragment: ReaderPageFragment | null = null
  let encounteredHardBoundary = false

  for (const pageResult of normalizedPageResults) {
    const fragment = buildReaderPageFragment(pageResult, figureData)
    if (!fragment.markdown) {
      encounteredHardBoundary = true
      continue
    }

    if (!previousFragment) {
      combinedMarkdown = `${buildPageComment(fragment.pageIndex)}\n\n${fragment.markdown}`
      previousFragment = fragment
      encounteredHardBoundary = false
      continue
    }

    const boundaryToken = `__PAPER_PAGE_BOUNDARY_${fragment.pageIndex}__`
    const canMergeAcrossLeadingTable =
      !encounteredHardBoundary &&
      !!fragment.leadingFloatingTableMarkdown &&
      !!fragment.leadingContinuationMarkdown &&
      !!fragment.leadingContinuationBlock &&
      getBodyBlockGapReplacement(
        previousFragment.trailingBlock,
        fragment.leadingContinuationBlock
      ) !== '\n\n'

    if (canMergeAcrossLeadingTable) {
      const boundaryGap = getBodyBlockGapReplacement(
        previousFragment.trailingBlock,
        fragment.leadingContinuationBlock
      )

      combinedMarkdown += `${boundaryToken}${buildPageComment(fragment.pageIndex)}${boundaryToken}${fragment.leadingContinuationMarkdown}`
      combinedMarkdown = replaceTokenWithGap(combinedMarkdown, boundaryToken, boundaryGap)
      combinedMarkdown = appendMarkdownBlock(
        combinedMarkdown,
        fragment.leadingFloatingTableMarkdown
      )
      combinedMarkdown = appendMarkdownBlock(
        combinedMarkdown,
        fragment.markdownAfterLeadingContinuation
      )
      previousFragment = fragment
      encounteredHardBoundary = false
      continue
    }

    const boundaryGap = encounteredHardBoundary
      ? '\n\n'
      : getBodyBlockGapReplacement(previousFragment.trailingBlock, fragment.leadingBlock)

    combinedMarkdown += `${boundaryToken}${buildPageComment(fragment.pageIndex)}${boundaryToken}${fragment.markdown}`
    combinedMarkdown = replaceTokenWithGap(combinedMarkdown, boundaryToken, boundaryGap)

    previousFragment = fragment
    encounteredHardBoundary = false
  }

  return applyPaperSequenceListIndentation(combinedMarkdown)
}
