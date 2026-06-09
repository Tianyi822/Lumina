import { useMemo, useRef, useCallback } from 'react'
import type { MetricChart } from './sshMonitorTypes'
import {
  mapSamplePoints,
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

/** SSH 远程服务器资源监控面板，展示 CPU/内存/GPU/磁盘 IO 实时趋势图 */
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
  // 缓存 ECharts 实例清理函数和图表 ref 回调
  const disposeChartsRef = useRef<(() => void) | null>(null)
  const chartRefCallbacksRef = useRef(new Map<string, (element: HTMLDivElement | null) => void>())

  // 启动定期轮询获取服务器统计数据
  const polling = useSshStatsPolling({
    labId,
    connected,
    active,
    onReset: () => disposeChartsRef.current?.()
  })

  const { stats, statsHistory, loading, refreshing, errorMessage, sampledAtLabel, loadStats } =
    polling

  // 将原始统计数据转为 ECharts 图表配置数组
  const metricCharts = useMemo<MetricChart[]>(() => {
    const samples = statsHistory
    const latest = stats
    const sampleCount = samples.length
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
        sampleCount,
        emptyLabel: '等待 CPU 采样',
        points: mapSamplePoints(samples, (sample) => sample.cpu.percent)
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
        sampleCount,
        emptyLabel: '等待内存采样',
        points: mapSamplePoints(samples, (sample) => sample.memory.percent)
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
        sampleCount,
        emptyLabel: '显卡未开启',
        points: mapSamplePoints(samples, (sample) => sample.gpu.utilizationPercent)
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
        sampleCount,
        emptyLabel: '显存不可用',
        points: mapSamplePoints(samples, (sample) => sample.gpu.memoryPercent)
      },
      {
        key: 'disk-read',
        label: '磁盘读取',
        valueLabel: formatRate(latest?.diskIO.readBytesPerSecond),
        tone: 'info',
        kind: 'rate',
        maxValue: calculateRateMax(samples, (sample) => sample.diskIO.readBytesPerSecond),
        supported: true,
        sampleCount,
        emptyLabel: '等待磁盘读取采样',
        points: mapSamplePoints(samples, (sample) => sample.diskIO.readBytesPerSecond)
      },
      {
        key: 'disk-write',
        label: '磁盘写入',
        valueLabel: formatRate(latest?.diskIO.writeBytesPerSecond),
        tone: 'info',
        kind: 'rate',
        maxValue: calculateRateMax(samples, (sample) => sample.diskIO.writeBytesPerSecond),
        supported: true,
        sampleCount,
        emptyLabel: '等待磁盘写入采样',
        points: mapSamplePoints(samples, (sample) => sample.diskIO.writeBytesPerSecond)
      }
    ]
  }, [statsHistory, stats])

  const { setChartElement, disposeCharts } = useEchartsManager(metricCharts)
  disposeChartsRef.current = disposeCharts

  const chartRefCallback = useCallback(
    (key: string) => {
      const cachedCallback = chartRefCallbacksRef.current.get(key)
      if (cachedCallback) {
        return cachedCallback
      }

      const nextCallback = (element: HTMLDivElement | null) => {
        setChartElement(key, element)
      }
      chartRefCallbacksRef.current.set(key, nextCallback)
      return nextCallback
    },
    [setChartElement]
  )

  return (
    <section className={styles['ssh-server-monitor-panel']}>
      <header className={styles['ssh-server-monitor-panel__header']}>
        <div className={styles['ssh-server-monitor-panel__copy']}>
          <div className={styles['ssh-server-monitor-panel__headline']}>
            <h2>远程资源占用</h2>
            <span className="sm-badge">最近采样 {sampledAtLabel}</span>
          </div>
        </div>

        <div className={styles['ssh-server-monitor-panel__actions']}>
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
                  aria-label={`${chart.label} 实时监控趋势`}
                ></div>

                {chart.sampleCount === 0 && (
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
