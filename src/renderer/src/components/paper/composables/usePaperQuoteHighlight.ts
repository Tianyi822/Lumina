import type { PaperQuote } from '@shared/types/chat'
import { findPaperTextAnchorOffset } from '@shared/utils/paperAnnotationAnchors'
import { buildCanonicalTextIndex } from './paperCanonicalTextIndex'
import type { CanonicalTextSegment } from './paperCanonicalTextIndex'

interface PaperQuoteHighlightController {
  scrollToQuoteAndHighlight: (quote: PaperQuote) => void
}

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

function wrapTextSegment(
  segment: CanonicalTextSegment,
  rangeStartOffset: number,
  rangeEndOffset: number,
  quoteId: string
): HTMLElement | null {
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
      segment.kind === 'text' && segment.endOffset > startOffset && segment.startOffset < endOffset
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
  segmentElement.scrollIntoView({ behavior: 'smooth', block: 'center' })

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
  }, 1800)
}

export function usePaperQuoteHighlight(): PaperQuoteHighlightController {
  return { scrollToQuoteAndHighlight }
}
