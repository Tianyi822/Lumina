export const SegmentRenderPriority = {
  Visible: 0,
  Prefetch: 1,
  Idle: 2
} as const

export type SegmentRenderPriority =
  (typeof SegmentRenderPriority)[keyof typeof SegmentRenderPriority]

interface SchedulerOptions {
  concurrency: number
  onRender: (index: number) => Promise<void>
}

interface QueueItem {
  index: number
  priority: SegmentRenderPriority
}

/** 纯函数段落 HTML 渲染调度器（可单测，无 React 依赖） */
export function createSegmentRenderScheduler(options: SchedulerOptions) {
  const queue: QueueItem[] = []
  const inflight = new Set<number>()
  const completed = new Set<number>()
  let paused = false
  let runId = 0

  function enqueue(indices: number[], priority: SegmentRenderPriority): void {
    for (const index of indices) {
      if (completed.has(index) || inflight.has(index)) {
        continue
      }
      const existing = queue.find((item) => item.index === index)
      if (existing) {
        existing.priority = Math.min(existing.priority, priority) as SegmentRenderPriority
        continue
      }
      queue.push({ index, priority })
    }
    queue.sort((left, right) => left.priority - right.priority || left.index - right.index)
  }

  function pause(): void {
    paused = true
  }

  function resume(): void {
    paused = false
  }

  function reset(): void {
    runId += 1
    queue.length = 0
    inflight.clear()
    completed.clear()
    paused = false
  }

  async function pump(): Promise<void> {
    if (paused) {
      return
    }

    while (!paused && inflight.size < options.concurrency && queue.length > 0) {
      const item = queue.shift()
      if (!item || completed.has(item.index) || inflight.has(item.index)) {
        continue
      }

      const currentRun = runId
      inflight.add(item.index)

      void options
        .onRender(item.index)
        .then(() => {
          if (currentRun !== runId) {
            return
          }
          completed.add(item.index)
        })
        .finally(() => {
          inflight.delete(item.index)
          void pump()
        })
    }
  }

  async function drain(): Promise<void> {
    while (inflight.size > 0 || queue.length > 0) {
      await pump()
      if (inflight.size > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0)
        })
      }
    }
  }

  function markComplete(index: number): void {
    completed.add(index)
  }

  function isComplete(index: number): boolean {
    return completed.has(index)
  }

  function forget(indices: number | number[]): void {
    const list = Array.isArray(indices) ? indices : [indices]
    for (const index of list) {
      completed.delete(index)
    }
  }

  return { enqueue, pause, resume, reset, pump, drain, markComplete, isComplete, forget }
}
