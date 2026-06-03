import { useMemo } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { formatBidirectionalIoChartAriaLabel } from './bidirectionalIoChartOption'
import { formatRateLabel } from './containerIoFormatters'
import { useBidirectionalIoChart } from './hooks/useBidirectionalIoChart'
import type { IoRateSample } from './hooks/useContainerIoHistory'
import styles from './BidirectionalIoCard.module.css'

interface BidirectionalIoCardProps {
  title: string
  upperSeriesLabel: string
  lowerSeriesLabel: string
  upperRate: number | null
  lowerRate: number | null
  series: IoRateSample[]
  emptyLabel?: string
}

export default function BidirectionalIoCard({
  title,
  upperSeriesLabel,
  lowerSeriesLabel,
  upperRate,
  lowerRate,
  series,
  emptyLabel = '等待采样…'
}: BidirectionalIoCardProps) {
  const chartLabels = useMemo(
    () => ({
      upper: upperSeriesLabel,
      lower: lowerSeriesLabel
    }),
    [upperSeriesLabel, lowerSeriesLabel]
  )

  const hasChart = series.length >= 2
  const setChartElement = useBidirectionalIoChart(series, chartLabels)
  const chartAriaLabel = formatBidirectionalIoChartAriaLabel(title, series)

  return (
    <article className={styles['bidirectional-io-card']}>
      <header className={styles['bidirectional-io-card__header']}>
        <h4 className={styles['bidirectional-io-card__title']}>{title}</h4>
        <div className={styles['bidirectional-io-card__metrics']}>
          <span className={`${styles['metric']} ${styles['metric--upper']}`}>
            <SvgIcon name="arrow-up" size={12} />
            <span>{formatRateLabel(upperRate)}</span>
          </span>
          <span className={`${styles['metric']} ${styles['metric--lower']}`}>
            <SvgIcon name="arrow-down" size={12} />
            <span>{formatRateLabel(lowerRate)}</span>
          </span>
        </div>
      </header>

      <div className={styles['bidirectional-io-card__chart']}>
        <div
          ref={setChartElement}
          className={styles['bidirectional-io-card__echarts']}
          role="img"
          aria-label={chartAriaLabel}
        />
        {!hasChart && (
          <p className={styles['bidirectional-io-card__empty']}>{emptyLabel}</p>
        )}
      </div>
    </article>
  )
}
