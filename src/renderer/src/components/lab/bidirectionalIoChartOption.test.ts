import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBidirectionalIoChartOption } from './bidirectionalIoChartOption'
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

test('buildBidirectionalIoChartOption 使用对称 y 轴并将下半序列取负', () => {
  const option = buildBidirectionalIoChartOption(samples, {
    upper: '发送',
    lower: '接收'
  })

  const yAxis = option.yAxis
  assert.ok(yAxis && !Array.isArray(yAxis))
  assert.equal(yAxis.min, -300)
  assert.equal(yAxis.max, 300)

  const series = option.series
  assert.ok(Array.isArray(series))
  assert.equal(series.length, 2)
  assert.deepEqual(series[0]?.data, [100, 300])
  assert.deepEqual(series[1]?.data, [-200, -150])
})
