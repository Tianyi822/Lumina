import type { ToolStatsSummary, TimeRange } from '@shared/types/tool-stats'

export type TimeRangeKey = 'today' | '7d' | '30d'

export interface OverviewMetrics {
  totalCalls: number
  successRate: number
  avgDurationMs: number
  p95DurationMs: number
}

export function buildTimeRange(key: TimeRangeKey): TimeRange {
  const now = new Date()
  const from = new Date()

  switch (key) {
    case 'today':
      from.setHours(0, 0, 0, 0)
      break
    case '7d':
      from.setDate(now.getDate() - 7)
      break
    case '30d':
      from.setDate(now.getDate() - 30)
      break
  }

  return { from, to: now }
}

export function computeOverviewMetrics(stats: ToolStatsSummary[]): OverviewMetrics {
  if (stats.length === 0) {
    return { totalCalls: 0, successRate: 0, avgDurationMs: 0, p95DurationMs: 0 }
  }

  let totalCalls = 0
  let weightedSuccessRate = 0
  let weightedDuration = 0
  let maxP95 = 0

  for (const item of stats) {
    totalCalls += item.totalCalls
    weightedSuccessRate += item.successRate * item.totalCalls
    weightedDuration += item.avgDurationMs * item.totalCalls
    if (item.p95DurationMs > maxP95) {
      maxP95 = item.p95DurationMs
    }
  }

  return {
    totalCalls,
    successRate: totalCalls > 0 ? weightedSuccessRate / totalCalls : 0,
    avgDurationMs: totalCalls > 0 ? weightedDuration / totalCalls : 0,
    p95DurationMs: maxP95
  }
}

export function sortStats(
  stats: ToolStatsSummary[],
  key: keyof ToolStatsSummary,
  order: 'asc' | 'desc'
): ToolStatsSummary[] {
  const sorted = [...stats]
  const multiplier = order === 'asc' ? 1 : -1

  sorted.sort((a, b) => {
    const aVal = a[key] as number
    const bVal = b[key] as number
    return (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) * multiplier
  })

  return sorted
}
