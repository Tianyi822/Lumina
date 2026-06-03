import { useRef, useEffect, useCallback } from 'react'
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import type { MetricChart } from '../sshMonitorTypes'
import {
  formatTooltip,
  getToneColor,
  readCssVariable
} from '../sshMonitorFormatters'
import {
  MONITOR_CHART_MAX_POINTS,
  buildFixedMetricSlots,
  calculateFixedAxisLabelInterval
} from '../monitorChartSeries'

export interface UseEchartsManagerReturn {
  setChartElement: (key: string, element: HTMLElement | null) => void
  disposeCharts: () => void
}

export function useEchartsManager(metricCharts: MetricChart[]): UseEchartsManagerReturn {
  const chartElementsRef = useRef(new Map<string, HTMLElement>())
  const chartInstancesRef = useRef(new Map<string, ECharts>())
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const renderQueuedRef = useRef(false)
  const metricChartsRef = useRef(metricCharts)
  metricChartsRef.current = metricCharts

  const buildChartOption = useCallback((chart: MetricChart): EChartsOption => {
    const color = getToneColor(chart.tone)
    const axisColor = readCssVariable('--sm-color-text-tertiary', '#8b949e')
    const gridColor = readCssVariable('--sm-color-border-subtle', '#e5e7eb')
    const { categories, values, slots } = buildFixedMetricSlots(
      chart.points,
      MONITOR_CHART_MAX_POINTS
    )

    return {
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 250,
      grid: {
        left: 8,
        right: 8,
        top: 14,
        bottom: 24,
        containLabel: false
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: (params: unknown) => formatTooltip(params, chart, slots)
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: categories,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: axisColor,
          fontSize: 10,
          hideOverlap: true,
          interval: calculateFixedAxisLabelInterval(MONITOR_CHART_MAX_POINTS)
        },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: chart.kind === 'percent' ? 100 : Math.max(chart.maxValue, 1),
        splitNumber: 3,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: {
          show: true,
          lineStyle: {
            color: gridColor,
            opacity: 0.72
          }
        }
      },
      series: [
        {
          type: 'line',
          data: values,
          connectNulls: false,
          smooth: true,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: {
            width: 2.2,
            color
          },
          itemStyle: {
            color
          },
          areaStyle: {
            color,
            opacity: 0.1
          },
          emphasis: {
            focus: 'series'
          }
        }
      ]
    }
  }, [])

  const renderCharts = useCallback(() => {
    const charts = metricChartsRef.current
    const chartElements = chartElementsRef.current
    const chartInstances = chartInstancesRef.current
    const activeKeys = new Set(charts.map((chart) => chart.key))

    for (const [key, instance] of chartInstances) {
      if (!activeKeys.has(key) || !chartElements.has(key)) {
        instance.dispose()
        chartInstances.delete(key)
      }
    }

    for (const chart of charts) {
      const element = chartElements.get(chart.key)
      if (!element) {
        continue
      }

      const instance =
        chartInstances.get(chart.key) ?? echarts.init(element, undefined, { renderer: 'canvas' })
      chartInstances.set(chart.key, instance)
      instance.setOption(buildChartOption(chart), {
        notMerge: true,
        lazyUpdate: true
      })
    }
  }, [buildChartOption])

  const queueRenderCharts = useCallback(() => {
    if (renderQueuedRef.current) {
      return
    }

    renderQueuedRef.current = true
    requestAnimationFrame(() => {
      renderQueuedRef.current = false
      renderCharts()
    })
  }, [renderCharts])

  const resizeCharts = useCallback(() => {
    for (const instance of chartInstancesRef.current.values()) {
      instance.resize()
    }
  }, [])

  const setChartElement = useCallback(
    (key: string, element: HTMLElement | null) => {
      const chartElements = chartElementsRef.current
      const chartInstances = chartInstancesRef.current
      const previousElement = chartElements.get(key)

      if (!element) {
        if (previousElement) {
          resizeObserverRef.current?.unobserve(previousElement)
        }
        chartElements.delete(key)
        const instance = chartInstances.get(key)
        if (instance) {
          instance.dispose()
          chartInstances.delete(key)
        }
        return
      }

      if (previousElement && previousElement !== element) {
        resizeObserverRef.current?.unobserve(previousElement)
      }

      chartElements.set(key, element)
      resizeObserverRef.current?.observe(element)

      if (!chartInstances.has(key)) {
        chartInstances.set(key, echarts.init(element, undefined, { renderer: 'canvas' }))
      }

      queueRenderCharts()
    },
    [queueRenderCharts]
  )

  const disposeCharts = useCallback(() => {
    for (const instance of chartInstancesRef.current.values()) {
      instance.dispose()
    }
    chartInstancesRef.current.clear()
  }, [])

  useEffect(() => {
    resizeObserverRef.current = new ResizeObserver(() => {
      resizeCharts()
    })
    chartElementsRef.current.forEach((element) => resizeObserverRef.current?.observe(element))
    queueRenderCharts()

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      disposeCharts()
    }
  }, [resizeCharts, queueRenderCharts, disposeCharts])

  useEffect(() => {
    queueRenderCharts()
  }, [metricCharts, queueRenderCharts])

  return { setChartElement, disposeCharts }
}
