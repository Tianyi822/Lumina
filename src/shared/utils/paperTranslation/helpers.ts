import type { PaperTranslationCache, PaperTranslationEntry } from '../../types/paper'
import {
  normalizePaperHeadingText,
  normalizePaperTranslationText,
  parsePaperHeading,
  extractParagraphAbstractTitle
} from './patterns.ts'

const FIGURE_CAPTION_TRANSLATION_ID_PREFIX = 'fig-caption-'

export function extractTranslatedHeadingText(
  entry: PaperTranslationEntry | undefined
): string | undefined {
  if (!entry || entry.status !== 'completed') {
    return undefined
  }

  const translatedHeading = entry.translatedMarkdown
    ? parsePaperHeading(entry.translatedMarkdown)
    : null

  if (translatedHeading?.titleText) {
    return translatedHeading.titleText
  }

  const fallbackText = entry.translatedText ? normalizePaperHeadingText(entry.translatedText) : ''
  return fallbackText || undefined
}

export function extractTranslatedAbstractTitle(
  entry: PaperTranslationEntry | undefined
): string | undefined {
  if (!entry || entry.status !== 'completed') {
    return undefined
  }

  const translatedMarkdownText = entry.translatedMarkdown
    ? stripPaperTranslationMarkdown(entry.translatedMarkdown)
    : ''
  const translatedParagraphTitle =
    extractParagraphAbstractTitle(translatedMarkdownText) ||
    extractParagraphAbstractTitle(entry.translatedText || '')

  return translatedParagraphTitle || '摘要'
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

export function buildFigureCaptionTranslationMap(
  cache: PaperTranslationCache | null | undefined
): Record<string, string> {
  if (!cache) {
    return {}
  }

  const map: Record<string, string> = {}

  for (const entry of cache.entries) {
    if (
      !entry.id.startsWith(FIGURE_CAPTION_TRANSLATION_ID_PREFIX) ||
      entry.status !== 'completed'
    ) {
      continue
    }

    const translatedText = normalizePaperTranslationText(
      entry.translatedText ||
        (entry.translatedMarkdown ? stripPaperTranslationMarkdown(entry.translatedMarkdown) : '')
    )
    if (!translatedText) {
      continue
    }

    map[entry.id.slice(FIGURE_CAPTION_TRANSLATION_ID_PREFIX.length)] = translatedText
  }

  return map
}
