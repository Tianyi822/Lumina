import { monitorEventLoopDelay } from 'perf_hooks'
import { logger } from '@main/services/logger'

const WARNING_THRESHOLD_MS = 100
const CHECK_INTERVAL_MS = 30_000

/**
 * 启动事件循环延迟监控
 * 每 30 秒采集一次；仅 p99 > 100ms 时输出警告，正常态不写日志以免刷屏
 */
export function startEventLoopMonitoring(): void {
  if (typeof monitorEventLoopDelay !== 'function') {
    return
  }

  const histogram = monitorEventLoopDelay({ resolution: 20 })
  histogram.enable()

  const interval = setInterval(() => {
    const mean = histogram.mean / 1e6
    const p99 = histogram.percentile(99) / 1e6
    const max = histogram.max / 1e6

    if (p99 > WARNING_THRESHOLD_MS) {
      logger.warn('事件循环延迟偏高', 'main', {
        meanMs: Math.round(mean * 100) / 100,
        p99Ms: Math.round(p99 * 100) / 100,
        maxMs: Math.round(max * 100) / 100
      })
    }

    histogram.reset()
  }, CHECK_INTERVAL_MS)

  interval.unref()
}
