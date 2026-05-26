export type RangeHours = 1 | 3 | 12 | 24

export type ChartValueKind = 'percent' | 'rate'

export type ChartTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

export interface ChartPoint {
  time: number
  value: number
}

export interface MetricChart {
  key: string
  label: string
  valueLabel: string
  detailLabel?: string
  inlineDetail?: boolean
  tone: ChartTone
  kind: ChartValueKind
  maxValue: number
  points: ChartPoint[]
  emptyLabel: string
  supported: boolean
  hostDetailLabel?: string
  labelSuffix?: string
}
