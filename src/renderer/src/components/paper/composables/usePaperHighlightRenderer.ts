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
import {
  buildCanonicalTextIndex,
  resolveCanonicalTextPoint,
  trimCanonicalTextRange
} from './paperCanonicalTextIndex'

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
  anchor: PaperAnnotationTextAnchor
  kind: PaperAnnotationKind
  colorKey: PaperAnnotationColorKey
}

const PAPER_ANNOTATION_HIGHLIGHT_SELECTOR = 'mark.paper-annotation-highlight'

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

      return (
        annotation.noteType === 'original_span' ||
        (annotation.noteType === 'translation_view' &&
          annotation.status === 'translation_missing' &&
          !!annotation.originalAnchor)
      )
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
          startOffset: resolvedAnchor.startOffset,
          endOffset: resolvedAnchor.endOffset,
          anchor: resolvedAnchor,
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
          startOffset: resolvedAnchor.startOffset,
          endOffset: resolvedAnchor.endOffset,
          anchor: resolvedAnchor,
          kind: annotation.kind,
          colorKey: annotation.colorKey
        }
      ]
    })
}

function sortHighlights(highlights: QuoteHighlight[]): QuoteHighlight[] {
  return [...highlights].sort((left, right) => {
    return left.startOffset - right.startOffset || left.endOffset - right.endOffset
  })
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}

function getClosestHighlightMark(root: Element, node: Node): HTMLElement | null {
  const element = isElementNode(node) ? node : node.parentElement
  const mark = element?.closest<HTMLElement>(PAPER_ANNOTATION_HIGHLIGHT_SELECTOR) || null
  if (!mark || !root.contains(mark)) {
    return null
  }

  return mark
}

function isBoundaryAtHighlightEdge(
  mark: HTMLElement,
  boundary: { node: Node; offset: number },
  edge: 'start' | 'end'
): boolean {
  const document = mark.ownerDocument
  const range = document.createRange()

  if (edge === 'start') {
    range.setStart(mark, 0)
    range.setEnd(boundary.node, boundary.offset)
  } else {
    range.setStart(boundary.node, boundary.offset)
    range.setEnd(mark, mark.childNodes.length)
  }

  return range.toString().length === 0
}

function getElementBoundary(
  element: Element,
  edge: 'before' | 'after'
): { node: Node; offset: number } {
  const parent = element.parentNode
  if (!parent) {
    return {
      node: element,
      offset: edge === 'before' ? 0 : element.childNodes.length
    }
  }

  const offset = Array.prototype.indexOf.call(parent.childNodes, element)
  return {
    node: parent,
    offset: edge === 'before' ? offset : offset + 1
  }
}

function normalizeHighlightBoundary(
  root: Element,
  boundary: { node: Node; offset: number }
): { node: Node; offset: number } {
  let nextBoundary = boundary
  for (let depth = 0; depth < 8; depth += 1) {
    const mark = getClosestHighlightMark(root, nextBoundary.node)
    if (!mark) {
      return nextBoundary
    }

    if (isBoundaryAtHighlightEdge(mark, nextBoundary, 'start')) {
      nextBoundary = getElementBoundary(mark, 'before')
      continue
    }

    if (isBoundaryAtHighlightEdge(mark, nextBoundary, 'end')) {
      nextBoundary = getElementBoundary(mark, 'after')
      continue
    }

    return nextBoundary
  }

  return nextBoundary
}

function resolveHighlightRange(
  root: Element,
  highlight: QuoteHighlight
): { startPoint: { node: Node; offset: number }; endPoint: { node: Node; offset: number } } | null {
  const canonicalIndex = buildCanonicalTextIndex(root)
  const startOffset = findPaperTextAnchorOffset(canonicalIndex.text, highlight.anchor)
  if (startOffset === null) {
    return null
  }

  const trimmedRange = trimCanonicalTextRange(
    canonicalIndex.text,
    startOffset,
    startOffset + highlight.anchor.selectedText.length
  )
  if (!trimmedRange) {
    return null
  }

  const startPoint = resolveCanonicalTextPoint(canonicalIndex, trimmedRange.startOffset, 'start')
  const endPoint = resolveCanonicalTextPoint(canonicalIndex, trimmedRange.endOffset, 'end')
  if (!startPoint || !endPoint) {
    return null
  }

  return {
    startPoint: normalizeHighlightBoundary(root, startPoint),
    endPoint: normalizeHighlightBoundary(root, endPoint)
  }
}

function removeEmptyHighlightMarks(root: Element): void {
  root.querySelectorAll(PAPER_ANNOTATION_HIGHLIGHT_SELECTOR).forEach((mark) => {
    if ((mark.textContent || '').length > 0) {
      return
    }

    mark.remove()
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

    const resolvedRange = resolveHighlightRange(root, highlight)
    if (!resolvedRange) {
      continue
    }

    const range = document.createRange()
    range.setStart(resolvedRange.startPoint.node, resolvedRange.startPoint.offset)
    range.setEnd(resolvedRange.endPoint.node, resolvedRange.endPoint.offset)
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
    removeEmptyHighlightMarks(root)
  }

  removeEmptyHighlightMarks(root)
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

export const __paperHighlightRendererTestHooks = {
  collectOriginalHighlights,
  normalizeHighlightBoundary,
  resolveHighlightRange,
  removeEmptyHighlightMarks
}

export function usePaperHighlightRenderer(): PaperHighlightRenderer {
  return {
    collectOriginalHighlights,
    collectTranslationHighlights,
    applyHighlightsToHtml
  }
}
