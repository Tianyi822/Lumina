/**
 * 容器 I/O 累计字节差分与速率格式化
 */

export function computeByteRate(prevBytes: number, nextBytes: number, deltaMs: number): number {
  if (deltaMs <= 0) return 0
  if (nextBytes < prevBytes) return 0
  return ((nextBytes - prevBytes) / deltaMs) * 1000
}

export function formatBytesPerSecond(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec < 0) return '-'
  if (bytesPerSec === 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
  const i = Math.min(Math.floor(Math.log(bytesPerSec) / Math.log(k)), sizes.length - 1)
  const value = bytesPerSec / Math.pow(k, i)
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${parseFloat(value.toFixed(digits))} ${sizes[i]}`
}

export function formatRateLabel(rate: number | null): string {
  if (rate === null) return '-'
  return formatBytesPerSecond(rate)
}
