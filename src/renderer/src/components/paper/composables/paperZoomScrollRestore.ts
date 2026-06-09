import type { Virtualizer } from '@tanstack/react-virtual'
import { clampContainerScrollTop } from '../hooks/usePaperVirtualizer'
import { restoreAnchor, type ZoomAnchor } from './useZoomAnchor'

interface SegmentWithStableId {
  stableId: string
}

export interface VirtualZoomItem {
  index: number
  start: number
  size: number
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(1, Math.max(0, value))
}

function getDistanceToItem(offset: number, item: VirtualZoomItem): number {
  const end = item.start + item.size
  if (offset < item.start) {
    return item.start - offset
  }
  if (offset > end) {
    return offset - end
  }
  return 0
}

/** 计算缩放后虚拟列表的目标 scrollTop，使指定项的中心对齐视口中央 */
export function calculateVirtualZoomTargetScrollTop(
  item: VirtualZoomItem,
  offsetRatio: number,
  clientHeight: number
): number {
  return item.start + item.size * clampRatio(offsetRatio) - clientHeight / 2
}

/**
 * 在虚拟列表坐标系中捕获视口中心锚点。
 *
 * 这里使用 scrollTop / item.start / item.size 的同一套视觉像素坐标，
 * 避免缩放后的 DOM 布局反查把中部阅读位置捕成已经偏移的内容。
 */
/** 从虚拟列表当前滚动位置捕获视口中心对应的锚点段 */
export function captureVirtualZoomAnchorFromItems(
  scrollTop: number,
  clientHeight: number,
  virtualItems: VirtualZoomItem[],
  segments: SegmentWithStableId[]
): ZoomAnchor | null {
  const centerOffset = scrollTop + clientHeight / 2
  let bestItem: VirtualZoomItem | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const item of virtualItems) {
    if (item.size <= 0) {
      continue
    }

    const segment = segments[item.index]
    if (!segment) {
      continue
    }

    const distance = getDistanceToItem(centerOffset, item)
    if (distance < bestDistance) {
      bestDistance = distance
      bestItem = item
    }
  }

  if (!bestItem) {
    return null
  }

  const segment = segments[bestItem.index]
  if (!segment) {
    return null
  }

  return {
    stableId: segment.stableId,
    offsetRatio: clampRatio((centerOffset - bestItem.start) / bestItem.size)
  }
}

/**
 * 用虚拟列表 measurements 将锚点段落在视口中心对齐（与 translateY / getTotalSize 同一坐标系）。
 * 找不到段或测量项时回退 DOM restoreAnchor。
 */
/** 根据锚点将虚拟列表滚动到指定段落，回退到 DOM restoreAnchor */
export function scrollToVirtualZoomAnchor(
  container: HTMLElement,
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  anchor: ZoomAnchor,
  segments: SegmentWithStableId[]
): boolean {
  const index = segments.findIndex((segment) => segment.stableId === anchor.stableId)
  if (index === -1) {
    restoreAnchor(container, anchor)
    return false
  }

  const measured = virtualizer.takeSnapshot().find((item) => item.index === index)
  if (!measured || measured.size <= 0) {
    restoreAnchor(container, anchor)
    return false
  }

  const offsetRatio = Math.min(1, Math.max(0, anchor.offsetRatio))
  const targetScrollTop = calculateVirtualZoomTargetScrollTop(
    measured,
    offsetRatio,
    container.clientHeight
  )
  clampContainerScrollTop(container, targetScrollTop)
  return true
}
