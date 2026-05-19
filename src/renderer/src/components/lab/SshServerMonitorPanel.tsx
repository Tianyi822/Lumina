import { useMemo, useRef, useCallback } from 'react'
import type { MetricChart } from './sshMonitorTypes'
import {
  collectPoints,
  collectGpuNames,
  calculateRateMax,
  formatPercent,
  formatBytePair,
  formatRate,
  formatAxisLabel
} from './sshMonitorFormatters'
import { useSshStatsPolling } from './hooks/useSshStatsPolling'
import { useEchartsManager } from './hooks/useEchartsManager'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './SshServerMonitorPanel.module.css'

interface SshServerMonitorPanelProps {
  labId: string
  connected: boolean
  active: boolean
}

export default function SshServerMonitorPanel({
  labId,
  connected,
  active
}: SshServerMonitorPanelProps) {
  const disposeChartsRef = useRef<(() => void) | null>(null)

  const polling = useSshStatsPolling({
    labId,
    connected,
    active,
    onReset: () => disposeChartsRef.current?.()
  })

  const {
    stats,
    selectedRangeHours,
    loading,
    refreshing,
    errorMessage,
    sampledAtLabel,
    rangeLabel,
    rangeOptions,
    setRange,
    loadStats
  } = polling

  const metricCharts = useMemo<MetricChart[]>(() => {
    const samples = polling.visibleSamples
    const latest = polling.stats
    const gpuSupported = !!latest?.gpu.supported
    const hasGpuMemory = gpuSupported && latest?.gpu.memoryPercent !== null
    const gpuNames = collectGpuNames(latest)

    return [
      {
        key: 'cpu',
        label: 'CPU 占用',
        valueLabel: formatPercent(latest?.cpu.percent),
        tone: 'primary',
        kind: 'percent',
        maxValue: 100,
        supported: true,
        emptyLabel: '等待 CPU 采样',
        points: collectPoints(samples, (sample) => sample.cpu.percent)
      },
      {
        key: 'memory',
        label: '内存占用',
        valueLabel: latest
          ? `${latest.memory.source === 'quota' ? '实例配额 ' : '宿主机 '}${formatBytePair(latest.memory.usageBytes, latest.memory.totalBytes)}`
          : '-',
        detailLabel: formatPercent(latest?.memory.percent),
        inlineDetail: true,
        tone: 'success',
        kind: 'percent',
        maxValue: 100,
        supported: true,
        emptyLabel: '等待内存采样',
        points: collectPoints(samples, (sample) => sample.memory.percent)
      },
      {
        key: 'gpu',
        label: 'GPU 占用',
        valueLabel: gpuSupported
          ? formatPercent(latest?.gpu.utilizationPercent)
          : latest?.gpu.message || '显卡未开启',
        labelSuffix: gpuSupported && gpuNames.length > 0 ? gpuNames.join(' / ') : undefined,
        tone: gpuSupported ? 'warning' : 'muted',
        kind: 'percent',
        maxValue: 100,
        supported: gpuSupported,
        emptyLabel: '显卡未开启',
        points: collectPoints(samples, (sample) => sample.gpu.utilizationPercent)
      },
      {
        key: 'vram',
        label: '显存占用',
        valueLabel:
          latest && latest.gpu.memoryUsageBytes !== null && latest.gpu.memoryTotalBytes !== null
            ? formatBytePair(latest.gpu.memoryUsageBytes, latest.gpu.memoryTotalBytes)
            : '显存不可用',
        detailLabel: hasGpuMemory ? formatPercent(latest?.gpu.memoryPercent) : undefined,
        inlineDetail: true,
        tone: hasGpuMemory ? 'danger' : 'muted',
        kind: 'percent',
        maxValue: 100,
        supported: hasGpuMemory,
        emptyLabel: '显存不可用',
        points: collectPoints(samples, (sample) => sample.gpu.memoryPercent)
      },
      {
        key: 'disk-read',
        label: '磁盘读取',
        valueLabel: formatRate(latest?.diskIO.readBytesPerSecond),
        tone: 'info',
        kind: 'rate',
        maxValue: calculateRateMax(samples, (sample) => sample.diskIO.readBytesPerSecond),
        supported: true,
        emptyLabel: '等待磁盘读取采样',
        points: collectPoints(samples, (sample) => sample.diskIO.readBytesPerSecond)
      },
      {
        key: 'disk-write',
        label: '磁盘写入',
        valueLabel: formatRate(latest?.diskIO.writeBytesPerSecond),
        tone: 'info',
        kind: 'rate',
        maxValue: calculateRateMax(samples, (sample) => sample.diskIO.writeBytesPerSecond),
        supported: true,
        emptyLabel: '等待磁盘写入采样',
        points: collectPoints(samples, (sample) => sample.diskIO.writeBytesPerSecond)
      }
    ]
  }, [polling.visibleSamples, polling.stats])

  const echartsManager = useEchartsManager(metricCharts)
  disposeChartsRef.current = echartsManager.disposeCharts

  const chartRefCallback = useCallback(
    (key: string) => (element: HTMLDivElement | null) => {
      echartsManager.setChartElement(key, element)
    },
    [echartsManager]
  )

  return (
    <section className={styles['ssh-server-monitor-panel']}>
      <header className={styles['ssh-server-monitor-panel__header']}>
        <div className={styles['ssh-server-monitor-panel__copy']}>
          <div className={styles['ssh-server-monitor-panel__headline']}>
            <h2>远程资源占用</h2>
            <span className="sm-badge">最近采样 {sampledAtLabel}</span>
            <span className="sm-badge">范围 {rangeLabel}</span>
          </div>
        </div>

        <div className={styles['ssh-server-monitor-panel__actions']}>
          <div className={styles['ssh-server-monitor-panel__range']} aria-label="统计范围">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={selectedRangeHours === option.value ? styles['is-active'] : undefined}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            className="sm-button sm-button--secondary sm-button--small"
            type="button"
            disabled={!connected || refreshing}
            onClick={() => void loadStats()}
          >
            <SvgIcon name="refresh" size={14} spin={refreshing} />
            <span>刷新</span>
          </button>
        </div>
      </header>

      {!connected ? (
        <div className={styles['ssh-server-monitor-panel__state']}>
          <h3>SSH 未连接</h3>
          <p>连接远程服务器后，这里会开始实时显示资源占用。</p>
        </div>
      ) : loading ? (
        <div className={styles['ssh-server-monitor-panel__state']}>
          <div className={styles['ssh-server-monitor-panel__spinner']}></div>
          <p>正在采集服务器资源...</p>
        </div>
      ) : errorMessage ? (
        <div className={styles['ssh-server-monitor-panel__state']}>
          <h3>监控数据不可用</h3>
          <p>{errorMessage}</p>
          <button
            className="sm-button sm-button--secondary sm-button--small"
            onClick={() => void loadStats()}
          >
            重试
          </button>
        </div>
      ) : stats ? (
        <div className={styles['ssh-server-monitor-panel__grid']}>
          {metricCharts.map((chart) => (
            <article
              key={chart.key}
              className={`${styles['ssh-monitor-chart']} ${styles[`ssh-monitor-chart--${chart.tone}`]} ${!chart.supported ? styles['is-muted'] : ''}`}
            >
              <header className={styles['ssh-monitor-chart__header']}>
                <div className={styles['ssh-monitor-chart__copy']}>
                  <span className={styles['ssh-monitor-chart__label']}>
                    {chart.label}
                    {chart.labelSuffix && (
                      <small className={styles['ssh-monitor-chart__label-suffix']}>
                        {chart.labelSuffix}
                      </small>
                    )}
                  </span>
                  <div className={styles['ssh-monitor-chart__value-row']}>
                    <strong>{chart.valueLabel}</strong>
                    {chart.detailLabel && chart.inlineDetail && (
                      <small
                        className={`${styles['ssh-monitor-chart__detail']} ${styles['ssh-monitor-chart__detail--inline']}`}
                      >
                        {chart.detailLabel}
                      </small>
                    )}
                  </div>
                  {chart.hostDetailLabel && (
                    <small className={styles['ssh-monitor-chart__host-detail']}>
                      {chart.hostDetailLabel}
                    </small>
                  )}
                  {chart.detailLabel && !chart.inlineDetail && (
                    <small className={styles['ssh-monitor-chart__detail']}>
                      {chart.detailLabel}
                    </small>
                  )}
                </div>
                <span className={styles['ssh-monitor-chart__axis']}>{formatAxisLabel(chart)}</span>
              </header>

              <div className={styles['ssh-monitor-chart__body']}>
                <div
                  ref={chartRefCallback(chart.key)}
                  className={styles['ssh-monitor-chart__echarts']}
                  role="img"
                  aria-label={`${chart.label} ${rangeLabel}趋势`}
                ></div>

                {chart.points.length === 0 && (
                  <div className={styles['ssh-monitor-chart__empty']}>{chart.emptyLabel}</div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
