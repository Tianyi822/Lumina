import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { SshServerStats } from '@renderer/types/lab'
import type { RangeHours } from './sshMonitorTypes'

const SSH_STATS_REFRESH_INTERVAL = 3000
const MAX_HISTORY_HOURS = 24

export interface UseSshStatsPollingOptions {
  labId: ComputedRef<string>
  connected: ComputedRef<boolean>
  active: ComputedRef<boolean>
  onReset?: () => void
}

export function useSshStatsPolling(options: UseSshStatsPollingOptions) {
  const { labId, connected, active, onReset } = options

  const stats = ref<SshServerStats | null>(null)
  const statsHistory = ref<SshServerStats[]>([])
  const selectedRangeHours = ref<RangeHours>(1)
  const loading = ref(false)
  const refreshing = ref(false)
  const errorMessage = ref('')
  const refreshTimerId = ref<number | null>(null)

  const rangeOptions: Array<{ label: string; value: RangeHours }> = [
    { label: '1 小时', value: 1 },
    { label: '3 小时', value: 3 },
    { label: '12 小时', value: 12 },
    { label: '24 小时', value: 24 }
  ]

  const sampledAtLabel = computed(() => {
    if (!stats.value?.sampledAt) {
      return '-'
    }

    return new Date(stats.value.sampledAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  })

  const chartWindow = computed(() => {
    const end = Math.max(Date.now(), stats.value ? new Date(stats.value.sampledAt).getTime() : 0)
    return {
      start: end - selectedRangeHours.value * 60 * 60 * 1000,
      end
    }
  })

  const visibleSamples = computed(() => {
    const { start, end } = chartWindow.value
    return statsHistory.value.filter((sample) => {
      const time = new Date(sample.sampledAt).getTime()
      return time >= start && time <= end
    })
  })

  const rangeLabel = computed(() => {
    return rangeOptions.find((option) => option.value === selectedRangeHours.value)?.label || '1 小时'
  })

  watch(labId, () => {
    stats.value = null
    statsHistory.value = []
    errorMessage.value = ''
    onReset?.()
  })

  watch([labId, connected, active], () => syncPolling(), { immediate: true })

  onBeforeUnmount(() => stopPolling())

  function syncPolling(): void {
    stopPolling()

    if (!connected.value) {
      stats.value = null
      statsHistory.value = []
      errorMessage.value = ''
      loading.value = false
      refreshing.value = false
      onReset?.()
      return
    }

    if (!active.value) {
      return
    }

    void loadStats({ silent: !!stats.value })
    refreshTimerId.value = window.setInterval(() => {
      void loadStats({ silent: true })
    }, SSH_STATS_REFRESH_INTERVAL)
  }

  function stopPolling(): void {
    if (refreshTimerId.value !== null) {
      clearInterval(refreshTimerId.value)
      refreshTimerId.value = null
    }
  }

  async function loadStats(options?: { silent?: boolean }): Promise<void> {
    if (!connected.value || refreshing.value) {
      return
    }

    refreshing.value = true
    if (!options?.silent && !stats.value) {
      loading.value = true
    }

    try {
      const result = await window.api.ssh.getServerStats(labId.value)
      if (!result.success || !result.stats) {
        errorMessage.value = result.error || '服务器资源统计采集失败'
        return
      }

      stats.value = result.stats
      appendSample(result.stats)
      errorMessage.value = ''
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
    } finally {
      refreshing.value = false
      loading.value = false
    }
  }

  function appendSample(sample: SshServerStats): void {
    const sampleTime = new Date(sample.sampledAt).getTime()
    const minTime = sampleTime - MAX_HISTORY_HOURS * 60 * 60 * 1000

    statsHistory.value = [
      ...statsHistory.value.filter((item) => new Date(item.sampledAt).getTime() >= minTime),
      sample
    ]
  }

  function setRange(hours: RangeHours): void {
    selectedRangeHours.value = hours
  }

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
    rangeOptions,
    setRange,
    loadStats
  }
}
