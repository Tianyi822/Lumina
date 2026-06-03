import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeByteRate,
  formatBytesPerSecond,
  formatRateLabel
} from './containerIoFormatters'

test('computeByteRate 按时间差计算字节每秒', () => {
  assert.equal(computeByteRate(1000, 4000, 3000), 1000)
})

test('computeByteRate 在计数器回绕时返回 0', () => {
  assert.equal(computeByteRate(5000, 1000, 3000), 0)
})

test('computeByteRate 在时间差无效时返回 0', () => {
  assert.equal(computeByteRate(1000, 2000, 0), 0)
  assert.equal(computeByteRate(1000, 2000, -100), 0)
})

test('formatBytesPerSecond 格式化常见量级', () => {
  assert.equal(formatBytesPerSecond(0), '0 B/s')
  assert.equal(formatBytesPerSecond(512), '512 B/s')
  assert.equal(formatBytesPerSecond(1536), '1.5 KB/s')
})

test('formatRateLabel 在无采样时显示占位符', () => {
  assert.equal(formatRateLabel(null), '-')
  assert.equal(formatRateLabel(2048), '2 KB/s')
})
