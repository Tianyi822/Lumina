import type { PaperQuoteSurroundingContext } from '../types/chat'
import type { PaperAnnotationTextAnchor } from '../types/paper'
import { findPaperTextAnchorOffset } from './paperAnnotationAnchors'

export const PAPER_QUOTE_CONTEXT_SIDE_UNIT_LIMIT = 2
export const PAPER_QUOTE_CONTEXT_SIDE_CHAR_LIMIT = 360

interface PaperQuoteContextUnit {
  startOffset: number
  endOffset: number
}

const PAPER_QUOTE_CONTEXT_BOUNDARY_PATTERN = /[.!?。！？；;]\s*|\n+/g

function clampOffset(offset: number, textLength: number): number {
  return Math.max(0, Math.min(textLength, offset))
}

function splitPaperQuoteContextUnits(text: string): PaperQuoteContextUnit[] {
  const units: PaperQuoteContextUnit[] = []
  let startOffset = 0

  for (const match of text.matchAll(PAPER_QUOTE_CONTEXT_BOUNDARY_PATTERN)) {
    const boundaryIndex = match.index ?? 0
    const endOffset = boundaryIndex + match[0].length
    if (endOffset <= startOffset) {
      continue
    }

    units.push({ startOffset, endOffset })
    startOffset = endOffset
  }

  if (startOffset < text.length) {
    units.push({ startOffset, endOffset: text.length })
  }

  if (units.length === 0 && text.length > 0) {
    units.push({ startOffset: 0, endOffset: text.length })
  }

  return units
}

function findUnitIndexForOffset(units: PaperQuoteContextUnit[], offset: number): number {
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]
    if (offset >= unit.startOffset && offset <= unit.endOffset) {
      return index
    }
  }

  return Math.max(0, units.length - 1)
}

function resolveSelectionStartOffset(
  text: string,
  anchor: PaperAnnotationTextAnchor
): number | null {
  const resolvedOffset = findPaperTextAnchorOffset(text, anchor)
  if (resolvedOffset !== null) {
    return resolvedOffset
  }

  if (anchor.startOffset >= 0 && anchor.startOffset <= text.length) {
    return clampOffset(anchor.startOffset, text.length)
  }

  return null
}

function trimContextRange(
  text: string,
  contextStartOffset: number,
  contextEndOffset: number,
  selectionStartOffset: number,
  selectionEndOffset: number
): { contextStartOffset: number; contextEndOffset: number } {
  let nextStartOffset = contextStartOffset
  let nextEndOffset = contextEndOffset

  while (nextStartOffset < selectionStartOffset && /\s/.test(text[nextStartOffset])) {
    nextStartOffset += 1
  }

  while (nextEndOffset > selectionEndOffset && /\s/.test(text[nextEndOffset - 1])) {
    nextEndOffset -= 1
  }

  return {
    contextStartOffset: nextStartOffset,
    contextEndOffset: nextEndOffset
  }
}

/**
 * 为论文引用构建围绕用户选区的模型上下文。
 * 上下文被限制在当前渲染段内，UI 仍以 selectedText/textAnchor 作为主引用。
 */
export function buildPaperQuoteContext(
  text: string,
  anchor: PaperAnnotationTextAnchor
): PaperQuoteSurroundingContext {
  const textLength = text.length
  const selectionStartOffset = resolveSelectionStartOffset(text, anchor)
  const fallbackStartOffset = clampOffset(anchor.startOffset, textLength)
  const startOffset = selectionStartOffset ?? fallbackStartOffset
  const anchorLength = Math.max(anchor.selectedText.length, anchor.endOffset - anchor.startOffset, 0)
  const endOffset = clampOffset(Math.max(startOffset, startOffset + anchorLength), textLength)
  const units = splitPaperQuoteContextUnits(text)

  let contextStartOffset = startOffset
  let contextEndOffset = endOffset

  if (units.length > 0) {
    const startUnitIndex = findUnitIndexForOffset(units, startOffset)
    const endUnitIndex = findUnitIndexForOffset(units, Math.max(startOffset, endOffset - 1))
    const contextStartUnitIndex = Math.max(0, startUnitIndex - PAPER_QUOTE_CONTEXT_SIDE_UNIT_LIMIT)
    const contextEndUnitIndex = Math.min(
      units.length - 1,
      endUnitIndex + PAPER_QUOTE_CONTEXT_SIDE_UNIT_LIMIT
    )

    contextStartOffset = units[contextStartUnitIndex].startOffset
    contextEndOffset = units[contextEndUnitIndex].endOffset
  }

  contextStartOffset = Math.max(
    contextStartOffset,
    Math.max(0, startOffset - PAPER_QUOTE_CONTEXT_SIDE_CHAR_LIMIT)
  )
  contextEndOffset = Math.min(
    contextEndOffset,
    Math.min(textLength, endOffset + PAPER_QUOTE_CONTEXT_SIDE_CHAR_LIMIT)
  )

  const trimmedRange = trimContextRange(
    text,
    contextStartOffset,
    contextEndOffset,
    startOffset,
    endOffset
  )
  contextStartOffset = trimmedRange.contextStartOffset
  contextEndOffset = trimmedRange.contextEndOffset

  return {
    beforeText: text.slice(contextStartOffset, startOffset),
    afterText: text.slice(endOffset, contextEndOffset),
    contextualText: text.slice(contextStartOffset, contextEndOffset),
    selectedStartOffset: startOffset - contextStartOffset,
    selectedEndOffset: endOffset - contextStartOffset,
    contextStartOffset,
    contextEndOffset
  }
}
