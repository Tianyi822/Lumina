import * as echarts from 'echarts'
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import type { ComponentPublicInstance, ComputedRef } from 'vue'
import type { ECharts, EChartsOption } from 'echarts'
import type { MetricChart } from './sshMonitorTypes'
import {
  formatTooltip,
  getToneColor,
  readCssVariable,
  formatSampleTime,
  calculateAxisInterval
} from './sshMonitorFormatters'

export interface UseEchartsManagerReturn {
  setChartElement: (key: string, element: Element | ComponentPublicInstance | null) => void
  disposeCharts: () => void
}

export function useEchartsManager(
  metricCharts: ComputedRef<MetricChart[]>
): UseEchartsManagerReturn {
  const chartElements = new Map<string, HTMLElement>()
  const chartInstances = new Map<string, ECharts>()
  let resizeObserver: ResizeObserver | null = null
  let renderQueued = false

  function setChartElement(key: string, element: Element | ComponentPublicInstance | null): void {
    const htmlElement = resolveHtmlElement(element)
    const previousElement = chartElements.get(key)

    if (!htmlElement) {
      if (previousElement) {
        resizeObserver?.unobserve(previousElement)
      }
      chartElements.delete(key)
      const instance = chartInstances.get(key)
      if (instance) {
        instance.dispose()
        chartInstances.delete(key)
      }
      return
    }

    if (previousElement && previousElement !== htmlElement) {
      resizeObserver?.unobserve(previousElement)
    }

    chartElements.set(key, htmlElement)
    resizeObserver?.observe(htmlElement)

    if (!chartInstances.has(key)) {
      chartInstances.set(key, echarts.init(htmlElement, undefined, { renderer: 'canvas' }))
    }

    queueRenderCharts()
  }

  function resolveHtmlElement(
    element: Element | ComponentPublicInstance | null
  ): HTMLElement | null {
    if (element instanceof HTMLElement) {
      return element
    }

    if (isComponentInstance(element) && element.$el instanceof HTMLElement) {
      return element.$el
    }

    return null
  }

  function isComponentInstance(
    element: Element | ComponentPublicInstance | null
  ): element is ComponentPublicInstance {
    return !!element && !(element instanceof Element)
  }

  function queueRenderCharts(): void {
    if (renderQueued) {
      return
    }

    renderQueued = true
    void nextTick(() => {
      renderQueued = false
      renderCharts()
    })
  }

  function renderCharts(): void {
    const charts = metricCharts.value
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
      instance.setOption(buildChartOption(chart), true)
    }
  }

  function disposeCharts(): void {
    for (const instance of chartInstances.values()) {
      instance.dispose()
    }
    chartInstances.clear()
    chartElements.clear()
  }

  function resizeCharts(): void {
    for (const instance of chartInstances.values()) {
      instance.resize()
    }
  }

  function buildChartOption(chart: MetricChart): EChartsOption {
    const color = getToneColor(chart.tone)
    const axisColor = readCssVariable('--sm-color-text-tertiary', '#8b949e')
    const gridColor = readCssVariable('--sm-color-border-subtle', '#e5e7eb')
    const labelData = chart.points.map((point) => formatSampleTime(point.time))
    const valueData = chart.points.map((point) => point.value)

    return {
      animation: chart.points.length <= 80,
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
        formatter: (params: unknown) => formatTooltip(params, chart)
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labelData,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: axisColor,
          fontSize: 10,
          hideOverlap: true,
          interval: calculateAxisInterval(chart.points.length)
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
          data: valueData,
          smooth: true,
          showSymbol: chart.points.length <= 24,
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
  }

  watch(metricCharts, () => {
    queueRenderCharts()
  })

  onMounted(() => {
    resizeObserver = new ResizeObserver(() => {
      resizeCharts()
    })
    chartElements.forEach((element) => resizeObserver?.observe(element))
    queueRenderCharts()
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    disposeCharts()
  })

  return { setChartElement, disposeCharts }
}
