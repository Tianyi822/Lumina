// PERF-PROBE:firstpaint — 临时验证代码，根因确认后整体移除

/** 阶段时间区间（performance.now() 时间基） */
export interface PerfPhaseSpan {
  name: string
  start: number
  end: number
}

/** 长任务条目 */
export interface PerfLongTask {
  startTime: number
  duration: number
}

/** 归类后的长任务 */
export interface PerfLongTaskClassified extends PerfLongTask {
  phase: string
}

/** 将 longtask 归类到与其区间重叠最多的阶段；都不重叠则 'other' */
export function classifyLongTask(
  task: PerfLongTask,
  phases: PerfPhaseSpan[]
): PerfLongTaskClassified {
  const taskEnd = task.startTime + task.duration
  let bestPhase = 'other'
  let bestOverlap = 0
  for (const phase of phases) {
    const overlapStart = Math.max(task.startTime, phase.start)
    const overlapEnd = Math.min(taskEnd, phase.end)
    const overlap = Math.max(0, overlapEnd - overlapStart)
    if (overlap > bestOverlap) {
      bestOverlap = overlap
      bestPhase = phase.name
    }
  }
  return { startTime: task.startTime, duration: task.duration, phase: bestPhase }
}

/** 按阶段汇总 longtask 数量与总时长 */
export function summarizeLongTasksByPhase(
  tasks: PerfLongTaskClassified[]
): Array<{ phase: string; count: number; totalDuration: number }> {
  const map = new Map<string, { count: number; totalDuration: number }>()
  for (const task of tasks) {
    const entry = map.get(task.phase) ?? { count: 0, totalDuration: 0 }
    entry.count += 1
    entry.totalDuration += task.duration
    map.set(task.phase, entry)
  }
  return Array.from(map.entries()).map(([phase, value]) => ({ phase, ...value }))
}

/** 单段渲染耗时统计 */
export interface SegmentRenderStats {
  n: number
  min: number
  p50: number
  p95: number
  max: number
}

/** 计算已升序排列数组的分位数（线性插值） */
function percentileOfSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const rank = p * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  const weight = rank - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

/** 聚合单段渲染耗时样本为统计分布（min/p50/p95/max） */
export function aggregateSegmentRenderTimes(samples: number[]): SegmentRenderStats {
  if (samples.length === 0) {
    return { n: 0, min: 0, p50: 0, p95: 0, max: 0 }
  }
  const sorted = [...samples].sort((a, b) => a - b)
  return {
    n: sorted.length,
    min: sorted[0],
    p50: percentileOfSorted(sorted, 0.5),
    p95: percentileOfSorted(sorted, 0.95),
    max: sorted[sorted.length - 1]
  }
}

/** 判断会话 runId 是否已被更新的会话取代（过期） */
export function isRunIdStale(sessionRunId: number, currentRunId: number): boolean {
  return sessionRunId !== currentRunId
}

/** 时间线条目（durationMs 为 null 表示该 mark 缺失） */
export interface TimelineEntry {
  label: string
  durationMs: number | null
}

/** 首屏性能报告（纯数据结构，由副作用层负责打印） */
export interface FirstPaintReport {
  timeline: TimelineEntry[]
  longTasksClassified: PerfLongTaskClassified[]
  longTaskSummary: Array<{ phase: string; count: number; totalDuration: number }>
  segmentStats: SegmentRenderStats
}

/** 组装首屏性能报告：归类 longtask + 阶段汇总 + 样本聚合，timeline 原样保留 */
export function buildReport(params: {
  phases: PerfPhaseSpan[]
  longTasks: PerfLongTask[]
  samples: number[]
  timeline: TimelineEntry[]
}): FirstPaintReport {
  const classified = params.longTasks.map((task) => classifyLongTask(task, params.phases))
  return {
    timeline: params.timeline,
    longTasksClassified: classified,
    longTaskSummary: summarizeLongTasksByPhase(classified),
    segmentStats: aggregateSegmentRenderTimes(params.samples)
  }
}

/** 追踪首屏可见段是否全部完成的纯状态机 */
export interface VisibleCompleteTracker {
  /** 重置待完成集合 */
  reset(indices: number[]): void
  /** 标记某 index 完成；返回是否"恰好在此次完成后集合清空"（首屏可见段全部 ready） */
  markComplete(index: number): boolean
}

/** 创建一个 visible-end 追踪器（纯逻辑，无副作用） */
export function createVisibleCompleteTracker(): VisibleCompleteTracker {
  let pending = new Set<number>()
  return {
    reset(indices: number[]) {
      pending = new Set(indices)
    },
    markComplete(index: number): boolean {
      if (pending.size === 0) return false
      pending.delete(index)
      return pending.size === 0
    }
  }
}
