import type {
  PaperTranslationCache,
  PaperTranslationSegment,
  PaperTranslationSegmentKind
} from '../types/paper'

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

function detectPaperTranslationSegmentKind(block: string): PaperTranslationSegmentKind {
  if (/^#{1,6}\s/.test(block)) {
    return 'heading'
  }

  if (isImageOnlyBlock(block)) {
    return 'image'
  }

  if (/^```[\s\S]*```$/m.test(block) || /^ {4,}\S/m.test(block)) {
    return 'code'
  }

  if (/^\s{0,3}>\s/m.test(block)) {
    return 'quote'
  }

  if (/^\s*(?:[-*+]|\d+\.)\s/m.test(block)) {
    return 'list'
  }

  if (/\|/.test(block) && /\n\s*\|?[\s:-]+(?:\|[\s:-]+)+\|?\s*(?:\n|$)/.test(block)) {
    return 'table'
  }

  return 'paragraph'
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

export function parsePaperTranslationSegments(markdown: string): PaperTranslationSegment[] {
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalizedMarkdown) {
    return []
  }

  const blocks = normalizedMarkdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.map((block, index) => ({
    id: `seg-${index}`,
    index,
    kind: detectPaperTranslationSegmentKind(block),
    originalMarkdown: block,
    originalText: stripPaperTranslationMarkdown(block)
  }))
}
