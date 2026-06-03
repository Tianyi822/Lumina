import { useState, useRef, useCallback, useEffect } from 'react'
import type { SshServerStats } from '@renderer/types/lab'
import { MONITOR_CHART_MAX_POINTS, trimRollingQueue } from '../monitorChartSeries'

const SSH_STATS_REFRESH_INTERVAL = 3000

export interface UseSshStatsPollingOptions {
  labId: string
  connected: boolean
  active: boolean
  onReset?: () => void
}

export interface UseSshStatsPollingReturn {
  stats: SshServerStats | null
  statsHistory: SshServerStats[]
  loading: boolean
  refreshing: boolean
  errorMessage: string
  sampledAtLabel: string
  loadStats: (options?: { silent?: boolean }) => Promise<void>
}

export function useSshStatsPolling(options: UseSshStatsPollingOptions): UseSshStatsPollingReturn {
  const { labId, connected, active, onReset } = options

  const [stats, setStats] = useState<SshServerStats | null>(null)
  const [statsHistory, setStatsHistory] = useState<SshServerStats[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const refreshingRef = useRef(false)
  const hasStatsRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const onResetRef = useRef(onReset)
  onResetRef.current = onReset

  const sampledAtLabel = stats?.sampledAt
    ? new Date(stats.sampledAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : '-'

  const appendSample = useCallback((sample: SshServerStats) => {
    setStatsHistory((prev) => trimRollingQueue([...prev, sample], MONITOR_CHART_MAX_POINTS))
  }, [])

  const loadStats = useCallback(
    async (loadOptions?: { silent?: boolean }) => {
      if (!connected || refreshingRef.current) {
        return
      }

      refreshingRef.current = true
      setRefreshing(true)
      if (!loadOptions?.silent && !hasStatsRef.current) {
        setLoading(true)
      }

      try {
        const result = await window.api.ssh.getServerStats(labId)
        if (!result.success || !result.stats) {
          setErrorMessage(result.error || '服务器资源统计采集失败')
          return
        }

        hasStatsRef.current = true
        setStats(result.stats)
        appendSample(result.stats)
        setErrorMessage('')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
      } finally {
        refreshingRef.current = false
        setRefreshing(false)
        setLoading(false)
      }
    },
    [appendSample, labId, connected]
  )

  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    stopPolling()

    if (!connected) {
      hasStatsRef.current = false
      setStats(null)
      setStatsHistory([])
      setErrorMessage('')
      setLoading(false)
      setRefreshing(false)
      onResetRef.current?.()
      return
    }

    if (!active) {
      return
    }

    void loadStats({ silent: hasStatsRef.current })
    timerRef.current = window.setInterval(() => {
      void loadStats({ silent: true })
    }, SSH_STATS_REFRESH_INTERVAL)

    return () => {
      stopPolling()
    }
  }, [labId, connected, active, stopPolling, loadStats])

  useEffect(() => {
    hasStatsRef.current = false
    setStats(null)
    setStatsHistory([])
    setErrorMessage('')
    onResetRef.current?.()
  }, [labId])

  return {
    stats,
    statsHistory,
    loading,
    refreshing,
    errorMessage,
    sampledAtLabel,
    loadStats
  }
}
