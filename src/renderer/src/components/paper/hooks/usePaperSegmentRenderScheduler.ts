import { useCallback, useEffect, useRef } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import {
  createSegmentRenderScheduler,
  SegmentRenderPriority
} from './paperSegmentRenderSchedulerCore'
import {
  PAPER_SEGMENT_IDLE_BATCH_SIZE,
  PAPER_SEGMENT_IDLE_MIN_REMAINING_MS,
  PAPER_SEGMENT_PREFETCH_COUNT,
  PAPER_SEGMENT_RENDER_CONCURRENCY,
  PAPER_SEGMENT_SCROLL_PAUSE_MS
} from './paperPlatformTuning'

interface UsePaperSegmentRenderSchedulerParams {
  segmentCount: number
  segmentHtmlRevision: number
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer<HTMLDivElement, Element>
  renderSegmentAtIndex: (index: number) => Promise<void>
  isSegmentReady: (index: number) => boolean
  paperId: string
}

function scheduleIdleWork(work: (deadline?: IdleDeadline) => void): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(work)
    return
  }
  setTimeout(() => work(), 0)
}

/** 按虚拟列表可见性调度段落 HTML 懒渲染 */
export function usePaperSegmentRenderScheduler({
  segmentCount,
  segmentHtmlRevision,
  scrollContainerRef,
  virtualizer,
  renderSegmentAtIndex,
  isSegmentReady,
  paperId
}: UsePaperSegmentRenderSchedulerParams): void {
  const renderSegmentAtIndexRef = useRef(renderSegmentAtIndex)
  renderSegmentAtIndexRef.current = renderSegmentAtIndex
  const isSegmentReadyRef = useRef(isSegmentReady)
  isSegmentReadyRef.current = isSegmentReady

  const schedulerRef = useRef(
    createSegmentRenderScheduler({
      concurrency: PAPER_SEGMENT_RENDER_CONCURRENCY,
      onRender: async (index) => {
        if (isSegmentReadyRef.current(index)) {
          schedulerRef.current.markComplete(index)
          return
        }
        await renderSegmentAtIndexRef.current(index)
        schedulerRef.current.markComplete(index)
      }
    })
  )

  const scheduleIdleBatch = useCallback(() => {
    if (segmentCount === 0) {
      return
    }

    const pending: number[] = []
    for (let index = 0; index < segmentCount; index += 1) {
      if (!isSegmentReadyRef.current(index) && !schedulerRef.current.isComplete(index)) {
        pending.push(index)
      }
      if (pending.length >= PAPER_SEGMENT_IDLE_BATCH_SIZE) {
        break
      }
    }
    if (pending.length === 0) {
      return
    }

    const run = (deadline?: IdleDeadline): void => {
      if (deadline && deadline.timeRemaining() < PAPER_SEGMENT_IDLE_MIN_REMAINING_MS) {
        scheduleIdleWork(run)
        return
      }

      const batch = pending.splice(0, PAPER_SEGMENT_IDLE_BATCH_SIZE)
      schedulerRef.current.enqueue(batch, SegmentRenderPriority.Idle)
      void schedulerRef.current.pump()

      if (pending.length > 0) {
        scheduleIdleWork(run)
      }
    }

    scheduleIdleWork(run)
  }, [segmentCount])

  const scheduleVisible = useCallback(() => {
    if (segmentCount === 0) {
      return
    }

    const items = virtualizer.getVirtualItems()
    if (items.length === 0) {
      const initial = Array.from(
        { length: Math.min(segmentCount, PAPER_SEGMENT_PREFETCH_COUNT + 2) },
        (_, index) => index
      )
      schedulerRef.current.enqueue(initial, SegmentRenderPriority.Visible)
      void schedulerRef.current.pump()
      return
    }

    const visible = items.map((item) => item.index)
    const min = Math.max(0, visible[0] - PAPER_SEGMENT_PREFETCH_COUNT)
    const max = Math.min(segmentCount - 1, visible[visible.length - 1] + PAPER_SEGMENT_PREFETCH_COUNT)
    const prefetch: number[] = []
    for (let index = min; index <= max; index += 1) {
      if (!visible.includes(index)) {
        prefetch.push(index)
      }
    }

    schedulerRef.current.enqueue(visible, SegmentRenderPriority.Visible)
    schedulerRef.current.enqueue(prefetch, SegmentRenderPriority.Prefetch)
    void schedulerRef.current.pump()
  }, [virtualizer, segmentCount])

  const scheduleVisibleRef = useRef(scheduleVisible)
  scheduleVisibleRef.current = scheduleVisible
  const scheduleIdleBatchRef = useRef(scheduleIdleBatch)
  scheduleIdleBatchRef.current = scheduleIdleBatch

  useEffect(() => {
    schedulerRef.current.reset()
    scheduleVisibleRef.current()
    scheduleIdleBatchRef.current()
  }, [paperId])

  useEffect(() => {
    for (let index = 0; index < segmentCount; index += 1) {
      if (!isSegmentReadyRef.current(index)) {
        schedulerRef.current.forget(index)
      }
    }
    scheduleVisibleRef.current()
  }, [segmentHtmlRevision, segmentCount])

  useEffect(() => {
    scheduleVisibleRef.current()
  })

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    let pauseTimer: ReturnType<typeof setTimeout> | null = null
    const onScroll = (): void => {
      schedulerRef.current.pause()
      if (pauseTimer) {
        clearTimeout(pauseTimer)
      }
      pauseTimer = setTimeout(() => {
        pauseTimer = null
        schedulerRef.current.resume()
        scheduleVisibleRef.current()
        scheduleIdleBatchRef.current()
      }, PAPER_SEGMENT_SCROLL_PAUSE_MS)
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (pauseTimer) {
        clearTimeout(pauseTimer)
      }
    }
  }, [scrollContainerRef, paperId])
}
