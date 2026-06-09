export interface ZoomAnchor {
  stableId: string
  offsetRatio: number
}

/** 从容器视口中心位置捕获锚点（stableId + 偏移比例）用于缩放后恢复 */
export function captureAnchor(container: HTMLElement): ZoomAnchor | null {
  const containerRect = container.getBoundingClientRect()
  const centerX = containerRect.left + containerRect.width / 2
  const centerY = containerRect.top + containerRect.height / 2

  const el = document.elementFromPoint(centerX, centerY)
  if (!el) {
    return null
  }

  const anchorEl = el.closest<HTMLElement>('[data-paper-segment-stable-id], [data-page-index]')
  if (!anchorEl || !container.contains(anchorEl)) {
    return null
  }

  const rect = anchorEl.getBoundingClientRect()
  const stableId = anchorEl.dataset.paperSegmentStableId ?? anchorEl.dataset.pageIndex ?? null
  if (stableId === null) {
    return null
  }

  return {
    stableId,
    offsetRatio: (centerY - rect.top) / rect.height
  }
}

/** 根据锚点恢复容器滚动位置，将锚点段对齐到缩放前的视口位置 */
export function restoreAnchor(container: HTMLElement, anchor: ZoomAnchor): void {
  const containerRect = container.getBoundingClientRect()
  const viewportCenterY = containerRect.top + containerRect.height / 2

  const selector = /^\d+$/.test(anchor.stableId)
    ? `[data-page-index="${anchor.stableId}"]`
    : `[data-paper-segment-stable-id="${anchor.stableId}"]`

  const element = container.querySelector<HTMLElement>(selector)
  if (!element) {
    return
  }

  const rect = element.getBoundingClientRect()
  const targetTop = viewportCenterY - rect.height * anchor.offsetRatio
  const delta = rect.top - targetTop

  container.scrollTop += delta
}

export interface ZoomAnchorController {
  beginZoom(container: HTMLElement): boolean
  beginZoomWithAnchor(anchor: ZoomAnchor | null): boolean
  applyZoomFrame(container: HTMLElement): void
  endZoom(): void
  isZooming(): boolean
  getAnchor(): ZoomAnchor | null
}

/** 缩放锚点控制器 Hook，在缩放过程中捕获和恢复视口位置 */
export function useZoomAnchor(): ZoomAnchorController {
  let zooming = false
  let anchor: ZoomAnchor | null = null

  return {
    beginZoom(container: HTMLElement): boolean {
      anchor = captureAnchor(container)
      zooming = true
      return anchor !== null
    },

    beginZoomWithAnchor(nextAnchor: ZoomAnchor | null): boolean {
      anchor = nextAnchor
      zooming = true
      return anchor !== null
    },

    applyZoomFrame(container: HTMLElement): void {
      if (anchor) {
        restoreAnchor(container, anchor)
      }
    },

    endZoom(): void {
      zooming = false
      anchor = null
    },

    isZooming(): boolean {
      return zooming
    },

    getAnchor(): ZoomAnchor | null {
      return anchor
    }
  }
}
