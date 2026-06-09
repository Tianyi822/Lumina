/** 图表数值类型：百分比或速率 */
export type ChartValueKind = 'percent' | 'rate'

/** 图表色调主题，映射到 CSS 变量 */
export type ChartTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted'

/** 单个图表数据点 */
export interface ChartPoint {
  time: number
  value: number | null
}

/** 监控指标图表配置，描述一个 ECharts 卡片的全部渲染信息 */
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
