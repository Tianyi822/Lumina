import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import type { PaperReadingProgress } from '@shared/types/paper'

const SAVE_DEBOUNCE_MS = 500

export interface UsePaperReadingProgressOptions {
  scrollContainer: Ref<HTMLElement | null>
  paperId: () => string | null
  loading: () => boolean
  zoomLevel: () => number
  readingProgress: () => PaperReadingProgress | null | undefined
  translationVisible: () => boolean
  setZoomLevel: (level: number, options?: { persist?: boolean }) => void
  isZooming?: () => boolean
}

function computeScrollPercent(container: HTMLElement): number {
  const scrollableHeight = container.scrollHeight - container.clientHeight
  if (scrollableHeight <= 0) return 0
  return Math.min(100, Math.max(0, (container.scrollTop / scrollableHeight) * 100))
}

export function usePaperReadingProgress(options: UsePaperReadingProgressOptions): void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingPercent: number | null = null
  let isRestoring = false

  function saveProgress(percent: number): void {
    const paperId = options.paperId()
    if (!paperId) return

    void window.api.paper.saveReadingProgress({
      paperId,
      scrollPercent: Math.round(percent * 100) / 100,
      zoomLevel: options.zoomLevel(),
      translationVisible: options.translationVisible()
    })
  }

  function debouncedSave(percent: number): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    pendingPercent = percent
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (pendingPercent !== null) {
        saveProgress(pendingPercent)
      }
    }, SAVE_DEBOUNCE_MS)
  }

  function handleScroll(): void {
    if (isRestoring) return
    if (options.isZooming?.()) return

    const container = options.scrollContainer.value
    if (!container) return

    const percent = computeScrollPercent(container)
    debouncedSave(percent)
  }

  function setupScrollListener(): void {
    const container = options.scrollContainer.value
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })
  }

  function teardownScrollListener(): void {
    const container = options.scrollContainer.value
    if (container) {
      container.removeEventListener('scroll', handleScroll)
    }
  }

  async function restoreProgress(): Promise<void> {
    const progress = options.readingProgress()
    if (!progress) return

    if (progress.zoomLevel && progress.zoomLevel !== options.zoomLevel()) {
      options.setZoomLevel(progress.zoomLevel, { persist: false })
    }

    await nextTick()
    await nextTick()
    isRestoring = true
    requestAnimationFrame(() => {
      const container = options.scrollContainer.value
      if (!container) {
        isRestoring = false
        return
      }

      const scrollableHeight = container.scrollHeight - container.clientHeight
      if (scrollableHeight > 0) {
        container.scrollTop = (progress.scrollPercent / 100) * scrollableHeight
      }

      setTimeout(() => {
        isRestoring = false
      }, 300)
    })
  }

  // scrollContainer 就绪时立即尝试恢复（处理切走再切回来、loading 不变的情况）
  watch(options.scrollContainer, (newContainer, oldContainer) => {
    if (oldContainer) {
      oldContainer.removeEventListener('scroll', handleScroll)
    }
    if (newContainer && !options.loading()) {
      setupScrollListener()
      void restoreProgress()
    }
  })

  // loading 从 true 变 false 时恢复（首次加载）
  watch(
    () => options.loading(),
    async (loading, wasLoading) => {
      if (loading || !wasLoading) return
      await restoreProgress()
    }
  )

  onBeforeUnmount(() => {
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    if (pendingPercent !== null) {
      saveProgress(pendingPercent)
    }
    teardownScrollListener()
  })
}
