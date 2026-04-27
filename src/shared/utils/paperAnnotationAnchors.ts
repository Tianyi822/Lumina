import type { PaperAnnotationTextAnchor } from '../types/paper'

const PAPER_ANCHOR_FRAGMENT_LENGTH = 24
const PAPER_ALIGNMENT_PUNCTUATION_PATTERN = /[.!?。！？；;:：,，、]\s*|\n+/g

interface PaperAlignmentUnit {
  startOffset: number
  endOffset: number
}

export interface PaperTextAnchorAlignmentResult {
  anchor: PaperAnnotationTextAnchor
  confidence: number
  strategy: 'sentence' | 'proportional'
}

function clampOffset(offset: number, textLength: number): number {
  return Math.max(0, Math.min(textLength, offset))
}

function normalizeAnchorText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function buildAnchorFragments(selectedText: string): string[] {
  const trimmed = normalizeAnchorText(selectedText)
  if (!trimmed) {
    return []
  }

  const fragments = new Set<string>([trimmed])

  if (trimmed.length > PAPER_ANCHOR_FRAGMENT_LENGTH) {
    fragments.add(trimmed.slice(0, PAPER_ANCHOR_FRAGMENT_LENGTH))
    fragments.add(trimmed.slice(-PAPER_ANCHOR_FRAGMENT_LENGTH))
  }

  return Array.from(fragments).filter(Boolean)
}

function scoreContextMatch(
  text: string,
  anchor: PaperAnnotationTextAnchor,
  startOffset: number
): number {
  const prefixStart = Math.max(0, startOffset - anchor.prefixText.length)
  const actualPrefix = text.slice(prefixStart, startOffset)
  const actualSuffix = text.slice(startOffset + anchor.selectedText.length)
  let score = 0

  if (anchor.prefixText && actualPrefix.endsWith(anchor.prefixText)) {
    score += anchor.prefixText.length * 2
  } else if (anchor.prefixText && actualPrefix.length > 0) {
    let matchLen = 0
    while (
      matchLen < Math.min(anchor.prefixText.length, actualPrefix.length) &&
      anchor.prefixText[anchor.prefixText.length - 1 - matchLen] ===
        actualPrefix[actualPrefix.length - 1 - matchLen]
    ) {
      matchLen += 1
    }
    if (matchLen >= anchor.prefixText.length * 0.5) {
      score += matchLen
    }
  }

  if (anchor.suffixText && actualSuffix.startsWith(anchor.suffixText)) {
    score += anchor.suffixText.length * 2
  } else if (anchor.suffixText && actualSuffix.length > 0) {
    let matchLen = 0
    while (
      matchLen < Math.min(anchor.suffixText.length, actualSuffix.length) &&
      anchor.suffixText[matchLen] === actualSuffix[matchLen]
    ) {
      matchLen += 1
    }
    if (matchLen >= anchor.suffixText.length * 0.5) {
      score += matchLen
    }
  }

  if (startOffset === anchor.startOffset) {
    score += 3
  }

  return score
}

function collectCandidateOffsets(text: string, candidate: string): number[] {
  if (!candidate) {
    return []
  }

  const offsets: number[] = []
  let searchStart = 0

  while (searchStart <= text.length) {
    const nextIndex = text.indexOf(candidate, searchStart)
    if (nextIndex < 0) {
      break
    }

    offsets.push(nextIndex)
    searchStart = nextIndex + Math.max(candidate.length, 1)
  }

  return offsets
}

function findOffsetFromContextWindow(
  text: string,
  anchor: PaperAnnotationTextAnchor
): number | null {
  const trimmedPrefix = anchor.prefixText.trim()
  const trimmedSuffix = anchor.suffixText.trim()
  let bestOffset: number | null = null
  let bestScore = -1

  if (trimmedPrefix) {
    for (const prefixOffset of collectCandidateOffsets(text, trimmedPrefix)) {
      const nextOffset = prefixOffset + trimmedPrefix.length
      const score = scoreContextMatch(text, anchor, nextOffset)
      if (score > bestScore) {
        bestScore = score
        bestOffset = nextOffset
      }
    }
  }

  if (trimmedSuffix) {
    for (const suffixOffset of collectCandidateOffsets(text, trimmedSuffix)) {
      const nextOffset = Math.max(0, suffixOffset - anchor.selectedText.length)
      const score = scoreContextMatch(text, anchor, nextOffset)
      if (score > bestScore) {
        bestScore = score
        bestOffset = nextOffset
      }
    }
  }

  return bestOffset
}

