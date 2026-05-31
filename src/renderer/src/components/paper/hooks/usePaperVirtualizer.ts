import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { RenderedSegment } from './usePaperMarkdownEngine'
import { estimateSegmentHeight, getSegmentsLayoutKey } from './paperSegmentHeightEstimate'

export { estimateSegmentHeight, getSegmentsLayoutKey } from './paperSegmentHeightEstimate'

/** 虚拟项之间的间距（对应 --sm-space-3，虚拟列表中 CSS 相邻 margin 不生效） */
export const SEGMENT_BLOCK_GAP = 12

/** 离屏估算安全系数：宁可略大也不可偏小，避免 offset 累计偏小导致空白 */
const ESTIMATE_SAFETY_FACTOR = 1.1

export function clampContainerScrollTop(container: HTMLElement, preferredScrollTop?: number): void {
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
  const target = preferredScrollTop ?? container.scrollTop
  container.scrollTop = Math.min(Math.max(0, target), maxScrollTop)
}

/**
 * 统一以 getBoundingClientRect 读取「视觉高度」（含 CSS zoom 缩放）。
 *
 * TanStack 默认 measureElement 在 ResizeObserver 回调中使用 entry.borderBoxSize，
 * 该值不受 CSS zoom 影响（布局尺寸），会与 scrollTop（视觉像素）坐标系不一致。
 * 这里始终用 getBoundingClientRect，保证测量值与 scrollTop 在同一坐标系。
 */
function measureItemElement(element: Element): number {
  return Math.round(element.getBoundingClientRect().height)
}

interface UsePaperVirtualizerParams {
  segments: RenderedSegment[]
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  overscan?: number
  zoomLevel?: number
}

export function usePaperVirtualizer({
  segments,
  scrollContainerRef,
  overscan = 10,
  zoomLevel = 1
}: UsePaperVirtualizerParams) {
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments

  const zoomLevelRef = useRef(zoomLevel)
  zoomLevelRef.current = zoomLevel

  const layoutKey = useMemo(() => getSegmentsLayoutKey(segments), [segments])

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index: number): number => {
      const segment = segmentsRef.current[index]
      if (!segment) {
        return Math.round(48 * zoomLevelRef.current)
      }

      return Math.max(
        1,
        Math.round(estimateSegmentHeight(segment) * zoomLevelRef.current * ESTIMATE_SAFETY_FACTOR)
      )
    },
    measureElement: (element) => measureItemElement(element),
    overscan,
    getItemKey: (index) => segmentsRef.current[index]?.stableId ?? index,
    gap: SEGMENT_BLOCK_GAP,
    // RO 回调包裹进 rAF，合并连续布局变化，避免滚动中频繁同步测量引发抖动
    useAnimationFrameWithResizeObserver: true
  })

  // 重新测量当前已挂载的可见项（不清空缓存）。读取的是真实 DOM 高度，
  // TanStack 会据此修正后续 offset 与（仅针对视口上方变高的）滚动锚点。
  const remeasureMountedSegments = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    container.querySelectorAll<HTMLElement>('[data-index]').forEach((element) => {
      if (element.isConnected) {
        virtualizer.measureElement(element)
      }
    })
  }, [virtualizer, scrollContainerRef])

  // 完整失效：清空 TanStack 尺寸缓存后立即用当前 DOM 真实高度回填可见项，
  // 避免 measure() 后短暂回退到估算值造成的高度塌陷/闪烁。
  const invalidateAllMeasurements = useCallback(() => {
    virtualizer.measure()
    remeasureMountedSegments()
    requestAnimationFrame(() => {
      remeasureMountedSegments()
    })
  }, [virtualizer, remeasureMountedSegments])

  // 缩放变化：item 视觉高度随 zoom 改变，旧缓存全部失效后重新测量
  const previousZoomRef = useRef(zoomLevel)
  useLayoutEffect(() => {
    if (previousZoomRef.current === zoomLevel) {
      return
    }
    previousZoomRef.current = zoomLevel
    invalidateAllMeasurements()
  }, [zoomLevel, invalidateAllMeasurements])

  // 内容布局指纹变化（新论文、翻译批量返回等）：清空尺寸缓存重新测量。
  // 流式更新中已挂载项由 TanStack 内置 ResizeObserver 自动跟进，无需在此重复处理。
  const previousLayoutKeyRef = useRef(layoutKey)
  useLayoutEffect(() => {
    if (previousLayoutKeyRef.current === layoutKey) {
      return
    }
    previousLayoutKeyRef.current = layoutKey

    if (segments.length === 0) {
      virtualizer.measure()
      return
    }

    invalidateAllMeasurements()
  }, [layoutKey, segments.length, virtualizer, invalidateAllMeasurements])

  const measureElement = useCallback(
    (node: HTMLElement | null): void => {
      virtualizer.measureElement(node)
    },
    [virtualizer]
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

  return {
    virtualizer,
    measureElement,
    scrollToSegment,
    scrollToHeadingId,
    invalidateAllMeasurements,
    remeasureMountedSegments
  }
}
