import { ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useContainerStore, useLabStore } from '@renderer/stores'
import { useZustandStore } from '@renderer/composables/useZustandStore'
import type { ContainerDetails, LabData } from '@renderer/types/lab'

const LAB_AUTO_REFRESH_INTERVAL = 3000

export interface UseLabAutoRefreshOptions {
  currentLab: ComputedRef<LabData | null>
  selectedContainer: ComputedRef<ContainerDetails | null>
  labDetailTab: Ref<'stats' | 'terminal' | 'logs'>
  isSshLab: ComputedRef<boolean>
  isOrphan: ComputedRef<boolean>
  isLabFrontend: ComputedRef<boolean>
}

export interface UseLabAutoRefreshReturn {
  isRefreshingStats: Ref<boolean>
  isManualRefreshingStats: Ref<boolean>
  isRefreshingLabState: Ref<boolean>
  isValidatingFrontendBuild: Ref<boolean>
  handleRefreshStats: () => Promise<void>
  cleanup: () => void
}

export function useLabAutoRefresh(options: UseLabAutoRefreshOptions): UseLabAutoRefreshReturn {
  const { currentLab, selectedContainer, labDetailTab, isOrphan } = options

  const containerStore = useZustandStore(useContainerStore)
  const labStore = useZustandStore(useLabStore)

  const labRefreshTimerId = ref<number | null>(null)
  const isRefreshingStats = ref(false)
  const isManualRefreshingStats = ref(false)
  const isRefreshingLabState = ref(false)
  const isValidatingFrontendBuild = ref(false)

  async function refreshStats(options?: { silent?: boolean }): Promise<void> {
    const containerId = selectedContainer.value?.id
    if (!containerId || isRefreshingStats.value) {
      return
    }

    isRefreshingStats.value = true
    try {
      await containerStore.loadContainerStats(containerId, options)
    } finally {
      isRefreshingStats.value = false
    }
  }

  function shouldKeepLabAutoRefresh(container?: ContainerDetails | null): boolean {
    const currentContainer = container || selectedContainer.value
    if (!currentLab.value || currentLab.value.backendType === 'ssh' || !currentContainer) {
      return false
    }

    if (currentLab.value.frontend && !isOrphan.value) {
      return true
    }

    return labDetailTab.value === 'stats' && currentContainer.state === 'running'
  }

  async function validateFrontendBuildOnRefresh(): Promise<void> {
    const labId = currentLab.value?.labId
    const frontend = currentLab.value?.frontend

    if (
      !labId ||
      !frontend ||
      isOrphan.value ||
      frontend.buildValidated ||
      currentLab.value?.status !== 'running' ||
      isValidatingFrontendBuild.value
    ) {
      return
    }

    isValidatingFrontendBuild.value = true
    try {
      await labStore.validateFrontendBuild(labId, {
        silent: true
      })
    } finally {
      isValidatingFrontendBuild.value = false
    }
  }

  async function runLabRefreshCycle(options?: { silentStats?: boolean }): Promise<void> {
    const labId = currentLab.value?.labId
    if (!labId || isRefreshingLabState.value) {
      return
    }

    isRefreshingLabState.value = true
    try {
      await labStore.loadLab(labId, true, {
        silent: true
      })

      const container = selectedContainer.value
      if (!container) {
        containerStore.clearContainerStats()
        return
      }

      if (labDetailTab.value === 'stats' && container.state === 'running') {
        await refreshStats({
          silent: options?.silentStats
        })
      } else if (container.state !== 'running') {
        containerStore.clearContainerStats()
      }

      await validateFrontendBuildOnRefresh()
    } finally {
      isRefreshingLabState.value = false
    }
  }

  function stopLabAutoRefresh(): void {
    if (labRefreshTimerId.value !== null) {
      clearInterval(labRefreshTimerId.value)
      labRefreshTimerId.value = null
    }
  }

  function startLabAutoRefresh(): void {
    stopLabAutoRefresh()

    if (!shouldKeepLabAutoRefresh()) {
      return
    }

    labRefreshTimerId.value = window.setInterval(() => {
      if (!shouldKeepLabAutoRefresh()) {
        stopLabAutoRefresh()
        return
      }

      void runLabRefreshCycle({ silentStats: true })
    }, LAB_AUTO_REFRESH_INTERVAL)
  }

  async function syncLabAutoRefresh(): Promise<void> {
    if (!currentLab.value || currentLab.value.backendType === 'ssh') {
      stopLabAutoRefresh()
      return
    }

    const container = selectedContainer.value
    if (!container) {
      stopLabAutoRefresh()
      return
    }

    await runLabRefreshCycle()

    if (
      shouldKeepLabAutoRefresh(selectedContainer.value) &&
      selectedContainer.value?.id === container.id
    ) {
      startLabAutoRefresh()
    } else {
      stopLabAutoRefresh()
    }
  }

  async function handleRefreshStats(): Promise<void> {
    if (isManualRefreshingStats.value) {
      return
    }

    isManualRefreshingStats.value = true
    try {
      await refreshStats()
    } finally {
      isManualRefreshingStats.value = false
    }
  }

  // 监听器
  watch(
    labDetailTab,
    async () => {
      await syncLabAutoRefresh()
    },
    { immediate: true }
  )

  watch(
    () => selectedContainer.value?.id,
    async (newId, oldId) => {
      if (newId !== oldId) containerStore.clearContainerStats()
      if (newId) {
        await syncLabAutoRefresh()
        return
      }
      stopLabAutoRefresh()
    }
  )

  watch(
    () => selectedContainer.value?.state,
    async () => {
      await syncLabAutoRefresh()
    }
  )

  watch(
    () => [
      currentLab.value?.labId,
      currentLab.value?.status,
      currentLab.value?.frontend?.buildValidated
    ],
    async () => {
      await syncLabAutoRefresh()
    }
  )

  function cleanup(): void {
    stopLabAutoRefresh()
  }

  return {
    isRefreshingStats,
    isManualRefreshingStats,
    isRefreshingLabState,
    isValidatingFrontendBuild,
    handleRefreshStats,
    cleanup
  }
}
