import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MONITOR_CHART_MAX_POINTS,
  buildFixedIoSlots,
  buildFixedMetricSlots,
  calculateFixedAxisLabelInterval,
  trimRollingQueue
} from './monitorChartSeries'

test('trimRollingQueue 保留最近 N 条', () => {
  assert.deepEqual(trimRollingQueue([1, 2, 3, 4, 5], 3), [3, 4, 5])
  assert.deepEqual(trimRollingQueue([1, 2], 5), [1, 2])
})

test('buildFixedMetricSlots 固定槽位并右对齐', () => {
  const points = Array.from({ length: 25 }, (_, index) => ({
    time: index * 1000,
    value: index
  }))
  const { categories, values, slots } = buildFixedMetricSlots(points, 20)

  assert.equal(categories.length, 20)
  assert.equal(values.length, 20)
  assert.equal(slots.length, 20)
  assert.equal(values[0], 5)
  assert.equal(values[19], 24)
  assert.equal(slots[19]?.time, 24_000)
})

test('buildFixedMetricSlots 单点数据左补空槽', () => {
  const { categories, values } = buildFixedMetricSlots(
    [{ time: 1_700_000_000_000, value: 42 }],
    20
  )

  assert.equal(categories.filter(Boolean).length, 1)
  assert.equal(values.filter((value) => value !== null).length, 1)
  assert.equal(values[19], 42)
})

test('buildFixedIoSlots 固定槽位并右对齐', () => {
  const samples = [
    { timestamp: 1_000, upper: 10, lower: 20 },
    { timestamp: 2_000, upper: 30, lower: 40 }
  ]
  const { categories, upper, lower } = buildFixedIoSlots(samples, 20)

  assert.equal(categories.length, 20)
  assert.equal(upper.length, 20)
  assert.equal(lower.length, 20)
  assert.equal(upper[18], 10)
  assert.equal(upper[19], 30)
  assert.equal(lower[18], 20)
  assert.equal(lower[19], 40)
})

test('calculateFixedAxisLabelInterval 与槽位数无关', () => {
  assert.equal(calculateFixedAxisLabelInterval(MONITOR_CHART_MAX_POINTS), 3)
})
