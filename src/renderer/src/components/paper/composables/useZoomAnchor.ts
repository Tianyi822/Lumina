import { watch, type Ref } from 'vue'

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

export interface UseZoomAnchorOptions {
  containerRef: Ref<HTMLElement | null>
  zoomLevelRef: Ref<number>
}

export interface UseZoomAnchorResult {
  isZooming: () => boolean
}

export function useZoomAnchor(options: UseZoomAnchorOptions): UseZoomAnchorResult {
  let zooming = false
  let currentZoomId = 0

  watch(
    options.zoomLevelRef,
    (newZoom, oldZoom) => {
      const container = options.containerRef.value
      if (!container || !oldZoom || newZoom === oldZoom) {
        return
      }

      const thisZoomId = ++currentZoomId
      zooming = true

      const anchor = captureAnchor(container)

      requestAnimationFrame(() => {
        if (thisZoomId !== currentZoomId) {
          return
        }

        if (anchor) {
          restoreAnchor(container, anchor)
        }

        requestAnimationFrame(() => {
          if (thisZoomId === currentZoomId) {
            zooming = false
          }
        })
      })
    },
    { flush: 'pre' }
  )

  return {
    isZooming: () => zooming
  }
}
