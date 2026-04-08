import type { PaperTranslationSegment, PaperTranslationSegmentKind } from '../types/paper'

function detectPaperTranslationSegmentKind(block: string): PaperTranslationSegmentKind {
  if (/^#{1,6}\s/.test(block)) {
    return 'heading'
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