function splitPaperAlignmentUnits(text: string): PaperAlignmentUnit[] {
  const units: PaperAlignmentUnit[] = []
  const boundaries = Array.from(text.matchAll(PAPER_ALIGNMENT_PUNCTUATION_PATTERN))
  let startOffset = 0

  for (const boundary of boundaries) {
    const matchedText = boundary[0]
    const boundaryIndex = boundary.index ?? 0
    const endOffset = boundaryIndex + matchedText.length
    if (endOffset <= startOffset) {
      continue
    }

    units.push({
      startOffset,
      endOffset
    })
    startOffset = endOffset
  }

  if (startOffset < text.length) {
    units.push({
      startOffset,
      endOffset: text.length
    })
  }

  if (units.length === 0 && text.length > 0) {
    units.push({
      startOffset: 0,
      endOffset: text.length
    })
  }

  const mergedUnits: PaperAlignmentUnit[] = []
  for (const unit of units) {
    const trimmedLength = text.slice(unit.startOffset, unit.endOffset).trim().length
    const previousUnit = mergedUnits[mergedUnits.length - 1]

    if (trimmedLength <= 8 && previousUnit) {
      previousUnit.endOffset = unit.endOffset
      continue
    }

    mergedUnits.push({ ...unit })
  }

  return mergedUnits
}

function findUnitIndexForOffset(units: PaperAlignmentUnit[], offset: number): number {
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index]
    if (offset >= unit.startOffset && offset <= unit.endOffset) {
      return index
    }
  }

  return Math.max(0, units.length - 1)
}

export function buildPaperTextAnchor(
  textContent: string,
  startOffset: number,
  endOffset: number
): PaperAnnotationTextAnchor {
  const nextStartOffset = clampOffset(startOffset, textContent.length)
  const nextEndOffset = clampOffset(Math.max(endOffset, nextStartOffset), textContent.length)

  return {
    selectedText: textContent.slice(nextStartOffset, nextEndOffset),
    prefixText: textContent.slice(Math.max(0, nextStartOffset - 32), nextStartOffset),
    suffixText: textContent.slice(nextEndOffset, Math.min(textContent.length, nextEndOffset + 32)),
    startOffset: nextStartOffset,
    endOffset: nextEndOffset,
    normalizedText: normalizeAnchorText(textContent.slice(nextStartOffset, nextEndOffset))
  }
}

export function findPaperTextAnchorOffset(
  text: string,
  anchor: PaperAnnotationTextAnchor
): number | null {
  if (!anchor.selectedText) {
    return null
  }

  const exactSlice = text.slice(anchor.startOffset, anchor.endOffset)
  if (exactSlice === anchor.selectedText) {
    const actualPrefix = text.slice(
      Math.max(0, anchor.startOffset - anchor.prefixText.length),
      anchor.startOffset
    )
    const actualSuffix = text.slice(anchor.startOffset + anchor.selectedText.length)

    const prefixOk = !anchor.prefixText || actualPrefix.endsWith(anchor.prefixText)
    const suffixOk = !anchor.suffixText || actualSuffix.startsWith(anchor.suffixText)

    if (prefixOk && suffixOk) {
      return anchor.startOffset
    }
  }

  let bestOffset: number | null = null
  let bestScore = -1
  const visitedOffsets = new Set<number>()

  for (const fragment of buildAnchorFragments(anchor.selectedText)) {
    for (const offset of collectCandidateOffsets(text, fragment)) {
      if (visitedOffsets.has(offset)) {
        continue
      }

      visitedOffsets.add(offset)
      const score = scoreContextMatch(text, anchor, offset)
      if (score > bestScore) {
        bestScore = score
        bestOffset = offset
      }
    }
  }

  const contextOffset = findOffsetFromContextWindow(text, anchor)
  if (contextOffset !== null) {
    const score = scoreContextMatch(text, anchor, contextOffset)
    if (score > bestScore) {
      bestScore = score
      bestOffset = contextOffset
    }
  }

  return bestOffset
}

