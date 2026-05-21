import { useState, useRef, useCallback, useEffect } from 'react'
import { useContainerStore, useLabStore } from '@renderer/stores'
import type { ContainerDetails, LabData } from '@renderer/types/lab'

const LAB_AUTO_REFRESH_INTERVAL = 3000

interface UseLabAutoRefreshOptions {
  currentLab: LabData | null
  selectedContainer: ContainerDetails | null
  labDetailTab: string
  isOrphan: boolean
  isLabFrontend: boolean
}

interface UseLabAutoRefreshReturn {
  isRefreshingStats: boolean
  isManualRefreshingStats: boolean
  isRefreshingLabState: boolean
  handleRefreshStats: () => Promise<void>
}

export function useLabAutoRefresh(options: UseLabAutoRefreshOptions): UseLabAutoRefreshReturn {
  const { currentLab, selectedContainer, labDetailTab, isOrphan } = options

  const [isRefreshingStats, setIsRefreshingStats] = useState(false)
  const [isManualRefreshingStats, setIsManualRefreshingStats] = useState(false)
  const [isRefreshingLabState, setIsRefreshingLabState] = useState(false)

  const timerRef = useRef<number | null>(null)
  const isRefreshingStatsRef = useRef(false)

  const refreshStats = useCallback(
    async (refreshOptions?: { silent?: boolean }) => {
      const containerId = selectedContainer?.id
      if (!containerId || isRefreshingStatsRef.current) return

      isRefreshingStatsRef.current = true
      setIsRefreshingStats(true)
      try {
        await useContainerStore.getState().loadContainerStats(containerId, refreshOptions)
      } finally {
        isRefreshingStatsRef.current = false
        setIsRefreshingStats(false)
      }
    },
    [selectedContainer?.id]
  )

  const shouldKeepAutoRefresh = useCallback(
    (container?: ContainerDetails | null): boolean => {
      const target = container || selectedContainer
      if (!currentLab || currentLab.backendType === 'ssh' || !target) return false
      if (currentLab.frontend && !isOrphan) return true
      return labDetailTab === 'stats' && target.state === 'running'
    },
    [currentLab, selectedContainer, labDetailTab, isOrphan]
  )

  const runLabRefreshCycle = useCallback(
    async (cycleOptions?: { silentStats?: boolean }) => {
      const labId = currentLab?.labId
      if (!labId || isRefreshingLabState) return

      setIsRefreshingLabState(true)
      try {
        await useLabStore.getState().loadLab(labId, true, { silent: true })

        const container = useContainerStore.getState().selectedContainer
        if (!container) {
          useContainerStore.getState().clearContainerStats()
          return
        }

        if (labDetailTab === 'stats' && container.state === 'running') {
          await refreshStats({ silent: cycleOptions?.silentStats })
        } else if (container.state !== 'running') {
          useContainerStore.getState().clearContainerStats()
        }
      } finally {
        setIsRefreshingLabState(false)
      }
    },
    [currentLab?.labId, labDetailTab, refreshStats, isRefreshingLabState]
  )

  const stopAutoRefresh = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startAutoRefresh = useCallback(() => {
    stopAutoRefresh()
    if (!shouldKeepAutoRefresh()) return

    timerRef.current = window.setInterval(() => {
      if (!shouldKeepAutoRefresh()) {
        stopAutoRefresh()
        return
      }
      void runLabRefreshCycle({ silentStats: true })
    }, LAB_AUTO_REFRESH_INTERVAL)
  }, [shouldKeepAutoRefresh, stopAutoRefresh, runLabRefreshCycle])

  const syncAutoRefresh = useCallback(async () => {
    if (!currentLab || currentLab.backendType === 'ssh') {
      stopAutoRefresh()
      return
    }

    const container = selectedContainer
    if (!container) {
      stopAutoRefresh()
      return
    }

    await runLabRefreshCycle()

    if (shouldKeepAutoRefresh() && useContainerStore.getState().selectedContainer?.id === container.id) {
      startAutoRefresh()
    } else {
      stopAutoRefresh()
    }
  }, [currentLab, selectedContainer, runLabRefreshCycle, shouldKeepAutoRefresh, startAutoRefresh, stopAutoRefresh])

  const handleRefreshStats = useCallback(async () => {
    if (isManualRefreshingStats) return

    setIsManualRefreshingStats(true)
    try {
      await refreshStats()
    } finally {
      setIsManualRefreshingStats(false)
    }
  }, [refreshStats, isManualRefreshingStats])

  // 监听 tab 切换
  useEffect(() => {
    void syncAutoRefresh()
  }, [labDetailTab, syncAutoRefresh])

  // 监听容器 ID 变化
  useEffect(() => {
    const newId = selectedContainer?.id
    if (newId) {
      void syncAutoRefresh()
    } else {
      useContainerStore.getState().clearContainerStats()
      stopAutoRefresh()
    }
  }, [selectedContainer?.id, syncAutoRefresh, stopAutoRefresh])

  // 监听容器状态变化
  useEffect(() => {
    void syncAutoRefresh()
  }, [selectedContainer?.state, syncAutoRefresh])

  // 监听 labId / status 变化
  useEffect(() => {
    void syncAutoRefresh()
  }, [currentLab?.labId, currentLab?.status, syncAutoRefresh])

  // 清理
  useEffect(() => {
    return () => stopAutoRefresh()
  }, [stopAutoRefresh])

  return {
    isRefreshingStats,
    isManualRefreshingStats,
    isRefreshingLabState,
    handleRefreshStats
  }
}
