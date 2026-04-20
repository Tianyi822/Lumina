import type {
  PaperAnnotation,
  PaperAnnotationColorKey,
  PaperAnnotationKind,
  PaperAnnotationTextAnchor
} from '@shared/types/paper'
import type { PaperTranslationSegmentKind } from '@shared/types/paper'
import {
  buildPaperTextAnchor,
  findPaperTextAnchorOffset
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
  kind: PaperAnnotationKind
  colorKey: PaperAnnotationColorKey
}

function resolveOriginalViewAnchor(
  segment: RenderSourceSegment,
  annotation: PaperAnnotation
): PaperAnnotationTextAnchor | null {
  if (!annotation.originalAnchor) {
    return null
  }

  const startOffset = findPaperTextAnchorOffset(segment.originalText, annotation.originalAnchor)
  if (startOffset !== null) {
    return buildPaperTextAnchor(
      segment.originalText,
      startOffset,
      startOffset + annotation.originalAnchor.selectedText.length
    )
  }

  return null
}

function resolveTranslationViewAnchor(
  translationText: string,
  annotation: PaperAnnotation
): PaperAnnotationTextAnchor | null {
  if (!translationText || !annotation.translationAnchor) {
    return null
  }

  const startOffset = findPaperTextAnchorOffset(translationText, annotation.translationAnchor)
  if (startOffset !== null) {
    return buildPaperTextAnchor(
      translationText,
      startOffset,
      startOffset + annotation.translationAnchor.selectedText.length
    )
  }

  return null
}

function collectOriginalHighlights(
  segment: RenderSourceSegment,
  annotations: PaperAnnotation[]
): QuoteHighlight[] {
  return annotations
    .filter((annotation) => {
      if (annotation.status === 'needs_reanchor' || annotation.status === 'invalid') {
        return false
      }

      return annotation.noteType === 'original_span'
    })
    .flatMap((annotation) => {
      const resolvedAnchor = resolveOriginalViewAnchor(segment, annotation)
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
          kind: annotation.kind,
          colorKey: annotation.colorKey
        }
      ]
    })
}

function collectTranslationHighlights(
  translationText: string,
  annotations: PaperAnnotation[]
): QuoteHighlight[] {
  return annotations
    .filter((annotation) => {
      return (
        annotation.noteType === 'translation_view' &&
        (annotation.status === 'active' || annotation.status === 'translation_missing')
      )
    })
    .flatMap((annotation) => {
      const resolvedAnchor = resolveTranslationViewAnchor(translationText, annotation)
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
          kind: annotation.kind,
          colorKey: annotation.colorKey
        }
      ]
    })
}

export function resolveTextPoint(
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
  return [...highlights].sort((left, right) => {
    return left.startOffset - right.startOffset || left.endOffset - right.endOffset
  })
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
    mark.className = [
      'paper-annotation-highlight',
      `paper-annotation-highlight--${highlight.kind}`,
      `paper-annotation-highlight--${highlight.colorKey}`
    ].join(' ')
    mark.setAttribute('data-annotation-id', highlight.id)
    mark.setAttribute('data-annotation-kind', highlight.kind)
    mark.setAttribute('data-color-key', highlight.colorKey)

    const fragment = range.extractContents()
    mark.appendChild(fragment)
    range.insertNode(mark)
  }

  return root.innerHTML
}

export interface PaperHighlightRenderer {
  collectOriginalHighlights: (
    segment: RenderSourceSegment,
    annotations: PaperAnnotation[]
  ) => QuoteHighlight[]
  collectTranslationHighlights: (
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
