import type { PaperReadingProgress } from '@shared/types/paper'

export function computeScrollPercent(container: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): number {
  const scrollableHeight = container.scrollHeight - container.clientHeight
  if (scrollableHeight <= 0) return 0
  return Math.min(100, Math.max(0, (container.scrollTop / scrollableHeight) * 100))
}

/** 容器是否已完成布局，可用于可靠读取/写入滚动进度 */
export function isScrollContainerReady(container: {
  scrollHeight: number
  clientHeight: number
}): boolean {
  return container.scrollHeight - container.clientHeight > 0
}

/** 目标 scrollTop 是否已在当前容器布局下就位（避免虚拟列表未测完时误判恢复成功） */
export function isScrollTopSettled(
  container: {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
  },
  targetScrollTop: number
): boolean {
  if (!isScrollContainerReady(container)) {
    return false
  }

  const maxScrollTop = container.scrollHeight - container.clientHeight
  if (targetScrollTop > maxScrollTop + 2) {
    return false
  }

  const expectedScrollTop = Math.min(Math.max(targetScrollTop, 0), maxScrollTop)
  return Math.abs(container.scrollTop - expectedScrollTop) <= 2
}

/** 按当前译文可见性选取应恢复的滚动百分比 */
export function resolveScrollPercentForRestore(
  progress: PaperReadingProgress,
  translationVisible: boolean
): number {
  if (translationVisible) {
    return progress.scrollPercentTranslated ?? progress.scrollPercentOriginal ?? 0
  }

  return progress.scrollPercentOriginal ?? progress.scrollPercentTranslated ?? 0
}

export function buildReadingProgressPatch(
  existing: PaperReadingProgress | undefined,
  params: {
    percent: number
    translationVisible: boolean
    zoomLevel: number
  }
): PaperReadingProgress {
  const roundedPercent = Math.round(params.percent * 100) / 100

  return {
    scrollPercentOriginal: params.translationVisible
      ? (existing?.scrollPercentOriginal ?? 0)
      : roundedPercent,
    scrollPercentTranslated: params.translationVisible
      ? roundedPercent
      : (existing?.scrollPercentTranslated ?? 0),
    zoomLevel: params.zoomLevel,
    readAt: new Date().toISOString(),
    translationVisible: params.translationVisible
  }
}
