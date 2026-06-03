import { useCallback, useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { ECharts } from 'echarts'
import {
  buildBidirectionalIoChartOption,
  type BidirectionalIoChartLabels
} from '../bidirectionalIoChartOption'
import type { IoRateSample } from './useContainerIoHistory'

export function useBidirectionalIoChart(
  series: IoRateSample[],
  labels: BidirectionalIoChartLabels
): (element: HTMLDivElement | null) => void {
  const chartRef = useRef<ECharts | null>(null)
  const elementRef = useRef<HTMLDivElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const labelsRef = useRef(labels)
  labelsRef.current = labels
  const seriesRef = useRef(series)
  seriesRef.current = series

  const renderChart = useCallback(() => {
    const instance = chartRef.current
    if (!instance) return

    instance.setOption(buildBidirectionalIoChartOption(seriesRef.current, labelsRef.current), {
      notMerge: true,
      lazyUpdate: true
    })
  }, [])

  const setChartElement = useCallback(
    (element: HTMLDivElement | null) => {
      const previous = elementRef.current
      if (previous && previous !== element) {
        resizeObserverRef.current?.unobserve(previous)
      }

      elementRef.current = element

      if (!element) {
        chartRef.current?.dispose()
        chartRef.current = null
        return
      }

      if (!chartRef.current) {
        chartRef.current = echarts.init(element, undefined, { renderer: 'canvas' })
        resizeObserverRef.current ??= new ResizeObserver(() => {
          chartRef.current?.resize()
        })
        resizeObserverRef.current.observe(element)
      }

      renderChart()
    },
    [renderChart]
  )

  useEffect(() => {
    renderChart()
  }, [series, labels, renderChart])

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      chartRef.current?.dispose()
      chartRef.current = null
      elementRef.current = null
    }
  }, [])

  return setChartElement
}
