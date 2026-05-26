import type { PaperAnnotationTextAnchor } from '../types/paper'
import {
  isInvisibleFormatCharacter,
  removeInvisibleFormatCharacters,
  trimTextBoundaryRange
} from './textBoundary'

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

export interface PaperTextAnchorRange {
  startOffset: number
  endOffset: number
}

function clampOffset(offset: number, textLength: number): number {
  return Math.max(0, Math.min(textLength, offset))
}

/**
 * 归一化公式内部空白：将 $...$ 和 $$...$$ 内的空白去除，
 * 模拟 readKatexTex 从 KaTeX annotation 元素 .trim() 的行为。
 * 例如 "$ L_{train} $" → "$L_{train}$"
 */
export function normalizeFormulaSpacing(text: string): string {
  if (!text.includes('$')) {
    return text
  }

  // 先处理 $$...$$（display math），再处理 $...$（inline math）
  let result = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, content) => {
    return `$$${content.replace(/\s+/g, '')}$$`
  })
  result = result.replace(/\$([^\n$]+?)\$/g, (_match, content) => {
    return `$${content.replace(/\s+/g, '')}$`
  })

  return result
}

export interface FormulaNormOffsetMap {
  normalized: string
  /** normToOriginal[i] 表示归一化文本边界 i 对应原始文本边界 */
  normToOriginal: number[]
}

interface FormulaNormOffsetMapOptions {
  skipInvisibleFormatCharacters?: boolean
}

function isFormulaWhitespace(character: string): boolean {
  return /\s/.test(character)
}

function buildFormulaNormOffsetMapInternal(
  text: string,
  options: FormulaNormOffsetMapOptions = {}
): FormulaNormOffsetMap {
  const normalizedChars: string[] = []
  const normToOriginal: number[] = []

  function emitCharacter(character: string, originalOffset: number): void {
    if (options.skipInvisibleFormatCharacters && isInvisibleFormatCharacter(character)) {
      return
    }

    normalizedChars.push(character)
    normToOriginal.push(originalOffset)
  }

  let index = 0
  while (index < text.length) {
    // 检测 $$...$$（display math）
    if (text[index] === '$' && index + 1 < text.length && text[index + 1] === '$') {
      emitCharacter('$', index)
      emitCharacter('$', index + 1)
      index += 2
      // 找到对应的结束 $$
      const endOffset = text.indexOf('$$', index)
      if (endOffset >= 0) {
        for (let ci = index; ci < endOffset; ci += 1) {
          if (!isFormulaWhitespace(text[ci])) {
            emitCharacter(text[ci], ci)
          }
        }
        emitCharacter('$', endOffset)
        emitCharacter('$', endOffset + 1)
        index = endOffset + 2
      } else {
        // 未闭合的 $$，按原样输出剩余字符
        while (index < text.length) {
          emitCharacter(text[index], index)
          index += 1
        }
      }
      continue
    }

    // 检测 $...$（inline math）
    if (text[index] === '$') {
      emitCharacter('$', index)
      index += 1
      // 找到对应的结束 $
      let endOffset = -1
      for (let si = index; si < text.length; si += 1) {
        if (text[si] === '$') {
          endOffset = si
          break
        }
        if (text[si] === '\n') {
          break
        }
      }
      if (endOffset >= 0) {
        for (let ci = index; ci < endOffset; ci += 1) {
          if (!isFormulaWhitespace(text[ci])) {
            emitCharacter(text[ci], ci)
          }
        }
        emitCharacter('$', endOffset)
        index = endOffset + 1
      } else {
        // 未闭合的 $，按原样输出剩余字符
        while (index < text.length) {
          emitCharacter(text[index], index)
          index += 1
        }
      }
      continue
    }

    // 非公式字符，原样输出
    emitCharacter(text[index], index)
    index += 1
  }

  normToOriginal.push(text.length)

  return {
    normalized: normalizedChars.join(''),
    normToOriginal
  }
}

/**
 * 构建公式空格归一化的偏移量映射。
 * 返回归一化文本以及从归一化边界到原始边界的映射数组。
 */
