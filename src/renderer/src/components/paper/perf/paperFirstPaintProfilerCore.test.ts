// PERF-PROBE:firstpaint — 临时验证代码，根因确认后整体移除

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyLongTask,
  summarizeLongTasksByPhase,
  aggregateSegmentRenderTimes,
  isRunIdStale,
  buildReport,
  createVisibleCompleteTracker,
  type PerfPhaseSpan
} from './paperFirstPaintProfilerCore.ts'

test('classifyLongTask: 完全落在某阶段内归类为该阶段', () => {
  const phases: PerfPhaseSpan[] = [
    { name: 'pr:metas', start: 100, end: 200 },
    { name: 'pr:visible-render', start: 200, end: 1000 }
  ]
  const result = classifyLongTask({ startTime: 250, duration: 200 }, phases)
  assert.equal(result.phase, 'pr:visible-render')
})

test('classifyLongTask: 跨阶段时归到重叠更多的阶段', () => {
  const phases: PerfPhaseSpan[] = [
    { name: 'pr:metas', start: 100, end: 200 },
    { name: 'pr:visible-render', start: 200, end: 1000 }
  ]
  const result = classifyLongTask({ startTime: 180, duration: 200 }, phases)
  assert.equal(result.phase, 'pr:visible-render')
})

test('classifyLongTask: 不与任何阶段重叠归类为 other', () => {
  const phases: PerfPhaseSpan[] = [{ name: 'pr:metas', start: 100, end: 200 }]
  const result = classifyLongTask({ startTime: 500, duration: 100 }, phases)
  assert.equal(result.phase, 'other')
})

test('summarizeLongTasksByPhase: 按阶段汇总 count 与 totalDuration', () => {
  const tasks = [
    { startTime: 110, duration: 50, phase: 'pr:metas' },
    { startTime: 120, duration: 60, phase: 'pr:metas' },
    { startTime: 300, duration: 200, phase: 'pr:visible-render' },
    { startTime: 999, duration: 10, phase: 'other' }
  ]
  const summary = summarizeLongTasksByPhase(tasks)
  const metas = summary.find((s) => s.phase === 'pr:metas')
  assert.equal(metas?.count, 2)
  assert.equal(metas?.totalDuration, 110)
  const visible = summary.find((s) => s.phase === 'pr:visible-render')
  assert.equal(visible?.count, 1)
  assert.equal(visible?.totalDuration, 200)
})

test('aggregateSegmentRenderTimes: 空数组返回零统计', () => {
  const stats = aggregateSegmentRenderTimes([])
  assert.equal(stats.n, 0)
  assert.equal(stats.min, 0)
  assert.equal(stats.max, 0)
})

test('aggregateSegmentRenderTimes: 计算 min/p50/p95/max', () => {
  const stats = aggregateSegmentRenderTimes([40, 80, 120, 160, 200])
  assert.equal(stats.n, 5)
  assert.equal(stats.min, 40)
  assert.equal(stats.max, 200)
  assert.equal(stats.p50, 120)
  assert.equal(stats.p95, 192) // 线性插值：rank=0.95*4=3.8 → sorted[3]*0.2+sorted[4]*0.8 = 160*0.2+200*0.8 = 192
})

test('aggregateSegmentRenderTimes: 单样本四分位均等于该值', () => {
  const stats = aggregateSegmentRenderTimes([77])
  assert.equal(stats.n, 1)
  assert.equal(stats.min, 77)
  assert.equal(stats.max, 77)
  assert.equal(stats.p50, 77)
})

test('isRunIdStale: 不同 runId 为过期', () => {
  assert.equal(isRunIdStale(1, 2), true)
  assert.equal(isRunIdStale(2, 2), false)
})

test('buildReport: 归类 longtask + 阶段汇总 + 样本聚合', () => {
  const phases: PerfPhaseSpan[] = [
    { name: 'pr:metas', start: 100, end: 200 },
    { name: 'pr:visible-render', start: 200, end: 1000 }
  ]
  const report = buildReport({
    phases,
    longTasks: [
      { startTime: 120, duration: 60 },
      { startTime: 300, duration: 200 }
    ],
    samples: [50, 100],
    timeline: [
      { label: 'pr:metas', durationMs: 100 },
      { label: 'pr:visible-render', durationMs: 800 }
    ]
  })
  assert.equal(report.timeline.length, 2)
  assert.equal(report.longTasksClassified.length, 2)
  const metas = report.longTaskSummary.find((s) => s.phase === 'pr:metas')
  assert.equal(metas?.totalDuration, 60)
  const visible = report.longTaskSummary.find((s) => s.phase === 'pr:visible-render')
  assert.equal(visible?.totalDuration, 200)
  assert.equal(report.segmentStats.n, 2)
})

test('buildReport: 空输入仍产出合法结构', () => {
  const report = buildReport({ phases: [], longTasks: [], samples: [], timeline: [] })
  assert.equal(report.longTasksClassified.length, 0)
  assert.equal(report.longTaskSummary.length, 0)
  assert.equal(report.segmentStats.n, 0)
  assert.equal(report.timeline.length, 0)
})

test('createVisibleCompleteTracker: 依次完成，最后一个返回 true', () => {
  const t = createVisibleCompleteTracker()
  t.reset([0, 1, 2])
  assert.equal(t.markComplete(0), false)
  assert.equal(t.markComplete(1), false)
  assert.equal(t.markComplete(2), true)
})

test('createVisibleCompleteTracker: 完成后再次 markComplete 返回 false', () => {
  const t = createVisibleCompleteTracker()
  t.reset([0])
  assert.equal(t.markComplete(0), true)
  assert.equal(t.markComplete(0), false)
})

test('createVisibleCompleteTracker: 未 reset 时 markComplete 返回 false', () => {
  const t = createVisibleCompleteTracker()
  assert.equal(t.markComplete(0), false)
})

test('createVisibleCompleteTracker: reset 空集合后 markComplete 返回 false', () => {
  const t = createVisibleCompleteTracker()
  t.reset([])
  assert.equal(t.markComplete(0), false)
})

test('createVisibleCompleteTracker: reset 后重新开始计数', () => {
  const t = createVisibleCompleteTracker()
  t.reset([0, 1])
  assert.equal(t.markComplete(0), false)
  t.reset([5])
  assert.equal(t.markComplete(5), true)
})
