import { useRef, useEffect, useCallback } from 'react'
import type { PaperReadingProgress } from '@shared/types/paper'
import { usePaperListStore, usePaperViewStore } from '@renderer/stores/paper'
import { clampContainerScrollTop } from './usePaperVirtualizer'
import type { ZoomAnchorController } from '../composables/useZoomAnchor'
import {
  buildReadingProgressPatch,
  computeScrollPercent,
  isScrollContainerReady,
  isScrollTopSettled,
  resolveScrollPercentForRestore
} from './markdownScrollPersistenceUtils'

interface UseMarkdownScrollPersistenceParams {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  paperId: string
  readingProgress?: PaperReadingProgress | null
  loading: boolean
  zoomAnchor: ZoomAnchorController
  zoomLevel: number
  translationVisible: boolean
}

const READING_PROGRESS_SAVE_DEBOUNCE_MS = 500
const READING_PROGRESS_RESTORE_MAX_ATTEMPTS = 120

/** 管理 Markdown 视图的滚动位置持久化：缩放恢复、阅读进度保存和会话滚动位置恢复 */
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

  const scrollRafIdRef = useRef<number | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDirtyRef = useRef(false)
  const pendingSavePaperIdRef = useRef<string | null>(null)
  const isRestoringRef = useRef(false)
  const restoreRunIdRef = useRef(0)
  const latestPaperIdRef = useRef(paperId)
  latestPaperIdRef.current = paperId
  const loadingRef = useRef(loading)
  loadingRef.current = loading
  const zoomLevelRef = useRef(zoomLevel)
  zoomLevelRef.current = zoomLevel
  const translationVisibleRef = useRef(translationVisible)
  translationVisibleRef.current = translationVisible

  const syncSessionScrollPosition = useCallback(
    (targetPaperId: string, container: HTMLElement) => {
      if (!targetPaperId) return
      setMarkdownScrollPosition(targetPaperId, {
        scrollTop: container.scrollTop,
        scrollLeft: container.scrollLeft
      })
    },
    [setMarkdownScrollPosition]
  )

  const persistReadingProgressForPaper = useCallback(
    (targetPaperId: string, container: HTMLElement) => {
      if (!targetPaperId || !isScrollContainerReady(container)) return

      const percent = Math.round(computeScrollPercent(container) * 100) / 100
      const isTranslated = translationVisibleRef.current
      const existingProgress = usePaperListStore
        .getState()
        .papers.find((p) => p.id === targetPaperId)?.readingProgress
      const progress = buildReadingProgressPatch(existingProgress, {
        percent,
        translationVisible: isTranslated,
        zoomLevel: zoomLevelRef.current
      })

      syncSessionScrollPosition(targetPaperId, container)

      void window.api.paper.saveReadingProgress({
        paperId: targetPaperId,
        scrollPercentOriginal: isTranslated ? undefined : percent,
        scrollPercentTranslated: isTranslated ? percent : undefined,
        zoomLevel: progress.zoomLevel,
        translationVisible: progress.translationVisible
      })

      usePaperListStore.getState().updatePaperInList(targetPaperId, { readingProgress: progress })
    },
    [syncSessionScrollPosition]
  )

  const saveProgress = useCallback(
    (targetPaperId: string, percent: number) => {
      if (!targetPaperId) return

      const isTranslated = translationVisibleRef.current
      const existingProgress = usePaperListStore
        .getState()
        .papers.find((p) => p.id === targetPaperId)?.readingProgress
      const progress = buildReadingProgressPatch(existingProgress, {
        percent,
        translationVisible: isTranslated,
        zoomLevel: zoomLevelRef.current
      })

      void window.api.paper.saveReadingProgress({
        paperId: targetPaperId,
        scrollPercentOriginal: isTranslated ? undefined : percent,
        scrollPercentTranslated: isTranslated ? percent : undefined,
        zoomLevel: progress.zoomLevel,
        translationVisible: progress.translationVisible
      })

      usePaperListStore.getState().updatePaperInList(targetPaperId, { readingProgress: progress })
    },
    []
  )

  const flushPendingSaveForPaper = useCallback(
    (targetPaperId: string | null) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      if (!targetPaperId || !pendingDirtyRef.current || pendingSavePaperIdRef.current !== targetPaperId) {
        return
      }

      pendingDirtyRef.current = false
      pendingSavePaperIdRef.current = null

      if (zoomAnchor.isZooming()) {
        return
      }

      const container = scrollContainerRef.current
      if (!container || !isScrollContainerReady(container)) {
        return
      }

      saveProgress(targetPaperId, computeScrollPercent(container))
      syncSessionScrollPosition(targetPaperId, container)
    },
    [saveProgress, syncSessionScrollPosition, zoomAnchor, scrollContainerRef]
  )

  const discardPendingReadingProgress = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    pendingDirtyRef.current = false
    pendingSavePaperIdRef.current = null
  }, [])

  const recordScrollPosition = useCallback(() => {
    const targetPaperId = paperId
    if (
      !targetPaperId ||
      !scrollContainerRef.current ||
      zoomAnchor.isZooming() ||
      loadingRef.current
    ) {
      return
    }

    if (scrollRafIdRef.current !== null) {
      return
    }

    scrollRafIdRef.current = requestAnimationFrame(() => {
      scrollRafIdRef.current = null
      const container = scrollContainerRef.current
      if (
        !container ||
        !isScrollContainerReady(container) ||
        zoomAnchor.isZooming() ||
        loadingRef.current
      ) {
        return
      }

      // 即使已切换论文，也要把旧论文的最后滚动位置写入会话缓存
      syncSessionScrollPosition(targetPaperId, container)
    })
  }, [paperId, syncSessionScrollPosition, zoomAnchor, scrollContainerRef])

  const scheduleSave = useCallback(() => {
    if (!paperId) {
      return
    }

    pendingDirtyRef.current = true
    pendingSavePaperIdRef.current = paperId
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      if (!pendingDirtyRef.current) {
        return
      }
      const targetPaperId = pendingSavePaperIdRef.current
      pendingDirtyRef.current = false
      pendingSavePaperIdRef.current = null
      if (!targetPaperId || targetPaperId !== latestPaperIdRef.current) {
        return
      }
      if (zoomAnchor.isZooming()) {
        return
      }
      const container = scrollContainerRef.current
      if (!container || !isScrollContainerReady(container)) {
        return
      }
      saveProgress(targetPaperId, computeScrollPercent(container))
      syncSessionScrollPosition(targetPaperId, container)
    }, READING_PROGRESS_SAVE_DEBOUNCE_MS)
  }, [paperId, saveProgress, syncSessionScrollPosition, zoomAnchor, scrollContainerRef])

  const handleScroll = useCallback(() => {
    if (isRestoringRef.current) return
    if (zoomAnchor.isZooming()) return
    if (loadingRef.current) return
    scheduleSave()
  }, [scheduleSave, zoomAnchor])

  const persistReadingProgressNow = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || !paperId) {
      return
    }

    discardPendingReadingProgress()
    persistReadingProgressForPaper(paperId, container)
  }, [discardPendingReadingProgress, paperId, persistReadingProgressForPaper, scrollContainerRef])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll, scrollContainerRef])

  const restoreReadingProgressScroll = useCallback(
    (targetPaperId: string) => {
      if (targetPaperId !== latestPaperIdRef.current) {
        return false
      }

      const container = scrollContainerRef.current
      if (!container) {
        return false
      }

      const storedPosition = getMarkdownScrollPosition(targetPaperId)
      const progress = readingProgress
      const fallbackPercent = progress
        ? resolveScrollPercentForRestore(progress, translationVisibleRef.current)
        : 0
      const shouldUseStoredPosition =
        storedPosition !== null && (storedPosition.scrollTop > 0 || fallbackPercent <= 0)

      if (shouldUseStoredPosition && storedPosition) {
        const targetScrollTop = storedPosition.scrollTop
        container.scrollTop = targetScrollTop
        container.scrollLeft = storedPosition.scrollLeft
        clampContainerScrollTop(container)
        if (!isScrollTopSettled(container, targetScrollTop)) {
          return false
        }
        return true
      }

      if (!progress) {
        return false
      }

      const scrollableHeight = container.scrollHeight - container.clientHeight
      if (scrollableHeight <= 0) {
        return false
      }

      const percent = resolveScrollPercentForRestore(progress, translationVisibleRef.current)
      const targetScrollTop = (percent / 100) * scrollableHeight
      container.scrollTop = targetScrollTop
      clampContainerScrollTop(container)
      if (!isScrollTopSettled(container, targetScrollTop)) {
        return false
      }
      syncSessionScrollPosition(targetPaperId, container)
      return true
    },
    [readingProgress, getMarkdownScrollPosition, scrollContainerRef, syncSessionScrollPosition]
  )

  const scheduleReadingProgressRestore = useCallback(
    (targetPaperId: string) => {
      if (!targetPaperId || loadingRef.current) {
        return
      }

      if (!getMarkdownScrollPosition(targetPaperId) && !readingProgress) {
        return
      }

      const restoreRunId = restoreRunIdRef.current + 1
      restoreRunIdRef.current = restoreRunId
      isRestoringRef.current = true

      let attempt = 0

      const tryRestore = (): void => {
        if (
          restoreRunIdRef.current !== restoreRunId ||
          latestPaperIdRef.current !== targetPaperId
        ) {
          isRestoringRef.current = false
          return
        }

        if (restoreReadingProgressScroll(targetPaperId)) {
          setTimeout(() => {
            if (restoreRunIdRef.current === restoreRunId) {
              isRestoringRef.current = false
            }
          }, 300)
          return
        }

        attempt += 1
        if (attempt >= READING_PROGRESS_RESTORE_MAX_ATTEMPTS) {
          isRestoringRef.current = false
          return
        }

        requestAnimationFrame(tryRestore)
      }

      requestAnimationFrame(tryRestore)
    },
    [readingProgress, getMarkdownScrollPosition, restoreReadingProgressScroll]
  )

  const restoreScrollPosition = useCallback(
    async (targetPaperId: string) => {
      scheduleReadingProgressRestore(targetPaperId)
    },
    [scheduleReadingProgressRestore]
  )

  const previousPaperIdRef = useRef(paperId)
  useEffect(() => {
    const previousPaperId = previousPaperIdRef.current
    if (previousPaperId !== paperId) {
      flushPendingSaveForPaper(previousPaperId)
      previousPaperIdRef.current = paperId
      restoreRunIdRef.current += 1
      isRestoringRef.current = false
    }
  }, [paperId, flushPendingSaveForPaper])

  const wasLoadingRef = useRef(loading)
  useEffect(() => {
    const wasLoading = wasLoadingRef.current
    wasLoadingRef.current = loading

    if (loading || !wasLoading) return

    scheduleReadingProgressRestore(paperId)
  }, [loading, paperId, scheduleReadingProgressRestore])

  useEffect(() => {
    return usePaperViewStore.getState().registerBeforePaperLeave(() => {
      persistReadingProgressNow()
    })
  }, [persistReadingProgressNow])

  useEffect(() => {
    return () => {
      flushPendingSaveForPaper(latestPaperIdRef.current)
    }
  }, [flushPendingSaveForPaper])

  return {
    recordScrollPosition,
    restoreScrollPosition,
    persistReadingProgressNow,
    discardPendingReadingProgress
  }
}