export function buildFormulaNormOffsetMap(text: string): FormulaNormOffsetMap {
  return buildFormulaNormOffsetMapInternal(text)
}

function buildAnchorSearchOffsetMap(text: string): FormulaNormOffsetMap {
  return buildFormulaNormOffsetMapInternal(text, { skipInvisibleFormatCharacters: true })
}

function normalizeAnchorText(text: string): string {
  return normalizeFormulaSpacing(removeInvisibleFormatCharacters(text).replace(/\s+/g, ' ').trim())
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
  range: PaperTextAnchorRange
): number {
  const prefixStart = Math.max(0, range.startOffset - anchor.prefixText.length)
  const actualPrefix = text.slice(prefixStart, range.startOffset)
  const actualSuffix = text.slice(range.endOffset)
  const expectedPrefix = removeInvisibleFormatCharacters(anchor.prefixText)
  const expectedSuffix = removeInvisibleFormatCharacters(anchor.suffixText)
  const comparablePrefix = removeInvisibleFormatCharacters(actualPrefix)
  const comparableSuffix = removeInvisibleFormatCharacters(actualSuffix)
  let score = 0

  if (expectedPrefix && comparablePrefix.endsWith(expectedPrefix)) {
    score += expectedPrefix.length * 2
  } else if (expectedPrefix && comparablePrefix.length > 0) {
    let matchLen = 0
    while (
      matchLen < Math.min(expectedPrefix.length, comparablePrefix.length) &&
      expectedPrefix[expectedPrefix.length - 1 - matchLen] ===
        comparablePrefix[comparablePrefix.length - 1 - matchLen]
    ) {
      matchLen += 1
    }
    if (matchLen >= expectedPrefix.length * 0.5) {
      score += matchLen
    }
  }

  if (expectedSuffix && comparableSuffix.startsWith(expectedSuffix)) {
    score += expectedSuffix.length * 2
  } else if (expectedSuffix && comparableSuffix.length > 0) {
    let matchLen = 0
    while (
      matchLen < Math.min(expectedSuffix.length, comparableSuffix.length) &&
      expectedSuffix[matchLen] === comparableSuffix[matchLen]
    ) {
      matchLen += 1
    }
    if (matchLen >= expectedSuffix.length * 0.5) {
      score += matchLen
    }
  }

  if (range.startOffset === anchor.startOffset) {
    score += 3
  }

  if (range.endOffset === anchor.endOffset) {
    score += 2
  }

  return score
}

function collectInvisibleInsensitiveCandidateOffsets(text: string, candidate: string): number[] {
  const normalizedCandidate = removeInvisibleFormatCharacters(candidate)
  if (!normalizedCandidate) {
    return []
  }

  let normalizedText = ''
  const offsetMap: number[] = []
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (isInvisibleFormatCharacter(character)) {
      continue
    }

    normalizedText += character
    offsetMap.push(index)
  }

  const offsets: number[] = []
  let searchStart = 0
  while (searchStart <= normalizedText.length) {
    const nextIndex = normalizedText.indexOf(normalizedCandidate, searchStart)
    if (nextIndex < 0) {
      break
    }

    const offset = offsetMap[nextIndex]
    if (offset !== undefined) {
      offsets.push(offset)
    }
    searchStart = nextIndex + Math.max(normalizedCandidate.length, 1)
  }

  return offsets
}

/**
 * 在归一化公式空格的文本空间中搜索候选字符串，
 * 并将匹配位置映射回原始文本偏移量。
 * 处理候选本身无空格（如 "$L_{train}$"）但目标文本有空格（如 "$ L_{train} $"）的情况。
 */
function collectFormulaNormalizedCandidateOffsets(text: string, candidate: string): number[] {
  const map = buildFormulaNormOffsetMap(text)
  // 文本本身没有公式空格差异，跳过
  if (map.normalized === text) {
    return []
  }

  const normalizedCandidate = normalizeFormulaSpacing(candidate)
  if (!normalizedCandidate) {
    return []
  }

  const offsets: number[] = []
  let searchStart = 0
  while (searchStart <= map.normalized.length) {
    const nextIndex = map.normalized.indexOf(normalizedCandidate, searchStart)
    if (nextIndex < 0) {
      break
    }

    const originalOffset = map.normToOriginal[nextIndex]
    if (originalOffset !== undefined) {
      offsets.push(originalOffset)
    }
    searchStart = nextIndex + Math.max(normalizedCandidate.length, 1)
  }

  return offsets
}

