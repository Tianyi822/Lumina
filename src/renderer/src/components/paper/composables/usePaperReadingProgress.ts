import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'
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

  function flushPendingSave(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (pendingPercent !== null) {
      saveProgress(pendingPercent)
      pendingPercent = null
    }
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
        pendingPercent = null
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

    // 等待内容渲染（PaperMarkdownView 的 content watch 中的 renderContentAndSyncTables 需要时间）
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

  // 仅管理 scroll listener 的挂载/卸载
  watch(options.scrollContainer, (newContainer, oldContainer) => {
    if (oldContainer) {
      oldContainer.removeEventListener('scroll', handleScroll)
    }
    if (newContainer) {
      setupScrollListener()
    }
  })

  // 切换论文时：立即保存旧论文 pending 进度，然后恢复新论文进度
  watch(
    () => options.paperId(),
    (newPaperId, oldPaperId) => {
      if (oldPaperId) {
        flushPendingSave()
      }
      if (newPaperId && newPaperId !== oldPaperId) {
        void restoreProgress()
      }
    }
  )

  // loading 从 true 变 false 时恢复（首次加载/OCR 完成后）
  watch(
    () => options.loading(),
    async (loading, wasLoading) => {
      if (loading || !wasLoading) return
      await restoreProgress()
    }
  )

  // onMounted 时恢复 — 处理组件卸载再挂载（如切到知识库再切回来）的情况
  // 此时 loading 可能已经是 false，loading watch 不会触发
  onMounted(async () => {
    await nextTick()
    if (options.loading()) return
    await restoreProgress()
  })

  onBeforeUnmount(() => {
    flushPendingSave()
    teardownScrollListener()
  })
}
