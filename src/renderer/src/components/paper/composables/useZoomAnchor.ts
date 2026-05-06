export interface ZoomAnchor {
  stableId: string
  offsetRatio: number
}

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
  beginZoom(container: HTMLElement): void
  applyZoomFrame(container: HTMLElement): void
  endZoom(): void
  isZooming(): boolean
}

export function useZoomAnchor(): ZoomAnchorController {
  let zooming = false
  let anchor: ZoomAnchor | null = null

  return {
    beginZoom(container: HTMLElement): void {
      anchor = captureAnchor(container)
      zooming = true
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
    }
  }
}
