import type { RenderedSegment } from './usePaperMarkdownEngine'

/** 各类型最小占位高度（仅防 0，不宜过大，否则会撑出段间空白） */
const MIN_HEIGHT_BY_KIND: Record<string, number> = {
  heading: 32,
  paragraph: 24,
  list: 24,
  table: 80,
  code: 24,
  quote: 24,
  image: 40
}

/** 与 .paper-markdown-view__markdown 一致：font-size 15px × line-height 1.75 */
const MARKDOWN_FONT_SIZE_PX = 15
const MARKDOWN_LINE_HEIGHT_RATIO = 1.75
const LINE_HEIGHT_ESTIMATE = Math.ceil(MARKDOWN_FONT_SIZE_PX * MARKDOWN_LINE_HEIGHT_RATIO)
const LIST_ITEM_HEIGHT = LINE_HEIGHT_ESTIMATE + 4
const LIST_ITEM_LONG_LINE_CHARS = 52
const LIST_BLOCK_MARGIN = 20
const NESTED_LIST_BONUS_PER_LEVEL = 8
const TABLE_ROW_HEIGHT = 40
const TABLE_HEADER_EXTRA = 44
const TABLE_MATH_CELL_EXTRA = 32
const DISPLAY_MATH_BLOCK_HEIGHT = 60
/** .katex-display { margin: 1.25em 0 } 上下各 1.25em */
const DISPLAY_MATH_BLOCK_MARGIN = Math.ceil(MARKDOWN_FONT_SIZE_PX * 1.25 * 2)
const INLINE_MATH_EXTRA = 12
const LONG_TEXT_CHAR_THRESHOLD = 3000
const TRANSLATION_PLACEHOLDER_HEIGHT = 100
const TRANSLATION_BLOCK_GAP = 12

const INLINE_MATH_PATTERN = /\$[^$\n]+?\$/g
const DISPLAY_MATH_PATTERN = /\$\$[\s\S]*?\$\$/g
const DISPLAY_MATH_STRIP_PATTERN = /\$\$[\s\S]*?\$\$/
const INLINE_MATH_STRIP_PATTERN = /\$[^$\n]+?\$/
const LIST_ITEM_LINE_PATTERN = /^\s*(?:[-*+]|\d+[.)])\s+\S/
const HTML_TABLE_ROW_PATTERN = /<tr\b/gi

const TEXT_CHARS_PER_LINE: Record<string, number> = {
  heading: 48,
  paragraph: 88,
  list: 80,
  quote: 80,
  table: 72,
  code: 96,
  image: 88
}

const MARKDOWN_TABLE_SEPARATOR_PATTERN = /^\|?[\s|:-]+\|?[\s|:-]*$/

function estimateTextHeight(kind: string, text: string): number {
  const trimmed = text.trim()
  if (!trimmed) {
    return 0
  }

  const charsPerLine = TEXT_CHARS_PER_LINE[kind] ?? TEXT_CHARS_PER_LINE.paragraph
  const linesHeight = trimmed
    .split(/\n+/)
    .reduce(
      (height, line) =>
        height + Math.max(1, Math.ceil(line.trim().length / charsPerLine)) * LINE_HEIGHT_ESTIMATE,
      0
    )

  // 段落内部的 <p> 上下 margin（0.8em）已由 CSS > :first-child/:last-child 规则在首尾置零，
  // 不再额外估算 block margin，避免虚拟列表回退估算值时段间距膨胀
  return linesHeight
}

function countInlineMathMarkers(text: string): number {
  return [...text.matchAll(INLINE_MATH_PATTERN)].length
}

function countDisplayMathBlocks(text: string): number {
  return [...text.matchAll(DISPLAY_MATH_PATTERN)].length
}

function countListItems(text: string): number {
  const itemCount = text
    .trim()
    .split(/\n+/)
    .filter((line) => LIST_ITEM_LINE_PATTERN.test(line)).length

  return Math.max(itemCount, 1)
}

function countNestedListLevels(text: string): number {
  const matches = text.match(/^\s{2,}(?:[-*+]|\d+[.)])\s+/gm)
  return matches?.length ?? 0
}

function estimateListItemWrapLines(text: string): number {
  let extraLines = 0

  for (const line of text.trim().split(/\n+/)) {
    if (!LIST_ITEM_LINE_PATTERN.test(line)) {
      continue
    }

    const content = line.replace(LIST_ITEM_LINE_PATTERN, '').trim()
    if (content.length > LIST_ITEM_LONG_LINE_CHARS) {
      extraLines += Math.ceil(content.length / LIST_ITEM_LONG_LINE_CHARS) - 1
    }
  }

  return extraLines
}

function estimateMathLayoutExtra(text: string, kind: string): number {
  const inlineCount = countInlineMathMarkers(text)
  const displayCount = countDisplayMathBlocks(text)

  if (kind === 'table') {
    return (
      inlineCount * TABLE_MATH_CELL_EXTRA +
      displayCount * (INLINE_MATH_EXTRA + TABLE_MATH_CELL_EXTRA)
    )
  }

  const displayExtra = displayCount * (DISPLAY_MATH_BLOCK_HEIGHT + DISPLAY_MATH_BLOCK_MARGIN)
  return inlineCount * INLINE_MATH_EXTRA + displayExtra
}