function collectCandidateOffsets(text: string, candidate: string): number[] {
  if (!candidate) {
    return []
  }

  const offsets = new Set<number>()
  let searchStart = 0

  while (searchStart <= text.length) {
    const nextIndex = text.indexOf(candidate, searchStart)
    if (nextIndex < 0) {
      break
    }

    offsets.add(nextIndex)
    searchStart = nextIndex + Math.max(candidate.length, 1)
  }

  collectInvisibleInsensitiveCandidateOffsets(text, candidate).forEach((offset) => {
    offsets.add(offset)
  })

  // 公式空格归一化搜索：处理 "$L_{train}$" 与 "$ L_{train} $" 的差异
  collectFormulaNormalizedCandidateOffsets(text, candidate).forEach((offset) => {
    offsets.add(offset)
  })

  return Array.from(offsets).sort((left, right) => left - right)
}

function resolveNormalizedCandidateRange(
  text: string,
  startOffset: number,
  candidate: string,
  buildOffsetMap: (text: string) => FormulaNormOffsetMap
): PaperTextAnchorRange | null {
  const candidateMap = buildOffsetMap(candidate)
  if (!candidateMap.normalized) {
    return null
  }

  const textMap = buildOffsetMap(text)
  let searchStart = 0
  while (searchStart <= textMap.normalized.length) {
    const normalizedStartOffset = textMap.normalized.indexOf(candidateMap.normalized, searchStart)
    if (normalizedStartOffset < 0) {
      break
    }

    const normalizedEndOffset = normalizedStartOffset + candidateMap.normalized.length
    const originalStartOffset = textMap.normToOriginal[normalizedStartOffset]
    const originalEndOffset = textMap.normToOriginal[normalizedEndOffset]

    if (originalStartOffset === startOffset && originalEndOffset !== undefined) {
      return {
        startOffset: originalStartOffset,
        endOffset: originalEndOffset
      }
    }

    searchStart = normalizedStartOffset + Math.max(candidateMap.normalized.length, 1)
  }

  return null
}

function resolveSelectedTextRangeAtOffset(
  text: string,
  startOffset: number,
  selectedText: string
): PaperTextAnchorRange | null {
  const nextStartOffset = clampOffset(startOffset, text.length)
  const exactEndOffset = clampOffset(nextStartOffset + selectedText.length, text.length)
  if (text.slice(nextStartOffset, exactEndOffset) === selectedText) {
    return {
      startOffset: nextStartOffset,
      endOffset: exactEndOffset
    }
  }

  return (
    resolveNormalizedCandidateRange(
      text,
      nextStartOffset,
      selectedText,
      buildAnchorSearchOffsetMap
    ) ||
    resolveNormalizedCandidateRange(text, nextStartOffset, selectedText, buildFormulaNormOffsetMap)
  )
}

function buildFallbackAnchorRange(
  text: string,
  startOffset: number,
  selectedText: string
): PaperTextAnchorRange | null {
  const fallbackEndOffset = clampOffset(startOffset + selectedText.length, text.length)
  const trimmedRange = trimTextBoundaryRange(text, startOffset, fallbackEndOffset)
  if (!trimmedRange) {
    return null
  }

  return trimmedRange
}

function resolveInvisibleInsensitiveEndOffset(
  text: string,
  startOffset: number,
  selectedText: string
): number {
  return (
    resolveNormalizedCandidateRange(text, startOffset, selectedText, buildAnchorSearchOffsetMap)
      ?.endOffset ?? clampOffset(startOffset + selectedText.length, text.length)
  )
}

