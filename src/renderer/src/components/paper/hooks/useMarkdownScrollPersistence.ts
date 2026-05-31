import { useRef, useEffect, useCallback } from 'react'
import type { PaperReadingProgress } from '@shared/types/paper'
import { usePaperViewStore } from '@renderer/stores/paper'
import { clampContainerScrollTop } from './usePaperVirtualizer'
import type { ZoomAnchorController } from '../composables/useZoomAnchor'

interface UseMarkdownScrollPersistenceParams {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  paperId: string
  readingProgress?: PaperReadingProgress | null
  loading: boolean
  zoomAnchor: ZoomAnchorController
  zoomLevel: number
  translationVisible: boolean
}

function computeScrollPercent(container: HTMLElement): number {
  const scrollableHeight = container.scrollHeight - container.clientHeight
  if (scrollableHeight <= 0) return 0
  return Math.min(100, Math.max(0, (container.scrollTop / scrollableHeight) * 100))
}

export function useMarkdownScrollPersistence({
  scrollContainerRef,
  paperId,
  readingProgress,
  loading,
  zoomAnchor,
  zoomLevel,
  translationVisible
}: UseMarkdownScrollPersistenceParams) {
  const setMarkdownScrollPosition = usePaperViewStore((state) => state.setMarkdownScrollPosition)
  const getMarkdownScrollPosition = usePaperViewStore((state) => state.getMarkdownScrollPosition)

  // Scroll RAF for markdown scroll position persistence
  const scrollRafIdRef = useRef<number | null>(null)

  // Reading progress persistence refs
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPercentRef = useRef<number | null>(null)
  const isRestoringRef = useRef(false)
  const zoomLevelRef = useRef(zoomLevel)
  zoomLevelRef.current = zoomLevel
  const translationVisibleRef = useRef(translationVisible)
  translationVisibleRef.current = translationVisible

  // Record exact scroll position（切换论文时恢复精确 scrollTop）
  const recordScrollPosition = useCallback(() => {
    if (!paperId || !scrollContainerRef.current || zoomAnchor.isZooming()) {
      return
    }

    if (scrollRafIdRef.current !== null) {
      return
    }

    scrollRafIdRef.current = requestAnimationFrame(() => {
      scrollRafIdRef.current = null
      if (!paperId || !scrollContainerRef.current) return
      setMarkdownScrollPosition(paperId, {
        scrollTop: scrollContainerRef.current.scrollTop,
        scrollLeft: scrollContainerRef.current.scrollLeft
      })
    })
  }, [paperId, setMarkdownScrollPosition, zoomAnchor, scrollContainerRef])

  // Restore exact scroll position (for switching between papers)
  const restoreScrollPosition = useCallback(
    async (targetPaperId: string) => {
      const position = getMarkdownScrollPosition(targetPaperId)
      if (!position) {
        return
      }

      requestAnimationFrame(() => {
        if (paperId !== targetPaperId || !scrollContainerRef.current) {
          return
        }

        scrollContainerRef.current.scrollTop = position.scrollTop
        scrollContainerRef.current.scrollLeft = position.scrollLeft
        clampContainerScrollTop(scrollContainerRef.current)
      })
    },
    [paperId, getMarkdownScrollPosition, scrollContainerRef]
  )

  // Save reading progress to backend
  const saveProgress = useCallback(
    (percent: number) => {
      if (!paperId) return

      void window.api.paper.saveReadingProgress({
        paperId,
        scrollPercent: Math.round(percent * 100) / 100,
        zoomLevel: zoomLevelRef.current,
        translationVisible: translationVisibleRef.current
      })
    },
    [paperId]
  )

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (pendingPercentRef.current !== null) {
      saveProgress(pendingPercentRef.current)
      pendingPercentRef.current = null
    }
  }, [saveProgress])

  const debouncedSave = useCallback(
    (percent: number) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      pendingPercentRef.current = percent
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        if (pendingPercentRef.current !== null) {
          saveProgress(pendingPercentRef.current)
          pendingPercentRef.current = null
        }
      }, 500)
    },
    [saveProgress]
  )

  const handleScroll = useCallback(() => {
    if (isRestoringRef.current) return
    if (zoomAnchor.isZooming()) return

    const container = scrollContainerRef.current
    if (!container) return

    const percent = computeScrollPercent(container)
    debouncedSave(percent)
  }, [debouncedSave, zoomAnchor, scrollContainerRef])

  // Setup scroll listener for reading progress
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll, scrollContainerRef])

  const restoreReadingProgressScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return false
    }

    const storedPosition = getMarkdownScrollPosition(paperId)
    if (storedPosition) {
      container.scrollTop = storedPosition.scrollTop
      container.scrollLeft = storedPosition.scrollLeft
      clampContainerScrollTop(container)
      return true
    }

    const progress = readingProgress
    if (!progress) {
      return false
    }

    const scrollableHeight = container.scrollHeight - container.clientHeight
    if (scrollableHeight <= 0) {
      return false
    }

    container.scrollTop = (progress.scrollPercent / 100) * scrollableHeight
    clampContainerScrollTop(container)
    return true
  }, [paperId, readingProgress, getMarkdownScrollPosition, scrollContainerRef])

  const scheduleReadingProgressRestore = useCallback(() => {
    isRestoringRef.current = true

    let attempt = 0
    const maxAttempts = 12

    const tryRestore = (): void => {
      if (restoreReadingProgressScroll()) {
        setTimeout(() => {
          isRestoringRef.current = false
        }, 300)
        return
      }

      attempt += 1
      if (attempt >= maxAttempts) {
        isRestoringRef.current = false
        return
      }

      requestAnimationFrame(tryRestore)
    }

    requestAnimationFrame(tryRestore)
  }, [restoreReadingProgressScroll])

  // Restore reading progress on paper change
  useEffect(() => {
    flushPendingSave()

    if (!readingProgress && !getMarkdownScrollPosition(paperId)) {
      return
    }

    scheduleReadingProgressRestore()
  }, [paperId])

  // Restore on loading complete
  const wasLoadingRef = useRef(loading)
  useEffect(() => {
    const wasLoading = wasLoadingRef.current
    wasLoadingRef.current = loading

    if (loading || !wasLoading) return

    if (!readingProgress && !getMarkdownScrollPosition(paperId)) {
      return
    }

    scheduleReadingProgressRestore()
  }, [loading])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      flushPendingSave()
      recordScrollPosition()
    }
  }, [])

  return {
    recordScrollPosition,
    restoreScrollPosition
  }
}
