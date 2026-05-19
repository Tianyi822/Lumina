import { useState, useRef, useCallback, useEffect } from 'react'
import type { SshServerStats } from '@renderer/types/lab'
import type { RangeHours } from '../sshMonitorTypes'

const SSH_STATS_REFRESH_INTERVAL = 3000
const MAX_HISTORY_HOURS = 24

const RANGE_OPTIONS: Array<{ label: string; value: RangeHours }> = [
  { label: '1 小时', value: 1 },
  { label: '3 小时', value: 3 },
  { label: '12 小时', value: 12 },
  { label: '24 小时', value: 24 }
]

export interface UseSshStatsPollingOptions {
  labId: string
  connected: boolean
  active: boolean
  onReset?: () => void
}

export interface UseSshStatsPollingReturn {
  stats: SshServerStats | null
  statsHistory: SshServerStats[]
  selectedRangeHours: RangeHours
  loading: boolean
  refreshing: boolean
  errorMessage: string
  sampledAtLabel: string
  chartWindow: { start: number; end: number }
  visibleSamples: SshServerStats[]
  rangeLabel: string
  rangeOptions: typeof RANGE_OPTIONS
  setRange: (hours: RangeHours) => void
  loadStats: (options?: { silent?: boolean }) => Promise<void>
}

export function useSshStatsPolling(options: UseSshStatsPollingOptions): UseSshStatsPollingReturn {
  const { labId, connected, active, onReset } = options

  const [stats, setStats] = useState<SshServerStats | null>(null)
  const [statsHistory, setStatsHistory] = useState<SshServerStats[]>([])
  const [selectedRangeHours, setSelectedRangeHours] = useState<RangeHours>(1)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const refreshingRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const onResetRef = useRef(onReset)
  onResetRef.current = onReset

  // Computed values
  const sampledAtLabel = stats?.sampledAt
    ? new Date(stats.sampledAt).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : '-'

  const chartWindow = (() => {
    const end = Math.max(Date.now(), stats ? new Date(stats.sampledAt).getTime() : 0)
    return {
      start: end - selectedRangeHours * 60 * 60 * 1000,
      end
    }
  })()

  const visibleSamples = statsHistory.filter((sample) => {
    const time = new Date(sample.sampledAt).getTime()
    return time >= chartWindow.start && time <= chartWindow.end
  })

  const rangeLabel =
    RANGE_OPTIONS.find((option) => option.value === selectedRangeHours)?.label || '1 小时'

  // Load stats function
  const loadStats = useCallback(
    async (loadOptions?: { silent?: boolean }) => {
      if (!connected || refreshingRef.current) {
        return
      }

      refreshingRef.current = true
      setRefreshing(true)
      if (!loadOptions?.silent && !stats) {
        setLoading(true)
      }

      try {
        const result = await window.api.ssh.getServerStats(labId)
        if (!result.success || !result.stats) {
          setErrorMessage(result.error || '服务器资源统计采集失败')
          return
        }

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
    [labId, connected, stats]
  )

  // Append sample to history
  const appendSample = useCallback((sample: SshServerStats) => {
    const sampleTime = new Date(sample.sampledAt).getTime()
    const minTime = sampleTime - MAX_HISTORY_HOURS * 60 * 60 * 1000

    setStatsHistory((prev) => {
      const filtered = prev.filter((item) => new Date(item.sampledAt).getTime() >= minTime)
      return [...filtered, sample]
    })
  }, [])

  // Set range
  const setRange = useCallback((hours: RangeHours) => {
    setSelectedRangeHours(hours)
  }, [])

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Sync polling when dependencies change
  useEffect(() => {
    stopPolling()

    if (!connected) {
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

    void loadStats({ silent: !!stats })
    timerRef.current = window.setInterval(() => {
      void loadStats({ silent: true })
    }, SSH_STATS_REFRESH_INTERVAL)

    return () => {
      stopPolling()
    }
  }, [labId, connected, active, stopPolling, loadStats, stats])

  // Reset on labId change
  useEffect(() => {
    setStats(null)
    setStatsHistory([])
    setErrorMessage('')
    onResetRef.current?.()
  }, [labId])

  return {
    stats,
    statsHistory,
    selectedRangeHours,
    loading,
    refreshing,
    errorMessage,
    sampledAtLabel,
    chartWindow,
    visibleSamples,
    rangeLabel,
    rangeOptions: RANGE_OPTIONS,
    setRange,
    loadStats
  }
}
