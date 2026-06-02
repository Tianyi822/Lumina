import { useRef, useEffect, useCallback } from 'react'
import type { PaperReadingProgress } from '@shared/types/paper'
import { usePaperListStore, usePaperViewStore } from '@renderer/stores/paper'
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
  // 仅标记「有待保存的滚动」，scrollPercent 推迟到定时器触发时再读，
  // 避免每个 scroll 事件都读取 container.scrollHeight 触发强制回流，导致滚动卡顿。
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

  // Record exact scroll position（切换论文时恢复精确 scrollTop）
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
      if (
        latestPaperIdRef.current !== targetPaperId ||
        !scrollContainerRef.current ||
        zoomAnchor.isZooming() ||
        loadingRef.current
      ) {
        return
      }

      setMarkdownScrollPosition(targetPaperId, {
        scrollTop: scrollContainerRef.current.scrollTop,
        scrollLeft: scrollContainerRef.current.scrollLeft
      })
    })
  }, [paperId, setMarkdownScrollPosition, zoomAnchor, scrollContainerRef])

  // Save reading progress to backend
  const saveProgress = useCallback((targetPaperId: string, percent: number) => {
    if (!targetPaperId) return

    void window.api.paper.saveReadingProgress({
      paperId: targetPaperId,
      scrollPercentOriginal: translationVisibleRef.current
        ? undefined
        : Math.round(percent * 100) / 100,
      scrollPercentTranslated: translationVisibleRef.current
        ? Math.round(percent * 100) / 100
        : undefined,
      zoomLevel: zoomLevelRef.current,
      translationVisible: translationVisibleRef.current
    })
  }, [])

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
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
    if (!container) {
      return
    }
    saveProgress(targetPaperId, computeScrollPercent(container))
  }, [saveProgress, zoomAnchor, scrollContainerRef])

  const discardPendingReadingProgress = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    pendingDirtyRef.current = false
    pendingSavePaperIdRef.current = null
  }, [])

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
      if (!container) {
        return
      }
      // 滚动停止后才读取 scrollHeight 计算百分比，避免滚动过程中的强制回流
      saveProgress(targetPaperId, computeScrollPercent(container))
    }, 500)
  }, [paperId, saveProgress, zoomAnchor, scrollContainerRef])

  const handleScroll = useCallback(() => {
    if (isRestoringRef.current) return
    if (zoomAnchor.isZooming()) return
    if (loadingRef.current) return
    scheduleSave()
  }, [scheduleSave, zoomAnchor])

  /** 缩放手势结束后立即持久化阅读进度与精确 scrollTop（缩放期间 scroll 事件被跳过） */
  const persistReadingProgressNow = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container || !paperId) {
      return
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    pendingDirtyRef.current = false
    pendingSavePaperIdRef.current = null

    const percent = Math.round(computeScrollPercent(container) * 100) / 100
    const isTranslated = translationVisibleRef.current
    // 从 store 读取已有进度，保留未更新的那个状态字段
    const existingProgress = usePaperListStore
      .getState()
      .papers.find((p) => p.id === paperId)?.readingProgress
    const progress: PaperReadingProgress = {
      scrollPercentOriginal: isTranslated
        ? (existingProgress?.scrollPercentOriginal ?? 0)
        : percent,
      scrollPercentTranslated: isTranslated
        ? percent
        : (existingProgress?.scrollPercentTranslated ?? 0),
      zoomLevel: zoomLevelRef.current,
      readAt: new Date().toISOString(),
      translationVisible: isTranslated
    }

    setMarkdownScrollPosition(paperId, {
      scrollTop: container.scrollTop,
      scrollLeft: container.scrollLeft
    })

    void window.api.paper.saveReadingProgress({
      paperId,
      scrollPercentOriginal: isTranslated ? undefined : percent,
      scrollPercentTranslated: isTranslated ? percent : undefined,
      zoomLevel: progress.zoomLevel,
      translationVisible: progress.translationVisible
    })

    usePaperListStore.getState().updatePaperInList(paperId, { readingProgress: progress })
  }, [paperId, setMarkdownScrollPosition, scrollContainerRef])

  // Setup scroll listener for reading progress
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

      // 选取对应译文状态的滚动百分比
      const isTranslated = progress.translationVisible ?? false
      const percent = isTranslated
        ? (progress.scrollPercentTranslated ?? progress.scrollPercentOriginal ?? 0)
        : (progress.scrollPercentOriginal ?? progress.scrollPercentTranslated ?? 0)

      container.scrollTop = (percent / 100) * scrollableHeight
      clampContainerScrollTop(container)
      return true
    },
    [readingProgress, getMarkdownScrollPosition, scrollContainerRef]
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
      const maxAttempts = 8

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
        if (attempt >= maxAttempts) {
          isRestoringRef.current = false
          return
        }

        requestAnimationFrame(tryRestore)
      }

      requestAnimationFrame(tryRestore)
    },
    [readingProgress, getMarkdownScrollPosition, restoreReadingProgressScroll]
  )

  // Restore exact session scroll or persisted reading progress after current content is rendered.
  const restoreScrollPosition = useCallback(
    async (targetPaperId: string) => {
      scheduleReadingProgressRestore(targetPaperId)
    },
    [scheduleReadingProgressRestore]
  )

  // 论文切换时取消旧任务；pending 保存只允许写回原论文，不能落到新论文上。
  useEffect(() => {
    discardPendingReadingProgress()
    restoreRunIdRef.current += 1
    isRestoringRef.current = false
  }, [paperId, discardPendingReadingProgress])

  // Restore on loading complete（初始值 true 确保 remount 时也能触发恢复）
  const wasLoadingRef = useRef(true)
  useEffect(() => {
    const wasLoading = wasLoadingRef.current
    wasLoadingRef.current = loading

    if (loading || !wasLoading) return

    scheduleReadingProgressRestore(paperId)
  }, [loading, paperId, scheduleReadingProgressRestore])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      flushPendingSave()
      // 直接同步写入滚动位置，不使用 RAF，避免组件卸载后 ref 被置空导致位置丢失
      const container = scrollContainerRef.current
      const currentId = latestPaperIdRef.current
      if (container && currentId && !loadingRef.current && !zoomAnchor.isZooming()) {
        setMarkdownScrollPosition(currentId, {
          scrollTop: container.scrollTop,
          scrollLeft: container.scrollLeft
        })
      }
    }
  }, [])

  return {
    recordScrollPosition,
    restoreScrollPosition,
    persistReadingProgressNow,
    discardPendingReadingProgress
  }
}
