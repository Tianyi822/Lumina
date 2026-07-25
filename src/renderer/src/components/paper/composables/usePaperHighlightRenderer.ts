import type {
  PaperAnnotation,
  PaperAnnotationColorKey,
  PaperAnnotationKind,
  PaperAnnotationTextAnchor
} from '@shared/types/paper'
import type { PaperTranslationSegmentKind } from '@shared/types/paper'
import {
  buildPaperTextAnchor,
  mapPaperTextAnchorBetweenTexts,
  resolvePaperTextAnchorRange
} from '@shared/utils/paperAnnotationAnchors'
import {
  buildCanonicalTextIndex,
  resolveCanonicalTextPoint,
  trimCanonicalTextRange
} from './paperCanonicalTextIndex'
import type { CanonicalTextIndex } from './paperCanonicalTextIndex'

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

interface QuoteHighlight {
  id: string
  startOffset: number
  endOffset: number
  anchor: PaperAnnotationTextAnchor
  kind: PaperAnnotationKind
  colorKey: PaperAnnotationColorKey
}

const PAPER_ANNOTATION_HIGHLIGHT_SELECTOR = 'mark.paper-annotation-highlight'
const PAPER_ANNOTATION_FORMULA_HIGHLIGHT_CLASS = 'paper-annotation-formula-highlight'
const PAPER_ANNOTATION_FORMULA_HIGHLIGHT_SELECTOR = `.${PAPER_ANNOTATION_FORMULA_HIGHLIGHT_CLASS}`
export const PAPER_ANNOTATION_INTERACTIVE_SELECTOR = [
  PAPER_ANNOTATION_HIGHLIGHT_SELECTOR,
  PAPER_ANNOTATION_FORMULA_HIGHLIGHT_SELECTOR
].join(', ')

function isAnnotationForSegment(
  segment: RenderSourceSegment,
  annotation: PaperAnnotation
): annotation is PaperAnnotation & { originalAnchor: PaperAnnotationTextAnchor } {
  if (annotation.noteType !== 'original_span') return false
  if (!annotation.originalAnchor) return false
  return annotation.semanticAnchor.segmentStableId === segment.stableId
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
    const range = resolvePaperTextAnchorRange(translationText, annotation.translationAnchor)
    if (range) {
      return buildPaperTextAnchor(translationText, range.startOffset, range.endOffset)
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

interface HighlightCollectResult {
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
    if (!isAnnotationForSegment(segment, annotation)) continue

    highlights.push({
      id: annotation.id,
      startOffset: annotation.originalAnchor.startOffset,
      endOffset: annotation.originalAnchor.endOffset,
      anchor: annotation.originalAnchor,
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

    const range = resolvePaperTextAnchorRange(translationText, resolvedAnchor)
    if (!range) {
      failedIds.push(annotation.id)
      continue
    }

    highlights.push({
      id: annotation.id,
      startOffset: range.startOffset,
      endOffset: range.endOffset,
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

function getHighlightClassNames(highlight: QuoteHighlight): string[] {
  return [
    'paper-annotation-highlight',
    `paper-annotation-highlight--${highlight.kind}`,
    `paper-annotation-highlight--${highlight.colorKey}`
  ]
}

function addClassNames(element: HTMLElement, classNames: string[]): void {
  const nextClassNames = new Set(
    String(element.className || '')
      .split(/\s+/)
      .filter(Boolean)
  )
  classNames.forEach((className) => nextClassNames.add(className))
  element.className = [...nextClassNames].join(' ')
}

function applyHighlightMetadata(element: HTMLElement, highlight: QuoteHighlight): void {
  element.setAttribute('data-annotation-id', highlight.id)
  element.setAttribute('data-annotation-kind', highlight.kind)
  element.setAttribute('data-color-key', highlight.colorKey)
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

function resolveTrimmedHighlightRange(
  root: Element,
  highlight: QuoteHighlight
): {
  canonicalIndex: CanonicalTextIndex
  startOffset: number
  endOffset: number
} | null {
  const canonicalIndex = buildCanonicalTextIndex(root)
  const resolvedRange = resolvePaperTextAnchorRange(canonicalIndex.text, highlight.anchor)
  if (!resolvedRange) {
    return null
  }

  const trimmedRange = trimCanonicalTextRange(
    canonicalIndex.text,
    resolvedRange.startOffset,
    resolvedRange.endOffset
  )
  if (!trimmedRange) {
    return null
  }

  return {
    canonicalIndex,
    startOffset: trimmedRange.startOffset,
    endOffset: trimmedRange.endOffset
  }
}

function resolveHighlightRange(
  root: Element,
  highlight: QuoteHighlight
): { startPoint: { node: Node; offset: number }; endPoint: { node: Node; offset: number } } | null {
  const trimmedRange = resolveTrimmedHighlightRange(root, highlight)
  if (!trimmedRange) {
    return null
  }

  const startPoint = resolveCanonicalTextPoint(
    trimmedRange.canonicalIndex,
    trimmedRange.startOffset,
    'start'
  )
  const endPoint = resolveCanonicalTextPoint(
    trimmedRange.canonicalIndex,
    trimmedRange.endOffset,
    'end'
  )
  if (!startPoint || !endPoint) {
    return null
  }

  return {
    startPoint: normalizeHighlightBoundary(root, startPoint),
    endPoint: normalizeHighlightBoundary(root, endPoint)
  }
}

function findFormulaHighlightTarget(root: Element, highlight: QuoteHighlight): HTMLElement | null {
  const trimmedRange = resolveTrimmedHighlightRange(root, highlight)
  if (!trimmedRange) {
    return null
  }

  const formulaSegment = trimmedRange.canonicalIndex.segments.find((segment) => {
    return (
      (segment.kind === 'math' || segment.kind === 'display_math') &&
      segment.startOffset === trimmedRange.startOffset &&
      segment.endOffset === trimmedRange.endOffset &&
      isElementNode(segment.sourceNode)
    )
  })

  if (!formulaSegment || !isElementNode(formulaSegment.sourceNode)) {
    return null
  }

  return formulaSegment.sourceNode.querySelector<HTMLElement>('.katex-html')
}

function applyFormulaHighlight(root: Element, highlight: QuoteHighlight): boolean {
  const target = findFormulaHighlightTarget(root, highlight)
  if (!target) {
    return false
  }

  addClassNames(target, [
    PAPER_ANNOTATION_FORMULA_HIGHLIGHT_CLASS,
    ...getHighlightClassNames(highlight)
  ])
  applyHighlightMetadata(target, highlight)
  return true
}

function removeEmptyHighlightMarks(root: Element): void {
  root.querySelectorAll(PAPER_ANNOTATION_HIGHLIGHT_SELECTOR).forEach((mark) => {
    if ((mark.textContent || '').length > 0) {
      return
    }

    mark.remove()
  })
}

interface ApplyHighlightsResult {
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

    if (applyFormulaHighlight(root, highlight)) {
      continue
    }

    const mark = document.createElement('mark')
    mark.className = getHighlightClassNames(highlight).join(' ')
    applyHighlightMetadata(mark, highlight)

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
  collectTranslationHighlights,
  applyFormulaHighlight,
  findFormulaHighlightTarget,
  normalizeHighlightBoundary,
  resolveHighlightRange,
  removeEmptyHighlightMarks
}

/** 论文高亮渲染 Hook，提供收集批注高亮信息和应用高亮到 HTML 的能力 */
export function usePaperHighlightRenderer(): PaperHighlightRenderer {
  return {
    collectOriginalHighlights,
    collectTranslationHighlights,
    applyHighlightsToHtml
  }
}
