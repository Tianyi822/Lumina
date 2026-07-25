import type { PaperTranslationSegmentKind } from '../../types/paper'

// ─── 内部类型 ───

interface MarkdownFence {
  marker: '`' | '~'
  length: number
}

interface MathFence {
  opener: '$' | '$$' | '\\['
  closer: '$' | '$$' | '\\]'
}

// ─── Fence 解析 ───

const FENCE_OPEN_PATTERN = /^ {0,3}(`{3,}|~{3,})/

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

function parseMathFenceLine(line: string): MathFence | null {
  const trimmed = line.trim()
  if (trimmed === '$' || trimmed === '$$') {
    return {
      opener: trimmed,
      closer: trimmed
    }
  }

  if (trimmed === '\\[') {
    return {
      opener: '\\[',
      closer: '\\]'
    }
  }

  return null
}

function isMathFenceCloser(line: string, fence: MathFence): boolean {
  return line.trim() === fence.closer
}

function hasClosingMathFence(lines: string[], startIndex: number, fence: MathFence): boolean {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (isMathFenceCloser(lines[index], fence)) {
      return true
    }
  }

  return false
}

// ─── 辅助函数 ───

function getLeadingSpaceLength(line: string): number {
  return line.match(/^ */)?.[0].length ?? 0
}

function getOrderedListContinuationIndent(blockLines: string[]): number | null {
  const firstLine = blockLines.find((line) => line.trim())
  const match = firstLine?.match(/^ {0,3}(\d{1,2}[.)]\s+)/)
  if (!match) {
    return null
  }

  return getLeadingSpaceLength(firstLine || '') + match[1].length
}

function findNextNonBlankLine(lines: string[], startIndex: number): string | null {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      return lines[index]
    }
  }

  return null
}

// ─── 块分割 ───

function splitPaperMarkdownBlocks(markdown: string): string[] {
  const blocks: string[] = []
  const lines = markdown.replace(/\r\n/g, '\n').trim().split('\n')
  let buffer: string[] = []
  let activeFence: MarkdownFence | null = null
  let activeMathFence: MathFence | null = null

  const flushBuffer = (): void => {
    const block = buffer.join('\n').trim()
    if (block) {
      blocks.push(block)
    }
    buffer = []
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]

    if (activeFence) {
      buffer.push(line)
      if (isMarkdownFenceCloser(line, activeFence)) {
        activeFence = null
        flushBuffer()
      }
      continue
    }

    if (activeMathFence) {
      buffer.push(line)
      if (isMathFenceCloser(line, activeMathFence)) {
        activeMathFence = null
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

    const mathFence = parseMathFenceLine(line)
    if (mathFence && hasClosingMathFence(lines, lineIndex, mathFence)) {
      flushBuffer()
      buffer.push(line)
      activeMathFence = mathFence
      continue
    }

    if (!line.trim()) {
      const listContinuationIndent = getOrderedListContinuationIndent(buffer)
      const nextNonBlankLine = findNextNonBlankLine(lines, lineIndex + 1)
      if (
        listContinuationIndent !== null &&
        nextNonBlankLine &&
        getLeadingSpaceLength(nextNonBlankLine) >= listContinuationIndent
      ) {
        buffer.push(line)
        continue
      }

      flushBuffer()
      continue
    }

    const listContinuationIndent = getOrderedListContinuationIndent(buffer)
    if (
      listContinuationIndent !== null &&
      getLeadingSpaceLength(line) < listContinuationIndent &&
      /^\s{0,3}\d{1,2}[.)]\s+\S/.test(line)
    ) {
      flushBuffer()
    }

    buffer.push(line)
  }

  flushBuffer()
  return blocks
}

function splitMarkdownBlockByBlankLines(block: string): string[] {
  const chunks: string[] = []
  const lines = block.replace(/\r\n/g, '\n').trim().split('\n')
  let buffer: string[] = []
  let activeFence: MarkdownFence | null = null

  const flushBuffer = (): void => {
    const chunk = buffer.join('\n').replace(/\s+$/g, '')
    if (chunk.trim()) {
      chunks.push(chunk)
    }
    buffer = []
  }

  for (const line of lines) {
    if (activeFence) {
      buffer.push(line)
      if (isMarkdownFenceCloser(line, activeFence)) {
        activeFence = null
      }
      continue
    }

    const fence = parseMarkdownFenceOpener(line)
    if (fence) {
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
  return chunks
}

function stripListContinuationIndent(block: string, continuationIndent: number): string {
  return block
    .split('\n')
    .map((line) => {
      if (!line.trim()) {
        return line
      }

      return getLeadingSpaceLength(line) >= continuationIndent
        ? line.slice(continuationIndent)
        : line.trimStart()
    })
    .join('\n')
    .trim()
}

function canSplitLooseOrderedListChunk(chunk: string, continuationIndent: number): boolean {
  const firstMeaningfulLine = chunk.split('\n').find((line) => line.trim())
  return !!firstMeaningfulLine && getLeadingSpaceLength(firstMeaningfulLine) >= continuationIndent
}

function splitLooseOrderedListBlock(block: string): string[] {
  const lines = block.replace(/\r\n/g, '\n').trim().split('\n')
  const continuationIndent = getOrderedListContinuationIndent(lines)
  if (continuationIndent === null) {
    return [block]
  }

  const chunks = splitMarkdownBlockByBlankLines(block)
  if (
    chunks.length <= 1 ||
    chunks.slice(1).some((chunk) => !canSplitLooseOrderedListChunk(chunk, continuationIndent))
  ) {
    return [block]
  }

  return [
    chunks[0],
    ...chunks.slice(1).map((chunk) => stripListContinuationIndent(chunk, continuationIndent))
  ].filter((chunk) => chunk.trim().length > 0)
}

export function splitPaperMarkdownBlocksForTranslation(markdown: string): string[] {
  return splitPaperMarkdownBlocks(markdown).flatMap(splitLooseOrderedListBlock)
}

export function extractFencedCodeText(markdown: string): string {
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

export function detectPaperTranslationSegmentKind(block: string): PaperTranslationSegmentKind {
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

  if (/^\s*(?:[-*+]|\d+[.)])\s/m.test(block)) {
    return 'list'
  }

  if (isTableLikeBlock(block)) {
    return 'table'
  }

  return 'paragraph'
}
