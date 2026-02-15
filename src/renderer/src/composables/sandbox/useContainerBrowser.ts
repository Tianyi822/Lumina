import { storeToRefs } from 'pinia'
import { useSandboxStore } from '@renderer/stores'
import type { ContainerState } from '@shared/types/sandbox'
import type { Ref, ComputedRef } from 'vue'
import type { ContainerInfo } from '@shared/types/sandbox'

interface UseContainerBrowserReturn {
  containerSearchQuery: Ref<string>
  containerFilter: Ref<'all' | 'running' | 'stopped'>
  selectedContainerId: Ref<string | null>
  filteredContainers: ComputedRef<ContainerInfo[]>
  runningCount: ComputedRef<number>
  stoppedCount: ComputedRef<number>
  getStateLabel: (state: ContainerState) => string
  getStateClass: (state: ContainerState) => string
  formatCreated: (timestamp: number) => string
  selectContainer: (containerId: string) => void
  refreshContainers: () => Promise<void>
  reset: () => void
}

export function useContainerBrowser(): UseContainerBrowserReturn {
  const sandboxStore = useSandboxStore()

  const {
    creatorContainerSearchQuery: containerSearchQuery,
    creatorContainerFilter: containerFilter,
    creatorSelectedContainerId: selectedContainerId,
    creatorFilteredContainers: filteredContainers,
    creatorRunningCount: runningCount,
    creatorStoppedCount: stoppedCount
  } = storeToRefs(sandboxStore)

  function getStateLabel(state: ContainerState): string {
    const labels: Record<ContainerState, string> = {
      created: '已创建',
      running: '运行中',
      paused: '已暂停',
      restarting: '重启中',
      removing: '删除中',
      exited: '已停止',
      dead: '已终止'
    }
    return labels[state] || state
  }

  function getStateClass(state: ContainerState): string {
    return `state-${state}`
  }

  function formatCreated(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 30) return `${days}天前`
    return date.toLocaleDateString('zh-CN')
  }

  function selectContainer(containerId: string): void {
    sandboxStore.creatorSelectContainer(containerId)
  }

  async function refreshContainers(): Promise<void> {
    await sandboxStore.loadContainers()
  }

  function reset(): void {
    sandboxStore.creatorResetContainerSelector()
  }

  return {
    containerSearchQuery,
    containerFilter,
    selectedContainerId,
    filteredContainers,
    runningCount,
    stoppedCount,
    getStateLabel,
    getStateClass,
    formatCreated,
    selectContainer,
    refreshContainers,
    reset
  }
}
