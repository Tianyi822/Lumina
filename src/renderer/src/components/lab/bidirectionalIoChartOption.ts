import type { EChartsOption } from 'echarts'
import { formatBytesPerSecond } from './containerIoFormatters'
import type { IoRateSample } from './hooks/useContainerIoHistory'
import { formatFullSampleTime, formatSampleTime, isRecord, readCssVariable } from './sshMonitorFormatters'

export interface BidirectionalIoChartLabels {
  upper: string
  lower: string
}

function resolvePeak(series: IoRateSample[]): number {
  let peak = 1
  for (const point of series) {
    peak = Math.max(peak, point.upper, point.lower)
  }
  return peak
}

function formatTooltip(
  params: unknown,
  labels: BidirectionalIoChartLabels,
  series: IoRateSample[]
): string {
  if (!Array.isArray(params) || params.length === 0) {
    return ''
  }

  const first = params[0]
  if (!isRecord(first)) {
    return ''
  }

  const dataIndex = typeof first.dataIndex === 'number' ? first.dataIndex : -1
  const point = dataIndex >= 0 ? series[dataIndex] : undefined
  const timeLabel = point
    ? formatFullSampleTime(point.timestamp)
    : typeof first.name === 'string' && first.name
      ? first.name
      : '-'

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
  const peak = resolvePeak(series)
  const categories = series.map((point) => formatSampleTime(point.timestamp))
  const upperData = series.map((point) => point.upper)
  const lowerData = series.map((point) => -point.lower)

  return {
    animation: false,
    animationDuration: 0,
    animationDurationUpdate: 0,
    grid: {
      left: 2,
      right: 2,
      top: 4,
      bottom: 4,
      containLabel: false
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      formatter: (params) => formatTooltip(params, labels, series)
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: categories,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
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
        smooth: true,
        showSymbol: false,
        symbol: 'none',
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
        smooth: true,
        showSymbol: false,
        symbol: 'none',
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
  return `${title} 趋势，最近采样 ${time}`
}
