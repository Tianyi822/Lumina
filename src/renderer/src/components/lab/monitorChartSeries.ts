import type { ChartPoint } from './sshMonitorTypes'
import type { IoRateSample } from './hooks/useContainerIoHistory'

export const MONITOR_CHART_MAX_POINTS = 20

function formatSlotTime(time: number): string {
  return new Date(time).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export interface MetricChartSlot {
  time: number | null
  value: number | null
}

export interface FixedMetricSlots {
  categories: string[]
  values: Array<number | null>
  slots: MetricChartSlot[]
}

export interface FixedIoSlots {
  categories: string[]
  upper: Array<number | null>
  lower: Array<number | null>
  slots: IoRateSample[]
}

export function trimRollingQueue<T>(items: T[], maxPoints: number): T[] {
  if (items.length <= maxPoints) {
    return items
  }

  return items.slice(items.length - maxPoints)
}

export function calculateFixedAxisLabelInterval(maxPoints: number): number {
  if (maxPoints <= 6) {
    return 0
  }

  return Math.max(0, Math.ceil(maxPoints / 5) - 1)
}

function buildEmptyMetricSlot(): MetricChartSlot {
  return { time: null, value: null }
}

function buildEmptyIoSlot(): IoRateSample {
  return { timestamp: 0, upper: 0, lower: 0 }
}

export function buildFixedMetricSlots(
  points: ChartPoint[],
  maxPoints: number = MONITOR_CHART_MAX_POINTS
): FixedMetricSlots {
  const recent = points.slice(-maxPoints)
  const paddingCount = maxPoints - recent.length
  const paddedSlots: MetricChartSlot[] = [
    ...Array.from({ length: paddingCount }, () => buildEmptyMetricSlot()),
    ...recent.map((point) => ({ time: point.time, value: point.value }))
  ]

  return {
    categories: paddedSlots.map((slot) => (slot.time !== null ? formatSlotTime(slot.time) : '')),
    values: paddedSlots.map((slot) => slot.value),
    slots: paddedSlots
  }
}

export function buildFixedIoSlots(
  samples: IoRateSample[],
  maxPoints: number = MONITOR_CHART_MAX_POINTS
): FixedIoSlots {
  const recent = samples.slice(-maxPoints)
  const paddingCount = maxPoints - recent.length
  const paddedSlots: IoRateSample[] = [
    ...Array.from({ length: paddingCount }, () => buildEmptyIoSlot()),
    ...recent
  ]

  const isEmptySlot = (index: number) => index < paddingCount

  return {
    categories: paddedSlots.map((slot, index) =>
      isEmptySlot(index) ? '' : formatSlotTime(slot.timestamp)
    ),
    upper: paddedSlots.map((slot, index) => (isEmptySlot(index) ? null : slot.upper)),
    lower: paddedSlots.map((slot, index) => (isEmptySlot(index) ? null : slot.lower)),
    slots: paddedSlots
  }
}
