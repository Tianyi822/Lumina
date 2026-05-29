import { useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { RenderedSegment } from './usePaperMarkdownEngine'

const SEGMENT_KIND_ESTIMATES: Record<string, number> = {
  heading: 50,
  paragraph: 120,
  list: 100,
  table: 200,
  code: 80,
  quote: 100,
  image: 50
}

const TRANSLATION_EXTRA = 120

function estimateSegmentHeight(segment: RenderedSegment): number {
  const base = SEGMENT_KIND_ESTIMATES[segment.kind] ?? 100
  if (segment.showTranslation) {
    return base + TRANSLATION_EXTRA
  }
  return base
}

interface UsePaperVirtualizerParams {
  segments: RenderedSegment[]
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  overscan?: number
}

export function usePaperVirtualizer({
  segments,
  scrollContainerRef,
  overscan = 10
}: UsePaperVirtualizerParams) {
  const heightCacheRef = useRef(new Map<string, number>())

  const estimateSize = useCallback(
    (index: number): number => {
      const segment = segments[index]
      if (!segment) return 100
      const cached = heightCacheRef.current.get(segment.renderId)
      if (cached !== undefined) return cached
      return estimateSegmentHeight(segment)
    },
    [segments]
  )

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    overscan,
    getItemKey: (index) => segments[index]?.renderId ?? index
  })

  const wrappedMeasureElement = useCallback(
    (node: HTMLElement | null) => {
      virtualizer.measureElement(node)
      if (node) {
        const index = Number(node.dataset.index)
        const segment = segments[index]
        if (segment) {
          heightCacheRef.current.set(segment.renderId, node.offsetHeight)
        }
      }
    },
    [virtualizer, segments]
  )

  const scrollToSegment = useCallback(
    (stableId: string, options?: { align?: 'start' | 'center' | 'end' }): void => {
      const index = segments.findIndex((s) => s.stableId === stableId)
      if (index === -1) return
      virtualizer.scrollToIndex(index, {
        align: options?.align ?? 'start',
        behavior: 'smooth'
      })
    },
    [segments, virtualizer]
  )

  const scrollToHeadingId = useCallback(
    (headingId: string): boolean => {
      const index = segments.findIndex(
        (s) => s.kind === 'heading' && s.segmentAnchorId === headingId
      )
      if (index === -1) return false
      virtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' })
      return true
    },
    [segments, virtualizer]
  )

  const invalidateAllMeasurements = useCallback(() => {
    heightCacheRef.current.clear()
    virtualizer.measure()
  }, [virtualizer])

  return {
    virtualizer,
    wrappedMeasureElement,
    scrollToSegment,
    scrollToHeadingId,
    invalidateAllMeasurements
  }
}
