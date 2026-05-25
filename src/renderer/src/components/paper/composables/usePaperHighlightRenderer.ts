import type {
  PaperAnnotation,
  PaperAnnotationColorKey,
  PaperAnnotationKind,
  PaperAnnotationTextAnchor
} from '@shared/types/paper'
import type { PaperTranslationSegmentKind } from '@shared/types/paper'
import {
  buildPaperTextAnchor,
  findPaperTextAnchorOffset,
  mapPaperTextAnchorBetweenTexts
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
  annotation: PaperAnnotation,
  originalText?: string
): PaperAnnotationTextAnchor | null {
  if (!translationText) {
    return null
  }

  // 先尝试 translationAnchor 精确匹配
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

  // translationAnchor 匹配失败：尝试从 originalAnchor 映射到译文
  if (annotation.originalAnchor && originalText) {
    const mappingResult = mapPaperTextAnchorBetweenTexts(
      originalText,
      translationText,
      annotation.originalAnchor
    )
    if (mappingResult && mappingResult.confidence >= 0.42) {
      return mappingResult.anchor
    }
  }

  return null
}

export interface HighlightCollectResult {
  highlights: QuoteHighlight[]
  failedIds: string[]
}

function collectOriginalHighlights(
  segment: RenderSourceSegment,
  annotations: PaperAnnotation[]
): HighlightCollectResult {
  const failedIds: string[] = []
  const highlights: QuoteHighlight[] = []

  for (const annotation of annotations) {
    if (annotation.noteType !== 'original_span') continue

    const resolvedAnchor = resolveOriginalViewAnchor(segment, annotation)
    if (!resolvedAnchor) {
      failedIds.push(annotation.id)
      continue
    }

    const startOffset = findPaperTextAnchorOffset(segment.originalText, resolvedAnchor)
    if (startOffset === null) {
      failedIds.push(annotation.id)
      continue
    }

    highlights.push({
      id: annotation.id,
      startOffset: resolvedAnchor.startOffset,
      endOffset: resolvedAnchor.endOffset,
      anchor: resolvedAnchor,
      kind: annotation.kind,
      colorKey: annotation.colorKey
    })
  }

  return { highlights, failedIds }
}

function collectTranslationHighlights(
  translationText: string,
  annotations: PaperAnnotation[],
  originalText?: string
): HighlightCollectResult {
  const failedIds: string[] = []
  const highlights: QuoteHighlight[] = []

  for (const annotation of annotations) {
    if (annotation.noteType !== 'translation_view') continue

    const resolvedAnchor = resolveTranslationViewAnchor(translationText, annotation, originalText)
    if (!resolvedAnchor) {
      failedIds.push(annotation.id)
      continue
    }

    const startOffset = findPaperTextAnchorOffset(translationText, resolvedAnchor)
    if (startOffset === null) {
      failedIds.push(annotation.id)
      continue
    }

    highlights.push({
      id: annotation.id,
      startOffset: resolvedAnchor.startOffset,
      endOffset: resolvedAnchor.endOffset,
      anchor: resolvedAnchor,
      kind: annotation.kind,
      colorKey: annotation.colorKey
    })
  }

  return { highlights, failedIds }
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

export interface ApplyHighlightsResult {
  html: string
  failedIds: string[]
}

function applyHighlightsToHtml(html: string, highlights: QuoteHighlight[]): ApplyHighlightsResult {
  if (!html || highlights.length === 0 || typeof DOMParser === 'undefined') {
    return { html, failedIds: [] }
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = document.body.firstElementChild
  if (!root) {
    return { html, failedIds: [] }
  }

  const failedIds: string[] = []
  const sortedHighlights = sortHighlights(highlights)
  for (let index = sortedHighlights.length - 1; index >= 0; index -= 1) {
    const highlight = sortedHighlights[index]
    if (highlight.startOffset >= highlight.endOffset) {
      continue
    }

    const resolvedRange = resolveHighlightRange(root, highlight)
    if (!resolvedRange) {
      failedIds.push(highlight.id)
      continue
    }

    const range = document.createRange()
    range.setStart(resolvedRange.startPoint.node, resolvedRange.startPoint.offset)
    range.setEnd(resolvedRange.endPoint.node, resolvedRange.endPoint.offset)
    if (range.collapsed) {
      failedIds.push(highlight.id)
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
  return { html: root.innerHTML, failedIds }
}

export interface PaperHighlightRenderer {
  collectOriginalHighlights: (
    segment: RenderSourceSegment,
    annotations: PaperAnnotation[]
  ) => HighlightCollectResult
  collectTranslationHighlights: (
    translationText: string,
    annotations: PaperAnnotation[],
    originalText?: string
  ) => HighlightCollectResult
  applyHighlightsToHtml: (html: string, highlights: QuoteHighlight[]) => ApplyHighlightsResult
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
