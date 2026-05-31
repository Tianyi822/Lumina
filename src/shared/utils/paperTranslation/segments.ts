import type { PaperTranslationSegment } from '../../types/paper'
import {
  splitPaperMarkdownBlocksForTranslation,
  extractFencedCodeText,
  detectPaperTranslationSegmentKind
} from './blocks.ts'
import { stripPaperTranslationMarkdown } from './helpers.ts'

function getPaperSegmentOriginalText(
  kind: PaperTranslationSegment['kind'],
  markdown: string
): string {
  if (kind === 'code') {
    return extractFencedCodeText(markdown)
  }

  return stripPaperTranslationMarkdown(markdown)
}

export function parsePaperTranslationSegments(markdown: string): PaperTranslationSegment[] {
  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalizedMarkdown) {
    return []
  }

  const blocks = splitPaperMarkdownBlocksForTranslation(normalizedMarkdown)

  return blocks.map((block, index) => {
    const kind = detectPaperTranslationSegmentKind(block)
    return {
      id: `seg-${index}`,
      index,
      kind,
      originalMarkdown: block,
      originalText: getPaperSegmentOriginalText(kind, block)
    }
  })
}
