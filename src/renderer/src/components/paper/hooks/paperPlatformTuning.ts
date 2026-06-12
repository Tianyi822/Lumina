/** 论文阅读器平台相关渲染参数 */

export function isPaperReaderWindowsPlatform(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  return document.documentElement.closest('.sm-workspace-page--windows') !== null
}

export function getPaperVirtualOverscan(): number {
  return isPaperReaderWindowsPlatform() ? 5 : 10
}

export const PAPER_SEGMENT_RENDER_CONCURRENCY = 2
export const PAPER_SEGMENT_PREFETCH_COUNT = 8
export const PAPER_SEGMENT_SCROLL_PAUSE_MS = 150
export const PAPER_SEGMENT_IDLE_BATCH_SIZE = 4
export const PAPER_SEGMENT_IDLE_MIN_REMAINING_MS = 8
