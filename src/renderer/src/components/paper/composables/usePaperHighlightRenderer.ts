import type { PaperAnnotation, PaperAnnotationTextAnchor } from '@shared/types/paper'
import type { PaperTranslationSegmentKind } from '@shared/types/paper'
import {
  buildPaperTextAnchor,
  findPaperTextAnchorOffset,
  mapPaperTextAnchorBetweenTexts
} from '@shared/utils/paperAnnotationAnchors'

export interface RenderSourceSegment {
  renderId: string
  stableId: string
  index: number
  kind: PaperTranslationSegmentKind
  originalMarkdown: string
  originalText: string
  textHash: string
  sourceRevisionId: string
  sourceRefs: import('@shared/types/paper').PaperReaderSegmentSourceRefs
}

export interface QuoteHighlight {
  id: string
  startOffset: number
  endOffset: number
  color: string
}

function resolveOriginalViewAnchor(
  segment: RenderSourceSegment,
  translationText: string,
  annotation: PaperAnnotation
): PaperAnnotationTextAnchor | null {
  if (!annotation.originalAnchor && (!translationText || !annotation.translationAnchor)) {
    return null
  }

  if (annotation.originalAnchor) {
    const startOffset = findPaperTextAnchorOffset(segment.originalText, annotation.originalAnchor)
    if (startOffset !== null) {
      return buildPaperTextAnchor(
        segment.originalText,
        startOffset,
        startOffset + annotation.originalAnchor.selectedText.length
      )
    }
  }

  if (translationText && annotation.translationAnchor) {
    const mapped = mapPaperTextAnchorBetweenTexts(
      translationText,
      segment.originalText,
      annotation.translationAnchor
    )
    if (mapped && mapped.confidence >= 0.58) {
      return mapped.anchor
    }
  }

  return null
}

function resolveTranslationViewAnchor(
  segment: RenderSourceSegment,
  translationText: string,
  annotation: PaperAnnotation
): PaperAnnotationTextAnchor | null {
  if (!translationText) {
    return null
  }

  if (annotation.translationAnchor) {
    const startOffset = findPaperTextAnchorOffset(translationText, annotation.translationAnchor)
    if (startOffset !== null) {
      return buildPaperTextAnchor(
        translationText,
        startOffset,
        startOffset + annotation.translationAnchor.selectedText.length
      )
    }
  }

  if (annotation.originalAnchor) {
    const startOffset = findPaperTextAnchorOffset(segment.originalText, annotation.originalAnchor)
    const currentOriginalAnchor =
      startOffset !== null
        ? buildPaperTextAnchor(
            segment.originalText,
            startOffset,
            startOffset + annotation.originalAnchor.selectedText.length
          )
        : annotation.originalAnchor
    const mapped = mapPaperTextAnchorBetweenTexts(
      segment.originalText,
      translationText,
      currentOriginalAnchor
    )
    if (mapped && mapped.confidence >= 0.58) {
      return mapped.anchor
    }
  }

  return null
}

function collectOriginalHighlights(
  segment: RenderSourceSegment,
  translationText: string,
  annotations: PaperAnnotation[]
): QuoteHighlight[] {
  return annotations
    .filter((annotation) => {
      if (annotation.status === 'needs_reanchor' || annotation.status === 'invalid') {
        return false
      }

      return annotation.noteType === 'original_span' || !!annotation.originalAnchor
    })
    .flatMap((annotation) => {
      const resolvedAnchor = resolveOriginalViewAnchor(segment, translationText, annotation)
      if (!resolvedAnchor) {
        return []
      }

      const startOffset = findPaperTextAnchorOffset(segment.originalText, resolvedAnchor)
      if (startOffset === null) {
        return []
      }

      return [
        {
          id: annotation.id,
          startOffset,
          endOffset: startOffset + resolvedAnchor.selectedText.length,
          color: annotation.color
        }
      ]
    })
}

function collectTranslationHighlights(
  segment: RenderSourceSegment,
  translationText: string,
  annotations: PaperAnnotation[]
): QuoteHighlight[] {
  return annotations
    .filter((annotation) => {
      return annotation.status === 'active' || annotation.status === 'translation_missing'
    })
    .flatMap((annotation) => {
      const resolvedAnchor = resolveTranslationViewAnchor(segment, translationText, annotation)
      if (!resolvedAnchor) {
        return []
      }

      const startOffset = findPaperTextAnchorOffset(translationText, resolvedAnchor)
      if (startOffset === null) {
        return []
      }

      return [
        {
          id: annotation.id,
          startOffset,
          endOffset: startOffset + resolvedAnchor.selectedText.length,
          color: annotation.color
        }
      ]
    })
}

function resolveTextPoint(
  root: Element,
  absoluteOffset: number
): { node: Text; offset: number } | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentOffset = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const length = node.textContent?.length || 0
    const endOffset = currentOffset + length
    if (absoluteOffset <= endOffset) {
      return {
        node,
        offset: Math.max(0, absoluteOffset - currentOffset)
      }
    }
    currentOffset = endOffset
  }

  return null
}

function sortHighlights(highlights: QuoteHighlight[]): QuoteHighlight[] {
  const sorted = [...highlights].sort((left, right) => {
    return left.startOffset - right.startOffset || left.endOffset - right.endOffset
  })

  const filtered: QuoteHighlight[] = []
  let lastEnd = -1
  for (const highlight of sorted) {
    if (highlight.startOffset < lastEnd) {
      continue
    }
    filtered.push(highlight)
    lastEnd = highlight.endOffset
  }

  return filtered
}

function applyHighlightsToHtml(html: string, highlights: QuoteHighlight[]): string {
  if (!html || highlights.length === 0 || typeof DOMParser === 'undefined') {
    return html
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = document.body.firstElementChild
  if (!root) {
    return html
  }

  const sortedHighlights = sortHighlights(highlights)
  for (let index = sortedHighlights.length - 1; index >= 0; index -= 1) {
    const highlight = sortedHighlights[index]
    if (highlight.startOffset >= highlight.endOffset) {
      continue
    }

    const startPoint = resolveTextPoint(root, highlight.startOffset)
    const endPoint = resolveTextPoint(root, highlight.endOffset)
    if (!startPoint || !endPoint) {
      continue
    }

    const range = document.createRange()
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
    if (range.collapsed) {
      continue
    }

    const mark = document.createElement('mark')
    mark.className = 'paper-annotation-highlight'
    mark.setAttribute('data-annotation-id', highlight.id)
    mark.setAttribute('style', `background-color: ${highlight.color};`)

    const fragment = range.extractContents()
    mark.appendChild(fragment)
    range.insertNode(mark)
  }

  return root.innerHTML
}

export interface PaperHighlightRenderer {
  collectOriginalHighlights: (
    segment: RenderSourceSegment,
    translationText: string,
    annotations: PaperAnnotation[]
  ) => QuoteHighlight[]
  collectTranslationHighlights: (
    segment: RenderSourceSegment,
    translationText: string,
    annotations: PaperAnnotation[]
  ) => QuoteHighlight[]
  applyHighlightsToHtml: (html: string, highlights: QuoteHighlight[]) => string
}

export function usePaperHighlightRenderer(): PaperHighlightRenderer {
  return {
    collectOriginalHighlights,
    collectTranslationHighlights,
    applyHighlightsToHtml
  }
}
