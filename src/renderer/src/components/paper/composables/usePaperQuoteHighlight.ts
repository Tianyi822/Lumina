import type { PaperQuote } from '@shared/types/chat'
import { findPaperTextAnchorOffset } from '@shared/utils/paperAnnotationAnchors'
import { buildCanonicalTextIndex, resolveCanonicalTextPoint } from './paperCanonicalTextIndex'

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

function highlightQuoteText(surface: HTMLElement, quote: PaperQuote): HTMLElement | null {
  const contentRoot = surface.firstElementChild || surface
  const canonicalIndex = buildCanonicalTextIndex(contentRoot)
  const startOffset = findPaperTextAnchorOffset(canonicalIndex.text, quote.textAnchor)
  if (startOffset === null) {
    return null
  }

  const endOffset = startOffset + quote.textAnchor.selectedText.length
  const startPoint = resolveCanonicalTextPoint(canonicalIndex, startOffset, 'start')
  const endPoint = resolveCanonicalTextPoint(canonicalIndex, endOffset, 'end')
  if (!startPoint || !endPoint) {
    return null
  }

  const range = document.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  if (range.collapsed) {
    return null
  }

  const mark = document.createElement('mark')
  mark.className = 'paper-markdown-view__quote-highlight'
  mark.dataset.paperQuoteId = quote.id
  const fragment = range.extractContents()
  mark.appendChild(fragment)
  range.insertNode(mark)
  return mark
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
