import type { PaperQuote } from '@shared/types/chat'
import { findPaperTextAnchorOffset } from '@shared/utils/paperAnnotationAnchors'
import { buildCanonicalTextIndex } from './paperCanonicalTextIndex'
import type { CanonicalTextSegment } from './paperCanonicalTextIndex'

interface PaperQuoteHighlightController {
  scrollToQuoteAndHighlight: (quote: PaperQuote) => void
}

const QUOTE_HIGHLIGHT_DURATION_MS = 8000

function removeQuoteHighlights(): void {
  document.querySelectorAll('mark.paper-markdown-view__quote-highlight').forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) {
      return
    }

    mark.replaceWith(...Array.from(mark.childNodes))
    parent.normalize()
  })
}

function wrapMathSegment(segment: CanonicalTextSegment, quoteId: string): HTMLElement | null {
  const sourceNode = segment.sourceNode
  if (!(sourceNode instanceof Element)) {
    return null
  }

  if (sourceNode.closest('mark.paper-markdown-view__quote-highlight')) {
    return null
  }

  const parent = sourceNode.parentNode
  if (!parent) {
    return null
  }

  const mark = document.createElement('mark')
  mark.className = 'paper-markdown-view__quote-highlight'
  mark.dataset.paperQuoteId = quoteId
  parent.insertBefore(mark, sourceNode)
  mark.appendChild(sourceNode)
  return mark
}

function wrapTextSegment(
  segment: CanonicalTextSegment,
  rangeStartOffset: number,
  rangeEndOffset: number,
  quoteId: string
): HTMLElement | null {
  if (segment.kind === 'math') {
    return wrapMathSegment(segment, quoteId)
  }

  if (segment.kind !== 'text' || !(segment.sourceNode instanceof Text)) {
    return null
  }

  const localStartOffset = Math.max(0, rangeStartOffset - segment.startOffset)
  const localEndOffset = Math.min(segment.text.length, rangeEndOffset - segment.startOffset)
  if (localStartOffset >= localEndOffset) {
    return null
  }

  const sourceNode = segment.sourceNode
  if (sourceNode.parentElement?.closest('mark.paper-markdown-view__quote-highlight')) {
    return null
  }

  const text = sourceNode.textContent || ''
  if (!text) {
    return null
  }

  const afterNode =
    localEndOffset < text.length ? sourceNode.splitText(localEndOffset) : sourceNode.nextSibling
  const matchedNode = localStartOffset > 0 ? sourceNode.splitText(localStartOffset) : sourceNode
  const parent = matchedNode.parentNode
  if (!parent) {
    return null
  }

  const mark = document.createElement('mark')
  mark.className = 'paper-markdown-view__quote-highlight'
  mark.dataset.paperQuoteId = quoteId
  mark.textContent = matchedNode.textContent || ''
  parent.insertBefore(mark, afterNode)
  parent.removeChild(matchedNode)
  return mark
}

function highlightQuoteText(surface: HTMLElement, quote: PaperQuote): HTMLElement | null {
  const contentRoot = surface.firstElementChild || surface
  const canonicalIndex = buildCanonicalTextIndex(contentRoot)
  const startOffset = findPaperTextAnchorOffset(canonicalIndex.text, quote.textAnchor)
  if (startOffset === null) {
    return null
  }

  const endOffset = startOffset + quote.textAnchor.selectedText.length
  if (startOffset >= endOffset) {
    return null
  }

  const affectedSegments = canonicalIndex.segments.filter((segment) => {
    return (
      (segment.kind === 'text' || segment.kind === 'math') &&
      segment.endOffset > startOffset &&
      segment.startOffset < endOffset
    )
  })
  const marks: HTMLElement[] = []

  for (let index = affectedSegments.length - 1; index >= 0; index -= 1) {
    const mark = wrapTextSegment(affectedSegments[index], startOffset, endOffset, quote.id)
    if (mark) {
      marks.unshift(mark)
    }
  }

  return marks[0] || null
}

function scrollToQuoteAndHighlight(quote: PaperQuote): void {
  const segmentElement = document.querySelector<HTMLElement>(
    `[data-paper-segment-stable-id="${quote.segmentStableId}"]`
  )
  if (!segmentElement) {
    return
  }

  removeQuoteHighlights()

  const scrollContainer = segmentElement.closest<HTMLElement>('.paper-markdown-view__scroll')
  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect()
    const elementRect = segmentElement.getBoundingClientRect()
    const elementTopInContent = elementRect.top - containerRect.top + scrollContainer.scrollTop
    const targetScrollTop = elementTopInContent - containerRect.height / 2 + elementRect.height / 2
    scrollContainer.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    })
  } else {
    segmentElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const surface = segmentElement.querySelector<HTMLElement>(
    `[data-paper-selection-surface="true"][data-view-kind="${quote.viewKind}"]`
  )
  if (!surface) {
    return
  }

  const mark = highlightQuoteText(surface, quote)
  if (!mark) {
    return
  }

  window.setTimeout(() => {
    if (!mark.isConnected) {
      return
    }
    const parent = mark.parentNode
    mark.replaceWith(...Array.from(mark.childNodes))
    parent?.normalize()
  }, QUOTE_HIGHLIGHT_DURATION_MS)
}

export function usePaperQuoteHighlight(): PaperQuoteHighlightController {
  return { scrollToQuoteAndHighlight }
}
