import type { SshServerStats } from '@renderer/types/lab'
import type { ChartPoint, ChartTone, MetricChart } from './sshMonitorTypes'
import type { MetricChartSlot } from './monitorChartSeries'

/** 将原始数值标准化为图表可用值，非有限值返回 null */
export function normalizeChartValue(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }

  return Number.isFinite(value) ? value : null
}

/** 将采样数据数组映射为图表点数组（time + value） */
export function mapSamplePoints(
  samples: SshServerStats[],
  getValue: (sample: SshServerStats) => number | null | undefined
): ChartPoint[] {
  return samples.map((sample) => ({
    time: new Date(sample.sampledAt).getTime(),
    value: normalizeChartValue(getValue(sample))
  }))
}

/** @deprecated 使用 mapSamplePoints，保留以兼容旧调用 */
export function collectPoints(
  samples: SshServerStats[],
  getValue: (sample: SshServerStats) => number | null | undefined
): ChartPoint[] {
  return mapSamplePoints(samples, getValue).filter(
    (point): point is ChartPoint & { value: number } => point.value !== null
  )
}

/** 收集 GPU 设备名列表用于图表副标签展示 */
export function collectGpuNames(sample: SshServerStats | null): string[] {
  if (!sample?.gpu.supported) {
    return []
  }

  return sample.gpu.devices
    .map((device) => device.name?.trim())
    .filter((name): name is string => !!name)
}

/** 计算速率类指标的最大值（加 20% 余量），确保图表曲线不溢出 */
export function calculateRateMax(
  samples: SshServerStats[],
  getValue: (sample: SshServerStats) => number | null | undefined
): number {
  const values = mapSamplePoints(samples, getValue)
    .map((point) => point.value)
    .filter((value): value is number => value !== null)
  const maxValue = Math.max(0, ...values)
  return maxValue > 0 ? maxValue * 1.2 : 1
}

/** 格式化图表纵轴标签：百分比显示 0-100%，速率显示 0-{maxValue} */
export function formatAxisLabel(chart: MetricChart): string {
  if (chart.kind === 'percent') {
    return '0-100%'
  }

  return `0-${formatRate(chart.maxValue)}`
}

/** 格式化 ECharts tooltip 内容，包含采样时间、标记颜色和数值 */
export function formatTooltip(
  params: unknown,
  chart: MetricChart,
  slots: MetricChartSlot[]
): string {
  const param = Array.isArray(params) ? params[0] : params
  if (!isRecord(param)) {
    return ''
  }

  const dataIndex = typeof param.dataIndex === 'number' ? param.dataIndex : -1
  const slot = dataIndex >= 0 ? slots[dataIndex] : undefined
  if (!slot || slot.time === null || slot.value === null) {
    return ''
  }

  const valueLabel =
    chart.kind === 'rate' ? formatRate(slot.value) : formatPercent(slot.value)
  const marker = typeof param.marker === 'string' ? param.marker : ''

  return `${formatFullSampleTime(slot.time)}<br />${marker}${chart.label}: ${valueLabel}`
}

/** 将未知类型值归一化为有效数值，兼容数组（取最后元素） */
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

/** 格式化百分比值，保留一位小数，null 返回 '-' */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-'
  }

  return `${value.toFixed(1)}%`
}

/** 将字节数格式化为可读字符串（B/KB/MB/GB/TB），自动选择单位 */
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

/** 格式化「已用 / 总量」字节对，以总量为基准选择显示单位 */
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

/** 格式化字节每秒速率 */
export function formatRate(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond === null || bytesPerSecond === undefined) {
    return '-'
  }

  return `${formatBytes(bytesPerSecond)}/s`
}

/** 根据图表色调读取对应的 CSS 变量颜色值 */
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