export function mapPaperTextAnchorBetweenTexts(
  sourceText: string,
  targetText: string,
  sourceAnchor: PaperAnnotationTextAnchor
): PaperTextAnchorAlignmentResult | null {
  if (!sourceText || !targetText || sourceAnchor.endOffset <= sourceAnchor.startOffset) {
    return null
  }

  const sourceUnits = splitPaperAlignmentUnits(sourceText)
  const targetUnits = splitPaperAlignmentUnits(targetText)
  if (sourceUnits.length === 0 || targetUnits.length === 0) {
    return null
  }

  const sourceStartIndex = findUnitIndexForOffset(sourceUnits, sourceAnchor.startOffset)
  const sourceEndIndex = findUnitIndexForOffset(
    sourceUnits,
    Math.max(sourceAnchor.startOffset, sourceAnchor.endOffset - 1)
  )
  const sourceUnitStartRatio = sourceStartIndex / sourceUnits.length
  const sourceUnitEndRatio = (sourceEndIndex + 1) / sourceUnits.length
  const targetStartIndex = Math.min(
    targetUnits.length - 1,
    Math.max(0, Math.floor(sourceUnitStartRatio * targetUnits.length))
  )
  const targetEndIndex = Math.min(
    targetUnits.length - 1,
    Math.max(targetStartIndex, Math.ceil(sourceUnitEndRatio * targetUnits.length) - 1)
  )

  const sourceStartUnit = sourceUnits[sourceStartIndex]
  const sourceEndUnit = sourceUnits[sourceEndIndex]
  const targetStartUnit = targetUnits[targetStartIndex]
  const targetEndUnit = targetUnits[targetEndIndex]

  const sourceStartSpanLength = Math.max(1, sourceStartUnit.endOffset - sourceStartUnit.startOffset)
  const sourceEndSpanLength = Math.max(1, sourceEndUnit.endOffset - sourceEndUnit.startOffset)
  const targetStartSpanLength = Math.max(1, targetStartUnit.endOffset - targetStartUnit.startOffset)
  const targetEndSpanLength = Math.max(1, targetEndUnit.endOffset - targetEndUnit.startOffset)

  const startRatio =
    (sourceAnchor.startOffset - sourceStartUnit.startOffset) / sourceStartSpanLength
  const endRatio = (sourceAnchor.endOffset - sourceEndUnit.startOffset) / sourceEndSpanLength

  const mappedStartOffset =
    targetStartUnit.startOffset + Math.round(startRatio * targetStartSpanLength)
  const mappedEndOffset = targetEndUnit.startOffset + Math.round(endRatio * targetEndSpanLength)

  const nextStartOffset = clampOffset(mappedStartOffset, targetText.length)
  let nextEndOffset = clampOffset(mappedEndOffset, targetText.length)

  if (nextEndOffset <= nextStartOffset) {
    nextEndOffset = Math.min(
      targetText.length,
      Math.max(nextStartOffset + 1, targetEndUnit.endOffset)
    )
  }

  const anchor = buildPaperTextAnchor(targetText, nextStartOffset, nextEndOffset)
  if (!anchor.selectedText.trim()) {
    return null
  }

  const unitCountGap = Math.abs(sourceUnits.length - targetUnits.length)
  const selectionSpanUnits = sourceEndIndex - sourceStartIndex + 1
  const targetLengthRatio =
    anchor.selectedText.length / Math.max(sourceAnchor.selectedText.length, 1)
  const isSentenceStrategy = sourceUnits.length > 1 || targetUnits.length > 1

  let confidence = isSentenceStrategy ? 0.56 : 0.42
  if (unitCountGap === 0) {
    confidence += 0.16
  } else if (unitCountGap <= 1) {
    confidence += 0.08
  }
  if (selectionSpanUnits <= 2) {
    confidence += 0.08
  }
  if (targetLengthRatio >= 0.35 && targetLengthRatio <= 2.8) {
    confidence += 0.06
  }

  return {
    anchor,
    confidence: Math.min(0.92, confidence),
    strategy: isSentenceStrategy ? 'sentence' : 'proportional'
  }
}
