import type { SshServerStats } from '@renderer/types/lab'
import type { ChartPoint, ChartTone, MetricChart } from './sshMonitorTypes'

export function collectPoints(
  samples: SshServerStats[],
  getValue: (sample: SshServerStats) => number | null | undefined
): ChartPoint[] {
  return samples
    .map((sample) => ({
      time: new Date(sample.sampledAt).getTime(),
      value: getValue(sample)
    }))
    .filter(
      (point): point is ChartPoint =>
        point.value !== null && point.value !== undefined && Number.isFinite(point.value)
    )
}

export function collectGpuNames(sample: SshServerStats | null): string[] {
  if (!sample?.gpu.supported) {
    return []
  }

  return sample.gpu.devices
    .map((device) => device.name?.trim())
    .filter((name): name is string => !!name)
}

export function calculateRateMax(
  samples: SshServerStats[],
  getValue: (sample: SshServerStats) => number | null | undefined
): number {
  const maxValue = Math.max(0, ...collectPoints(samples, getValue).map((point) => point.value))
  return maxValue > 0 ? maxValue * 1.2 : 1
}

export function calculateAxisInterval(pointCount: number): number {
  if (pointCount <= 6) {
    return 0
  }

  return Math.max(0, Math.ceil(pointCount / 5) - 1)
}

export function formatAxisLabel(chart: MetricChart): string {
  if (chart.kind === 'percent') {
    return '0-100%'
  }

  return `0-${formatRate(chart.maxValue)}`
}

export function formatTooltip(params: unknown, chart: MetricChart): string {
  const param = Array.isArray(params) ? params[0] : params
  if (!isRecord(param)) {
    return ''
  }

  const dataIndex = typeof param.dataIndex === 'number' ? param.dataIndex : -1
  const value = normalizeNumericValue(param.value)
  const point = chart.points[dataIndex]
  const timeLabel = point ? formatFullSampleTime(point.time) : String(param.name || '')
  const valueLabel = chart.kind === 'rate' ? formatRate(value) : formatPercent(value)
  const marker = typeof param.marker === 'string' ? param.marker : ''

  return `${timeLabel}<br />${marker}${chart.label}: ${valueLabel}`
}

export function normalizeNumericValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (Array.isArray(value)) {
    return normalizeNumericValue(value[value.length - 1])
  }

  return null
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function formatSampleTime(time: number): string {
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatFullSampleTime(time: number): string {
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-'
  }

  return `${value.toFixed(1)}%`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) {
    return '-'
  }

  if (bytes === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export function formatBytePair(usageBytes: number, totalBytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index =
    totalBytes > 0
      ? Math.min(units.length - 1, Math.floor(Math.log(totalBytes) / Math.log(1024)))
      : 0
  const divisor = Math.pow(1024, index)
  const fractionDigits = index === 0 ? 0 : 1

  return `${(usageBytes / divisor).toFixed(fractionDigits)} / ${(totalBytes / divisor).toFixed(
    fractionDigits
  )} ${units[index]}`
}

export function formatRate(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond === null || bytesPerSecond === undefined) {
    return '-'
  }

  return `${formatBytes(bytesPerSecond)}/s`
}

export function getToneColor(tone: ChartTone): string {
  const tokenMap: Record<ChartTone, { token: string; fallback: string }> = {
    primary: { token: '--sm-color-accent', fallback: '#2563eb' },
    success: { token: '--sm-color-status-success', fallback: '#16a34a' },
    warning: { token: '--sm-color-status-warning', fallback: '#d97706' },
    danger: { token: '--sm-color-status-danger', fallback: '#dc2626' },
    info: { token: '--sm-color-accent-hover', fallback: '#0891b2' },
    muted: { token: '--sm-color-text-tertiary', fallback: '#94a3b8' }
  }
  const config = tokenMap[tone]
  return readCssVariable(config.token, config.fallback)
}

export function readCssVariable(token: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value || fallback
}
