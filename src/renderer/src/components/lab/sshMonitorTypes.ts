export type ChartValueKind = 'percent' | 'rate'

export type ChartTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

export interface ChartPoint {
  time: number
  value: number | null
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
  sampleCount: number
  emptyLabel: string
  supported: boolean
  hostDetailLabel?: string
  labelSuffix?: string
}