function findOffsetFromContextWindow(
  text: string,
  anchor: PaperAnnotationTextAnchor
): number | null {
  const trimmedPrefix = normalizeAnchorText(anchor.prefixText)
  const trimmedSuffix = normalizeAnchorText(anchor.suffixText)
  let bestOffset: number | null = null
  let bestScore = -1

  if (trimmedPrefix) {
    for (const prefixOffset of collectCandidateOffsets(text, trimmedPrefix)) {
      const nextOffset = resolveInvisibleInsensitiveEndOffset(text, prefixOffset, trimmedPrefix)
      const selectedRange = resolveSelectedTextRangeAtOffset(text, nextOffset, anchor.selectedText)
      if (!selectedRange) {
        continue
      }

      const score = scoreContextMatch(text, anchor, selectedRange)
      if (score > bestScore) {
        bestScore = score
        bestOffset = selectedRange.startOffset
      }
    }
  }

  if (trimmedSuffix) {
    for (const suffixOffset of collectCandidateOffsets(text, trimmedSuffix)) {
      const nextOffset = Math.max(
        0,
        suffixOffset - removeInvisibleFormatCharacters(anchor.selectedText).length
      )
      const selectedRange = resolveSelectedTextRangeAtOffset(text, nextOffset, anchor.selectedText)
      if (!selectedRange) {
        continue
      }

      const score = scoreContextMatch(text, anchor, selectedRange)
      if (score > bestScore) {
        bestScore = score
        bestOffset = selectedRange.startOffset
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
  const trimmedRange = trimTextBoundaryRange(textContent, nextStartOffset, nextEndOffset)
  const anchorStartOffset = trimmedRange?.startOffset ?? nextStartOffset
  const anchorEndOffset = trimmedRange?.endOffset ?? nextStartOffset
  const selectedText = textContent.slice(anchorStartOffset, anchorEndOffset)

  return {
    selectedText,
    prefixText: textContent.slice(Math.max(0, anchorStartOffset - 32), anchorStartOffset),
    suffixText: textContent.slice(
      anchorEndOffset,
      Math.min(textContent.length, anchorEndOffset + 32)
    ),
    startOffset: anchorStartOffset,
    endOffset: anchorEndOffset,
    normalizedText: normalizeAnchorText(selectedText)
  }
}

export function resolvePaperTextAnchorRange(
  text: string,
  anchor: PaperAnnotationTextAnchor
): PaperTextAnchorRange | null {
  if (!anchor.selectedText) {
    return null
  }

  const exactRange = resolveSelectedTextRangeAtOffset(text, anchor.startOffset, anchor.selectedText)
  if (exactRange && exactRange.endOffset === anchor.endOffset) {
    const actualPrefix = text.slice(
      Math.max(0, anchor.startOffset - anchor.prefixText.length),
      anchor.startOffset
    )
    const actualSuffix = text.slice(exactRange.endOffset)

    const prefixOk = !anchor.prefixText || actualPrefix.endsWith(anchor.prefixText)
    const suffixOk = !anchor.suffixText || actualSuffix.startsWith(anchor.suffixText)

    if (prefixOk && suffixOk) {
      return exactRange
    }
  }

  let bestRange: PaperTextAnchorRange | null = null
  let bestScore = -1
  const visitedOffsets = new Set<number>()

  for (const fragment of buildAnchorFragments(anchor.selectedText)) {
    for (const offset of collectCandidateOffsets(text, fragment)) {
      if (visitedOffsets.has(offset)) {
        continue
      }

      visitedOffsets.add(offset)
      const selectedRange =
        resolveSelectedTextRangeAtOffset(text, offset, anchor.selectedText) ||
        buildFallbackAnchorRange(text, offset, anchor.selectedText)
      if (!selectedRange) {
        continue
      }

      const score = scoreContextMatch(text, anchor, selectedRange)
      if (score > bestScore) {
        bestScore = score
        bestRange = selectedRange
      }
    }
  }

  const contextOffset = findOffsetFromContextWindow(text, anchor)
  if (contextOffset !== null) {
    const selectedRange =
      resolveSelectedTextRangeAtOffset(text, contextOffset, anchor.selectedText) ||
      buildFallbackAnchorRange(text, contextOffset, anchor.selectedText)
    const score = selectedRange ? scoreContextMatch(text, anchor, selectedRange) : -1
    if (score > bestScore) {
      bestScore = score
      bestRange = selectedRange
    }
  }

  return bestRange
}

export function findPaperTextAnchorOffset(
  text: string,
  anchor: PaperAnnotationTextAnchor
): number | null {
  return resolvePaperTextAnchorRange(text, anchor)?.startOffset ?? null
}

/**
 * 当两个文本仅公式内部空格不同时，通过偏移映射精确转换锚点。
 * 用于 canonicalText（$L_{train}$）与 originalText（$ L_{train} $）之间的映射。
 */
function mapAnchorByFormulaSpacing(
  sourceText: string,
  targetText: string,
  sourceAnchor: PaperAnnotationTextAnchor
): PaperTextAnchorAlignmentResult | null {
  const sourceMap = buildFormulaNormOffsetMap(sourceText)
  const targetMap = buildFormulaNormOffsetMap(targetText)

  // 将 sourceAnchor 的偏移量映射到归一化空间，再映射到 target 文本空间
  const normStart = findNormOffsetForOriginal(sourceMap, sourceAnchor.startOffset)
  const normEnd = findNormOffsetForOriginal(sourceMap, sourceAnchor.endOffset)
  if (normStart === null || normEnd === null) {
    return null
  }

  const targetStart = mapNormToOriginal(targetMap, normStart)
  const targetEnd = mapNormToOriginal(targetMap, normEnd)
  if (targetStart === null || targetEnd === null) {
    return null
  }

  const nextStartOffset = clampOffset(targetStart, targetText.length)
  const nextEndOffset = clampOffset(Math.max(nextStartOffset + 1, targetEnd), targetText.length)

  const anchor = buildPaperTextAnchor(targetText, nextStartOffset, nextEndOffset)
  if (!normalizeAnchorText(anchor.selectedText)) {
    return null
  }

  return {
    anchor,
    confidence: 0.92,
    strategy: 'sentence'
  }
}

/** 在归一化偏移映射中，找到原始偏移对应的归一化位置 */
function findNormOffsetForOriginal(
  offsetMap: FormulaNormOffsetMap,
  originalOffset: number
): number | null {
  // normToOriginal[i] 是递增的（因为文本是顺序遍历的）
  // 找到 normToOriginal 中 <= originalOffset 的最大位置
  let bestNormIndex = -1
  for (let index = 0; index < offsetMap.normToOriginal.length; index += 1) {
    if (offsetMap.normToOriginal[index] <= originalOffset) {
      bestNormIndex = index
    } else {
      break
    }
  }
  if (bestNormIndex < 0) {
    return null
  }
  return bestNormIndex
}

/** 将归一化空间偏移映射到原始文本偏移 */
function mapNormToOriginal(offsetMap: FormulaNormOffsetMap, normOffset: number): number | null {
  if (normOffset < 0) {
    return null
  }
  if (normOffset >= offsetMap.normToOriginal.length) {
    // 超出范围时返回原始文本末尾位置
    // 需要推算：最后一个 normToOriginal 值 + 剩余字符
    const lastOriginal = offsetMap.normToOriginal[offsetMap.normToOriginal.length - 1]
    if (lastOriginal !== undefined) {
      return lastOriginal + (normOffset - offsetMap.normToOriginal.length + 1)
    }
    return null
  }
  return offsetMap.normToOriginal[normOffset]
}

export function mapPaperTextAnchorBetweenTexts(
  sourceText: string,
  targetText: string,
  sourceAnchor: PaperAnnotationTextAnchor
): PaperTextAnchorAlignmentResult | null {
  if (!sourceText || !targetText || sourceAnchor.endOffset <= sourceAnchor.startOffset) {
    return null
  }

  // 快速路径：如果两个文本仅公式空格不同，使用精确偏移映射
  const normSource = normalizeFormulaSpacing(sourceText)
  const normTarget = normalizeFormulaSpacing(targetText)
  if (normSource === normTarget) {
    const preciseResult = mapAnchorByFormulaSpacing(sourceText, targetText, sourceAnchor)
    if (preciseResult) {
      return preciseResult
    }
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
  if (!normalizeAnchorText(anchor.selectedText)) {
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
