import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import type { PaperReadingProgress } from '@shared/types/paper'
import type { RenderedSegment } from './usePaperMarkdownEngine'

const SAVE_DEBOUNCE_MS = 4000

export interface UsePaperReadingProgressOptions {
  scrollContainer: Ref<HTMLElement | null>
  paperId: () => string | null
  renderedSegments: Ref<ReadonlyArray<RenderedSegment>>
  loading: () => boolean
  sourceRevisionId: () => string | undefined
  readingProgress: () => PaperReadingProgress | null | undefined
  translationVisible: () => boolean
  isZooming?: () => boolean
}

export function usePaperReadingProgress(options: UsePaperReadingProgressOptions): void {
  let observer: IntersectionObserver | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingStableId: string | null = null
  let observedElements: Element[] = []

  function saveProgress(stableId: string): void {
    const paperId = options.paperId()
    const sourceRevisionId = options.sourceRevisionId()
    if (!paperId || !sourceRevisionId) return

    void window.api.paper.saveReadingProgress({
      paperId,
      lastReadSegmentStableId: stableId,
      sourceRevisionId,
      translationVisible: options.translationVisible()
    })
  }

  function debouncedSave(stableId: string): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    pendingStableId = stableId
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (pendingStableId) {
        saveProgress(pendingStableId)
      }
    }, SAVE_DEBOUNCE_MS)
  }

  function setupObserver(): void {
    const container = options.scrollContainer.value
    if (!container) return

    observer = new IntersectionObserver(
      (entries) => {
        if (options.isZooming?.()) return

        let bestId: string | null = null
        let bestRatio = 0

        for (const entry of entries) {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio
            bestId = (entry.target as HTMLElement).dataset.paperSegmentStableId ?? null
          }
        }

        if (bestId) {
          debouncedSave(bestId)
        }
      },
      {
        root: container,
        rootMargin: '-10% 0px -40% 0px',
        threshold: [0, 0.25, 0.5]
      }
    )

    observeSegments()
  }

  function observeSegments(): void {
    if (!observer) return

    for (const el of observedElements) {
      observer.unobserve(el)
    }
    observedElements = []

    const container = options.scrollContainer.value
    if (!container) return

    const segments = container.querySelectorAll<HTMLElement>('[data-paper-segment-stable-id]')
    for (const el of segments) {
      observer.observe(el)
      observedElements.push(el)
    }
  }

  watch(options.renderedSegments, () => {
    void nextTick(() => {
      requestAnimationFrame(() => {
        observeSegments()
      })
    })
  })

  watch(
    () => options.loading(),
    async (loading, wasLoading) => {
      if (loading || !wasLoading) return

      const progress = options.readingProgress()
      if (!progress) return

      const currentRevisionId = options.sourceRevisionId()
      if (currentRevisionId && progress.sourceRevisionId !== currentRevisionId) return

      await nextTick()
      requestAnimationFrame(() => {
        const container = options.scrollContainer.value
        if (!container) return

        const target = container.querySelector<HTMLElement>(
          `[data-paper-segment-stable-id="${progress.lastReadSegmentStableId}"]`
        )
        if (target) {
          target.scrollIntoView({ behavior: 'instant', block: 'start' })
        }
      })
    }
  )

  watch(options.scrollContainer, (container) => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
    if (container) {
      setupObserver()
    }
  })

  onBeforeUnmount(() => {
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    if (pendingStableId) {
      saveProgress(pendingStableId)
    }
    if (observer) {
      observer.disconnect()
      observer = null
    }
  })
}
