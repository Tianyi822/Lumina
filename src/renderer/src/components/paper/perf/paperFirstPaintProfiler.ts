// PERF-PROBE:firstpaint — 临时验证代码，根因确认后整体移除（dev-only，用 console 输出到 dev 工具）
import {
  buildReport,
  isRunIdStale,
  type FirstPaintReport,
  type PerfPhaseSpan,
  type TimelineEntry
} from './paperFirstPaintProfilerCore.ts'

const FLAG_KEY = 'lumina-perf-firstpaint'

/** 可注入的副作用依赖（测试用 fake，生产用真实实现） */
export interface ProbeDeps {
  isDev: boolean
  getFlag: () => string | null
  now: () => number
  mark: (name: string) => void
  measure: (name: string, start: string, end: string) => number
  getMarkTime: (name: string) => number | undefined
  observeLongTasks: (cb: (startTime: number, duration: number) => void) => (() => void) | null
  scheduleIdle: (cb: () => void) => void
  scheduleTimeout: (cb: () => void, ms: number) => void
  report: (report: FirstPaintReport) => void
}

interface PerfLongTaskEntry {
  startTime: number
  duration: number
}

/** 创建一个首屏探针（会话状态机） */
export function createFirstPaintProbe(deps: ProbeDeps) {
  let enabled = false
  let activeRunId = 0
  let longTasks: PerfLongTaskEntry[] = []
  let samples: number[] = []
  let disconnect: (() => void) | null = null

  function isEnabled(): boolean {
    return deps.isDev && deps.getFlag() === '1'
  }

  function start(): void {
    enabled = isEnabled()
    if (!enabled) return
    // 新会话开始前断开上一轮 observer（如果有）
    disconnect?.()
    disconnect = null
    activeRunId += 1
    const session = activeRunId
    longTasks = []
    samples = []
    deps.mark('pr:mount')
    disconnect = deps.observeLongTasks((startTime, duration) => {
      longTasks.push({ startTime, duration })
    })
    scheduleEnd(session)
  }

  function scheduleEnd(session: number): void {
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      if (isRunIdStale(session, activeRunId)) return
      deps.mark('pr:idle')
      end(session)
    }
    deps.scheduleIdle(finish)
    deps.scheduleTimeout(finish, 10000)
  }

  function end(session: number): void {
    if (isRunIdStale(session, activeRunId)) return
    activeRunId = -1
    deps.report(buildReportForOutput())
    disconnect?.()
    disconnect = null
  }

  function buildReportForOutput(): FirstPaintReport {
    const phaseDefs: Array<{ name: string; start: string; end: string }> = [
      { name: 'pr:list', start: 'pr:list-start', end: 'pr:list-end' },
      { name: 'pr:openpaper', start: 'pr:openpaper-start', end: 'pr:openpaper-end' },
      { name: 'pr:metas', start: 'pr:metas-start', end: 'pr:metas-end' },
      { name: 'pr:visible-render', start: 'pr:mount', end: 'pr:visible-end' }
    ]
    const phases: PerfPhaseSpan[] = []
    for (const def of phaseDefs) {
      const startT = deps.getMarkTime(def.start)
      const endT = deps.getMarkTime(def.end)
      if (startT !== undefined && endT !== undefined) {
        phases.push({ name: def.name, start: startT, end: endT })
      }
    }
    const timeline: TimelineEntry[] = [
      entry('pr:list', 'pr:list-start', 'pr:list-end'),
      entry('pr:list-commit', 'pr:list-end', 'pr:list-commit'),
      entry('pr:openpaper', 'pr:openpaper-start', 'pr:openpaper-end'),
      entry('pr:metas', 'pr:metas-start', 'pr:metas-end'),
      entry('pr:visible-render', 'pr:mount', 'pr:visible-end'),
      entry('pr:e2e (mount→idle)', 'pr:mount', 'pr:idle')
    ]
    return buildReport({
      phases,
      longTasks: longTasks.slice(),
      samples: samples.slice(),
      timeline
    })
  }

  function entry(label: string, start: string, end: string): TimelineEntry {
    try {
      return { label, durationMs: deps.measure(label, start, end) }
    } catch {
      return { label, durationMs: null }
    }
  }

  function mark(name: string): void {
    if (!enabled) return
    deps.mark(name)
  }

  function recordSample(durationMs: number): void {
    if (!enabled) return
    samples.push(durationMs)
  }

  return { start, mark, recordSample, isEnabled }
}

/** 生产环境真实 deps 装配 */
const realDeps: ProbeDeps = {
  isDev: import.meta.env?.DEV ?? false,
  getFlag: () => {
    try {
      return localStorage.getItem(FLAG_KEY)
    } catch {
      return null
    }
  },
  now: () => performance.now(),
  mark: (name) => {
    try {
      performance.mark(name)
    } catch {
      // 忽略
    }
  },
  measure: (name, start, end) => performance.measure(name, start, end).duration,
  getMarkTime: (name) => performance.getEntriesByName(name, 'mark')[0]?.startTime,
  observeLongTasks: (cb) => {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'longtask') {
            cb(entry.startTime, entry.duration)
          }
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
      return () => observer.disconnect()
    } catch {
      return null
    }
  },
  scheduleIdle: (cb) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(cb)
    } else {
      setTimeout(cb, 50)
    }
  },
  scheduleTimeout: (cb, ms) => setTimeout(cb, ms),
  report: (report) => {
    console.group(`[FirstPaint Profile]`)
    console.log('== 阶段时间线 ==')
    for (const item of report.timeline) {
      console.log(
        `  ${item.label.padEnd(24)} = ${item.durationMs !== null ? Math.round(item.durationMs) : 'n/a'}ms`
      )
    }
    console.log('\n== longtask（>50ms）==')
    const total = report.longTasksClassified.reduce((sum, t) => sum + t.duration, 0)
    console.log(`  共 ${report.longTasksClassified.length} 个，总 ${Math.round(total)}ms`)
    for (const t of report.longTasksClassified) {
      console.log(
        `  [${Math.round(t.startTime)}–${Math.round(t.startTime + t.duration)}ms] ${Math.round(t.duration)}ms  → 归类: ${t.phase}`
      )
    }
    const summaryLine = report.longTaskSummary
      .map((s) => `${s.phase}=${Math.round(s.totalDuration)}ms(${s.count})`)
      .join(', ')
    console.log(`  区间汇总: ${summaryLine}`)
    console.log('\n== 单段渲染（可见段）==')
    const s = report.segmentStats
    console.log(
      `  n=${s.n}  min=${Math.round(s.min)}ms  p50=${Math.round(s.p50)}ms  p95=${Math.round(s.p95)}ms  max=${Math.round(s.max)}ms`
    )
    console.groupEnd()
  }
}

/** 渲染进程单例探针（供各调用点使用） */
export const probe = createFirstPaintProbe(realDeps)
