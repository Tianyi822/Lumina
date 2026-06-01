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

/** 缩放布局同步：测量稳定后由视图层修正 scrollTop（与 TanStack 自动补偿互斥） */
export interface PaperZoomLayoutSync {
  onAfterRemeasure: (container: HTMLElement) => void
}

interface UsePaperVirtualizerParams {
  segments: RenderedSegment[]
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  overscan?: number
  zoomLevel?: number
  /** 由 PaperMarkdownView 注入，在 zoom 测量完成后的 rAF 中调用 */
  zoomLayoutSyncRef?: React.MutableRefObject<PaperZoomLayoutSync | null>
}

export function usePaperVirtualizer({
  segments,
  scrollContainerRef,
  overscan = 10,
  zoomLevel = 1,
  zoomLayoutSyncRef
}: UsePaperVirtualizerParams) {
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments

  const zoomLevelRef = useRef(zoomLevel)
  zoomLevelRef.current = zoomLevel

  /** 缩放会话进行中时为 true，禁用 TanStack 自动 scrollTop 补偿，避免与 useZoomAnchor 打架 */
  const isZoomingRef = useRef(false)

  /**
   * 待处理的缩放锚点修正。
   *
   * 缩放时若在「旧 zoom 的提交帧」内同步改 scrollTop，放大场景下会被旧的较小 scrollHeight
   * 截断；若放到 requestAnimationFrame 里，又会比尺寸/zoom 的提交晚一帧，绘制时内容已按新
   * zoom 定位但 scrollTop 仍是旧值 → 视口跳动（误差 ≈ 锚点距顶部距离 ×（新-旧 zoom），顶部≈0
   * 故流畅，中部/底部剧烈抖动）。
   *
   * 解决：把修正登记为待处理，由 totalSize 变化驱动的 layoutEffect 在「新 zoom 的尺寸提交后、
   * 绘制前」执行，此时 scrollHeight 已是新值，不会被截断，也无滞后帧。
   */
  const pendingZoomCorrectionRef = useRef<((container: HTMLElement) => void) | null>(null)

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

  // 滚动锚点补偿策略（运行时 API，d.ts 已导出该字段）：
  // - 缩放期间：返回 false，由 useZoomAnchor 单独修正 scrollTop，避免双源打架；
  // - 正常滚动：复刻 TanStack 默认行为——仅当「变化项位于视口上方」且「非向上滚动」时才补偿。
  //   早期实现无条件返回 true，会让视口「下方」项首次测量（估算→真实，产生 delta）时也触发
  //   scrollTop 补偿，导致向下滚动时内容被反复拉动，表现为滚动闪动 / 卡顿。
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
    if (isZoomingRef.current) {
      return false
    }
    const container = scrollContainerRef.current
    if (!container) {
      return false
    }
    return item.start < container.scrollTop && instance.scrollDirection !== 'backward'
  }

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

  /** 执行待处理的缩放锚点修正（在新 zoom 尺寸提交后、绘制前调用，scrollHeight 已正确） */
  const runPendingZoomCorrection = useCallback(() => {
    const correct = pendingZoomCorrectionRef.current
    if (!correct) {
      return
    }
    const container = scrollContainerRef.current
    if (!container) {
      return
    }
    pendingZoomCorrectionRef.current = null
    // 此刻 N+1 已挂载新可视区间，先精确测量当前挂载项再修正锚点，避免上方新挂载项仍用估算高度
    remeasureMountedSegments()
    correct(container)
  }, [remeasureMountedSegments, scrollContainerRef])

  /**
   * 缩放步进：按 ratio 等比缩放已缓存高度，避免 measure() 清空后回退到 estimate×1.1 导致段间距突然变大。
   * 未进入 itemSizeCache 的项仍由 estimateSize（已含当前 zoom）承担。
   *
   * 锚点修正不在此同步执行（旧 zoom 的 scrollHeight 会截断放大目标），而是登记为待处理，
   * 由 totalSize 驱动的 layoutEffect 在新尺寸提交后修正；rAF 仅作为 totalSize 未变化时的兜底。
   */
  const scaleZoomMeasurements = useCallback(
    (ratio: number, onAfterRemeasure?: (container: HTMLElement) => void) => {
      if (ratio !== 1) {
        const snapshot = virtualizer.takeSnapshot()
        for (const item of snapshot) {
          virtualizer.resizeItem(item.index, Math.max(1, Math.round(item.size * ratio)))
        }
      }
      remeasureMountedSegments()
      if (onAfterRemeasure) {
        pendingZoomCorrectionRef.current = onAfterRemeasure
        requestAnimationFrame(runPendingZoomCorrection)
      }
    },
    [virtualizer, remeasureMountedSegments, runPendingZoomCorrection]
  )

  /** 缩放手势结束：仅重测已挂载项，不 measure() 清空缓存 */
  const finalizeZoomRemeasure = useCallback(
    (onAfterRemeasure?: (container: HTMLElement | null) => void) => {
      remeasureMountedSegments()
      requestAnimationFrame(() => {
        remeasureMountedSegments()
        onAfterRemeasure?.(scrollContainerRef.current)
      })
    },
    [remeasureMountedSegments, scrollContainerRef]
  )

  // 完整失效：清空 TanStack 尺寸缓存后立即用当前 DOM 真实高度回填可见项，
  // 避免 measure() 后短暂回退到估算值造成的高度塌陷/闪烁。
  const invalidateAllMeasurements = useCallback(
    (onAfterRemeasure?: (container: HTMLElement) => void) => {
      virtualizer.measure()
      remeasureMountedSegments()
      requestAnimationFrame(() => {
        remeasureMountedSegments()
        const container = scrollContainerRef.current
        if (container) {
          onAfterRemeasure?.(container)
        }
      })
    },
    [virtualizer, remeasureMountedSegments, scrollContainerRef]
  )

  // 缩放变化：等比缩放缓存 + 重测可见项（不在此调用 measure()）
  const previousZoomRef = useRef(zoomLevel)
  useLayoutEffect(() => {
    if (previousZoomRef.current === zoomLevel) {
      return
    }
    const prevZoom = previousZoomRef.current
    const ratio = zoomLevel / prevZoom
    previousZoomRef.current = zoomLevel
    isZoomingRef.current = true
    scaleZoomMeasurements(ratio, (container) => {
      zoomLayoutSyncRef?.current?.onAfterRemeasure(container)
    })
  }, [zoomLevel, scaleZoomMeasurements, zoomLayoutSyncRef])

  // totalSize 在缩放尺寸缩放（resizeItem）提交后变化，此 layoutEffect 即在该提交后、绘制前运行，
  // 此时虚拟容器高度已是新 zoom 的总高、scrollHeight 正确，执行待处理锚点修正不会被旧高度截断，
  // 也不存在 rAF 滞后帧。非缩放期间 pendingZoomCorrectionRef 为空，提前返回，无副作用。
  const totalSize = virtualizer.getTotalSize()
  useLayoutEffect(() => {
    runPendingZoomCorrection()
  }, [totalSize, runPendingZoomCorrection])

  // 内容布局指纹变化时的重测策略：
  // - 论文切换（段落数量或首个 stableId 变化）：需要 virtualizer.measure() 清空全部缓存，
  //   因为旧缓存与新论文的段落完全不对应。
  // - 同一论文内的布局变化（翻译显隐切换、翻译批量返回等）：仅重测已挂载段落，
  //   保留非可见段落的缓存尺寸，避免回退到估算值×1.1 的安全系数导致段间距膨胀。
  //   非可见段落的尺寸由 TanStack 内置 ResizeObserver 在进入视口时自动修正。
  const previousLayoutKeyRef = useRef(layoutKey)
  const previousFirstStableIdRef = useRef(segments[0]?.stableId)
  const previousSegmentCountRef = useRef(segments.length)
  useLayoutEffect(() => {
    if (previousLayoutKeyRef.current === layoutKey) {
      return
    }
    previousLayoutKeyRef.current = layoutKey

    if (segments.length === 0) {
      virtualizer.measure()
      return
    }

    const firstStableId = segments[0]?.stableId
    const isPaperChange =
      previousSegmentCountRef.current !== segments.length ||
      previousFirstStableIdRef.current !== firstStableId

    previousFirstStableIdRef.current = firstStableId
    previousSegmentCountRef.current = segments.length

    if (isPaperChange) {
      invalidateAllMeasurements()
    } else {
      // 同一论文内的布局变化：仅重测已挂载项，不清空缓存
      remeasureMountedSegments()
      requestAnimationFrame(() => {
        remeasureMountedSegments()
      })
    }
  }, [layoutKey, segments, virtualizer, invalidateAllMeasurements, remeasureMountedSegments])

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
      const index = segments.findIndex((s) => s.segmentAnchorId === headingId)
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
    scaleZoomMeasurements,
    finalizeZoomRemeasure,
    remeasureMountedSegments,
    isZoomingRef
  }
}
