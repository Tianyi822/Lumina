import type PptxGenJS from 'pptxgenjs'
import type { ResolvedTheme } from '../types/presentation'
import type { ChartContent, PositionOptions } from '@shared/types/presentation'

/**
 * 图表构建器
 */
export class ChartBuilder {
  /**
   * 添加图表内容
   */
  addChart(
    slide: PptxGenJS.Slide,
    content: ChartContent,
    position: Required<PositionOptions>,
    theme: ResolvedTheme
  ): number {
    const chartType = this.resolveChartType(content.type)
    const chartData = content.data.series.map((series) => ({
      name: series.name,
      labels: content.data.labels,
      values: series.values
    }))

    slide.addChart(chartType, chartData, {
      x: position.x,
      y: position.y,
      w: position.w,
      h: position.h,
      showLegend: content.options?.showLegend ?? content.data.series.length > 1,
      legendPos: 'b',
      showValue: content.options?.showValue ?? content.type === 'pie',
      valAxisHidden: !(content.options?.showValueAxis ?? true),
      catAxisHidden: !(content.options?.showCategoryAxis ?? true),
      showTitle: !!content.options?.title,
      title: content.options?.title,
      titleColor: theme.textColor,
      titleFontFace: theme.headingFontFace,
      titleFontSize: 18,
      chartColors: [theme.primaryColor, theme.accentColor, theme.secondaryColor, '94A3B8'],
      catAxisLabelColor: theme.mutedTextColor,
      valAxisLabelColor: theme.mutedTextColor,
      showCatAxisTitle: false,
      showValAxisTitle: false
    })

    return position.h
  }

  /**
   * 映射图表类型
   */
  private resolveChartType(type: ChartContent['type']): PptxGenJS.CHART_NAME {
    switch (type) {
      case 'line':
        return 'line'
      case 'pie':
        return 'pie'
      case 'doughnut':
        return 'doughnut'
      case 'bar':
      default:
        return 'bar'
    }
  }
}
