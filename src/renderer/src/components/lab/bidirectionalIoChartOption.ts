import type { EChartsOption } from 'echarts'
import { formatBytesPerSecond } from './containerIoFormatters'
import type { IoRateSample } from './hooks/useContainerIoHistory'
import {
  MONITOR_CHART_MAX_POINTS,
  buildFixedIoSlots,
  calculateFixedAxisLabelInterval
} from './monitorChartSeries'
import { formatFullSampleTime, isRecord, readCssVariable } from './sshMonitorFormatters'

export interface BidirectionalIoChartLabels {
  upper: string
  lower: string
}

function resolvePeak(upper: Array<number | null>, lower: Array<number | null>): number {
  let peak = 1
  for (let index = 0; index < upper.length; index += 1) {
    const upperValue = upper[index]
    const lowerValue = lower[index]
    if (upperValue !== null && Number.isFinite(upperValue)) {
      peak = Math.max(peak, upperValue)
    }
    if (lowerValue !== null && Number.isFinite(lowerValue)) {
      peak = Math.max(peak, lowerValue)
    }
  }
  return peak
}

function formatTooltip(
  params: unknown,
  labels: BidirectionalIoChartLabels,
  slots: IoRateSample[],
  paddingCount: number
): string {
  if (!Array.isArray(params) || params.length === 0) {
    return ''
  }

  const first = params[0]
  if (!isRecord(first)) {
    return ''
  }

  const dataIndex = typeof first.dataIndex === 'number' ? first.dataIndex : -1
  if (dataIndex < paddingCount) {
    return ''
  }

  const point = dataIndex >= 0 ? slots[dataIndex] : undefined
  const timeLabel = point ? formatFullSampleTime(point.timestamp) : '-'

  const lines = params
    .map((item) => {
      if (!isRecord(item)) return ''
      const seriesName = typeof item.seriesName === 'string' ? item.seriesName : ''
      const rawValue =
        typeof item.value === 'number'
          ? item.value
          : Array.isArray(item.value)
            ? Number(item.value[item.value.length - 1])
            : Number(item.value)
      if (!Number.isFinite(rawValue)) return ''
      const magnitude = seriesName === labels.lower ? Math.abs(rawValue) : rawValue
      const marker = typeof item.marker === 'string' ? item.marker : ''
      return `${marker}${seriesName}: ${formatBytesPerSecond(magnitude)}`
    })
    .filter(Boolean)

  return `${timeLabel}<br />${lines.join('<br />')}`
}

/**
 * 构建镜像双向面积图（ECharts 对称 y 轴：上为正、下为负）
 */
export function buildBidirectionalIoChartOption(
  series: IoRateSample[],
  labels: BidirectionalIoChartLabels
): EChartsOption {
  const upperColor = readCssVariable('--sm-color-accent-hover', '#6b9fff')
  const lowerColor = readCssVariable('--sm-color-status-success', '#7fb08a')
  const baselineColor = readCssVariable('--sm-color-border-subtle', '#30363d')
  const axisColor = readCssVariable('--sm-color-text-tertiary', '#8b949e')
  const { categories, upper, lower, slots } = buildFixedIoSlots(series, MONITOR_CHART_MAX_POINTS)
  const paddingCount = MONITOR_CHART_MAX_POINTS - Math.min(series.length, MONITOR_CHART_MAX_POINTS)
  const peak = resolvePeak(upper, lower)
  const upperData = upper.map((value) => (value === null ? null : value))
  const lowerData = lower.map((value) => (value === null ? null : value === 0 ? 0 : -value))

  return {
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 250,
    grid: {
      left: 2,
      right: 2,
      top: 4,
      bottom: 20,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: (params) => formatTooltip(params, labels, slots, paddingCount)
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: true,
        color: axisColor,
        fontSize: 10,
        hideOverlap: true,
        interval: calculateFixedAxisLabelInterval(MONITOR_CHART_MAX_POINTS)
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: -peak,
      max: peak,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false }
    },
    series: [
      {
        name: labels.upper,
        type: 'line',
        data: upperData,
        connectNulls: false,
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          width: 1.5,
          color: upperColor
        },
        itemStyle: {
          color: upperColor
        },
        areaStyle: {
          color: upperColor,
          opacity: 0.16
        },
        markLine: {
          silent: true,
          symbol: 'none',
          animation: false,
          lineStyle: {
            color: baselineColor,
            width: 1
          },
          label: { show: false },
          data: [{ yAxis: 0 }]
        },
        emphasis: {
          focus: 'series'
        }
      },
      {
        name: labels.lower,
        type: 'line',
        data: lowerData,
        connectNulls: false,
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          width: 1.5,
          color: lowerColor
        },
        itemStyle: {
          color: lowerColor
        },
        areaStyle: {
          color: lowerColor,
          opacity: 0.16
        },
        emphasis: {
          focus: 'series'
        }
      }
    ]
  }
}

export function formatBidirectionalIoChartAriaLabel(
  title: string,
  series: IoRateSample[]
): string {
  if (series.length === 0) {
    return `${title} 暂无趋势数据`
  }

  const latest = series[series.length - 1]
  const time = formatFullSampleTime(latest.timestamp)
  return `${title} 实时监控趋势，最近采样 ${time}`
}
