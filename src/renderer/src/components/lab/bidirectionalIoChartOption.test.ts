import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBidirectionalIoChartOption } from './bidirectionalIoChartOption'
import { MONITOR_CHART_MAX_POINTS } from './monitorChartSeries'
import type { IoRateSample } from './hooks/useContainerIoHistory'

test.before(() => {
  Object.assign(globalThis, {
    document: {
      documentElement: {}
    },
    getComputedStyle: () => ({
      getPropertyValue: () => ''
    })
  })
})

const samples: IoRateSample[] = [
  { timestamp: 1_000, upper: 100, lower: 200 },
  { timestamp: 4_000, upper: 300, lower: 150 }
]

test('buildBidirectionalIoChartOption 使用固定槽位、对称 y 轴并将下半序列取负', () => {
  const option = buildBidirectionalIoChartOption(samples, {
    upper: '发送',
    lower: '接收'
  })

  const xAxis = option.xAxis
  assert.ok(xAxis && !Array.isArray(xAxis) && 'data' in xAxis)
  const categories = xAxis.data as string[]
  assert.equal(categories.length, MONITOR_CHART_MAX_POINTS)

  const yAxis = option.yAxis
  assert.ok(yAxis && !Array.isArray(yAxis))
  assert.equal(yAxis.min, -300)
  assert.equal(yAxis.max, 300)

  const series = option.series
  assert.ok(Array.isArray(series))
  assert.equal(series.length, 2)
  const upperData = series[0]?.data as Array<number | null>
  const lowerData = series[1]?.data as Array<number | null>
  assert.equal(upperData.length, MONITOR_CHART_MAX_POINTS)
  assert.equal(lowerData.length, MONITOR_CHART_MAX_POINTS)
  assert.equal(upperData[MONITOR_CHART_MAX_POINTS - 2], 100)
  assert.equal(upperData[MONITOR_CHART_MAX_POINTS - 1], 300)
  assert.equal(lowerData[MONITOR_CHART_MAX_POINTS - 2], -200)
  assert.equal(lowerData[MONITOR_CHART_MAX_POINTS - 1], -150)
})