function isDisplayMathDominantText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }

  const displayCount = countDisplayMathBlocks(trimmed)
  if (displayCount === 0) {
    return false
  }

  const withoutMath = trimmed
    .replace(DISPLAY_MATH_STRIP_PATTERN, '')
    .replace(INLINE_MATH_STRIP_PATTERN, '')
    .trim()

  return withoutMath.length <= 48
}

function estimateListHeight(text: string): number {
  const floor = MIN_HEIGHT_BY_KIND.list
  const itemCount = countListItems(text)
  const wrapLines = estimateListItemWrapLines(text)
  const nestedBonus = countNestedListLevels(text) * NESTED_LIST_BONUS_PER_LEVEL

  return Math.max(
    floor,
    LIST_BLOCK_MARGIN +
      itemCount * LIST_ITEM_HEIGHT +
      wrapLines * LINE_HEIGHT_ESTIMATE +
      nestedBonus +
      estimateMathLayoutExtra(text, 'list')
  )
}

function estimateTableRowCount(text: string): number {
  const htmlRowCount = text.match(HTML_TABLE_ROW_PATTERN)?.length ?? 0
  if (htmlRowCount > 0) {
    return Math.max(htmlRowCount, 1)
  }

  const lines = text.trim().split(/\n+/)
  if (lines.length === 0) {
    return 1
  }

  const contentRows = lines.filter((line) => !MARKDOWN_TABLE_SEPARATOR_PATTERN.test(line.trim()))
  return Math.max(contentRows.length, 1)
}

function estimateTableMaxColumnCount(text: string): number {
  if (/<table\b/i.test(text)) {
    const rowMatches = text.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []
    let maxColumns = 1

    for (const row of rowMatches) {
      const cellCount = (row.match(/<t[dh]\b/gi) ?? []).length
      if (cellCount > maxColumns) {
        maxColumns = cellCount
      }
    }

    return maxColumns
  }

  let maxColumns = 1

  for (const line of text.trim().split(/\n+/)) {
    if (MARKDOWN_TABLE_SEPARATOR_PATTERN.test(line.trim())) {
      continue
    }

    const columns = line.split('|').filter((cell) => cell.trim().length > 0).length
    if (columns > maxColumns) {
      maxColumns = columns
    }
  }

  return maxColumns
}

function estimateTableHeight(text: string): number {
  const rowCount = estimateTableRowCount(text)
  const floor = MIN_HEIGHT_BY_KIND.table
  const columnCount = estimateTableMaxColumnCount(text)
  const denseRowBonus = columnCount > 5 ? Math.min(24, (columnCount - 5) * 4) : 0
  const rowHeight = TABLE_ROW_HEIGHT + denseRowBonus

  return Math.max(
    floor,
    TABLE_HEADER_EXTRA + rowCount * rowHeight + estimateMathLayoutExtra(text, 'table')
  )
}

/** 根据段落元数据估算高度（仅作虚拟列表初值，真实高度由 DOM measureElement 决定） */
/** 估算段落在虚拟列表中的初始高度，后续由 DOM measureElement 校正 */
export function estimateSegmentHeight(segment: RenderedSegment): number {
  const floor = MIN_HEIGHT_BY_KIND[segment.kind] ?? 24
  let originalEstimate =
    segment.kind === 'table'
      ? estimateTableHeight(segment.originalText)
      : segment.kind === 'list'
        ? estimateListHeight(segment.originalText)
        : Math.max(
            floor,
            estimateTextHeight(segment.kind, segment.originalText) +
              estimateMathLayoutExtra(segment.originalText, segment.kind)
          )

  if (
    (segment.kind === 'paragraph' || segment.kind === 'list') &&
    isDisplayMathDominantText(segment.originalText)
  ) {
    const displayCount = countDisplayMathBlocks(segment.originalText)
    originalEstimate = Math.max(
      originalEstimate,
      displayCount * (DISPLAY_MATH_BLOCK_HEIGHT + DISPLAY_MATH_BLOCK_MARGIN) + 16
    )
  }

  if (
    (segment.kind === 'paragraph' || segment.kind === 'code') &&
    segment.originalText.length > LONG_TEXT_CHAR_THRESHOLD
  ) {
    originalEstimate = Math.max(
      originalEstimate,
      Math.ceil(estimateTextHeight(segment.kind, segment.originalText) * 1.08)
    )
  }

  if (segment.showTranslation) {
    const translationEstimate = segment.translationText
      ? segment.kind === 'table'
        ? estimateTableHeight(segment.translationText)
        : segment.kind === 'list'
          ? estimateListHeight(segment.translationText)
          : Math.max(floor, estimateTextHeight(segment.kind, segment.translationText))
      : TRANSLATION_PLACEHOLDER_HEIGHT

    return originalEstimate + translationEstimate + TRANSLATION_BLOCK_GAP
  }

  return originalEstimate
}

/** 生成段落列表的布局缓存键，用于判断是否需要重新估算高度 */
export function getSegmentsLayoutKey(segments: RenderedSegment[]): string {
  return segments
    .map((segment) =>
      [
        segment.stableId,
        segment.textHash,
        segment.sourceRevisionId,
        segment.showTranslation ? '1' : '0',
        segment.translationStatus,
        segment.translationHtml?.length ?? 0
      ].join(':')
    )
    .join('|')
}
