import { useLayoutEffect, useRef, type RefObject } from 'react'

interface UseAnchoredTerminalOverlayOptions {
  active: boolean
  anchorElement: HTMLElement | null
}

/** 隐藏时将终端面板移出视口但保持尺寸，避免 xterm/远程会话被销毁 */
const HIDDEN_LEFT = '-10000px'
const HIDDEN_WIDTH = '960px'
const HIDDEN_HEIGHT = '540px'

function applyHiddenPoolStyles(wrapper: HTMLDivElement): void {
  wrapper.style.position = 'fixed'
  wrapper.style.left = HIDDEN_LEFT
  wrapper.style.top = '0'
  wrapper.style.width = HIDDEN_WIDTH
  wrapper.style.height = HIDDEN_HEIGHT
  wrapper.style.visibility = 'hidden'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.zIndex = '-1'
}

export function useAnchoredTerminalOverlay({
  active,
  anchorElement
}: UseAnchoredTerminalOverlayOptions): RefObject<HTMLDivElement | null> {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(active)
  const anchorRef = useRef(anchorElement)

  activeRef.current = active
  anchorRef.current = anchorElement

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) {
      return
    }

    let syncRafId = 0
    let retryRafId = 0
    // 锚点尺寸为零时最多重试 12 帧
    let retryCount = 0
    let lastRectKey = ''

    const cancelScheduledSync = (): void => {
      if (syncRafId) {
        window.cancelAnimationFrame(syncRafId)
        syncRafId = 0
      }
      if (retryRafId) {
        window.cancelAnimationFrame(retryRafId)
        retryRafId = 0
      }
    }

    const applySync = (): void => {
      const currentActive = activeRef.current
      const currentAnchor = anchorRef.current
      // 锚点无效或未激活 → 隐藏到池中
      if (!currentActive || !currentAnchor || !currentAnchor.isConnected) {
        lastRectKey = ''
        applyHiddenPoolStyles(wrapper)
        return
      }

      const rect = currentAnchor.getBoundingClientRect()
      const rectKey = `${rect.left}|${rect.top}|${rect.width}|${rect.height}`
      const hasSize = rect.width > 0 && rect.height > 0

      // 矩形未变化则跳过
      if (rectKey === lastRectKey) {
        return
      }
      lastRectKey = rectKey

      wrapper.style.position = 'fixed'
      wrapper.style.left = `${rect.left}px`
      wrapper.style.top = `${rect.top}px`
      wrapper.style.width = `${Math.max(rect.width, 0)}px`
      wrapper.style.height = `${Math.max(rect.height, 0)}px`
      wrapper.style.visibility = hasSize ? 'visible' : 'hidden'
      wrapper.style.pointerEvents = hasSize ? 'auto' : 'none'
      wrapper.style.zIndex = '1'

      if (!hasSize && retryCount < 12) {
        retryCount += 1
        retryRafId = window.requestAnimationFrame(() => {
          retryRafId = 0
          lastRectKey = ''
          scheduleSync()
        })
      } else if (hasSize) {
        retryCount = 0
      }
    }

    const scheduleSync = (): void => {
      if (syncRafId) {
        return
      }
      syncRafId = window.requestAnimationFrame(() => {
        syncRafId = 0
        applySync()
      })
    }

    if (!active || !anchorElement) {
      cancelScheduledSync()
      applyHiddenPoolStyles(wrapper)
      return () => {
        cancelScheduledSync()
        applyHiddenPoolStyles(wrapper)
      }
    }

    scheduleSync()

    const resizeObserver = new ResizeObserver(() => {
      if (!activeRef.current) {
        return
      }
      retryCount = 0
      lastRectKey = ''
      scheduleSync()
    })
    resizeObserver.observe(anchorElement)

    const handleLayoutChange = (): void => {
      retryCount = 0
      lastRectKey = ''
      scheduleSync()
    }
    window.addEventListener('resize', handleLayoutChange)
    window.addEventListener('scroll', handleLayoutChange, true)

    return () => {
      cancelScheduledSync()
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleLayoutChange)
      window.removeEventListener('scroll', handleLayoutChange, true)
      applyHiddenPoolStyles(wrapper)
    }
  }, [active, anchorElement])

  return wrapperRef
}
