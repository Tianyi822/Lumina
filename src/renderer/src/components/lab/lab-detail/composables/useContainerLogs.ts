/**
 * 容器日志管理 composable
 * 处理容器日志的加载、刷新和导出
 */
import { ref, type Ref } from 'vue'
import { useContainerStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { ContainerInfo } from '@renderer/types/lab'

/** 容器日志 composable 返回值类型 */
export interface UseContainerLogsReturn {
  containerLogs: Ref<string>
  logsLoading: Ref<boolean>
  loadContainerLogs: () => Promise<void>
  handleRefreshLogs: () => Promise<void>
  handleExportLogs: () => void
}

export function useContainerLogs(selectedContainer: {
  value: ContainerInfo | null
}): UseContainerLogsReturn {
  const containerStore = useContainerStore()
  const notify = useNotification()

  // 状态
  const containerLogs = ref('')
  const logsLoading = ref(false)

  /**
   * 加载容器日志
   */
  async function loadContainerLogs(): Promise<void> {
    if (!selectedContainer.value) return
    logsLoading.value = true
    try {
      containerLogs.value = await containerStore.getContainerLogs(selectedContainer.value.id, {
        tail: 500
      })
    } finally {
      logsLoading.value = false
    }
  }

  /**
   * 刷新容器日志
   */
  async function handleRefreshLogs(): Promise<void> {
    await loadContainerLogs()
  }

  /**
   * 导出日志到文件
   */
  function handleExportLogs(): void {
    try {
      const blob = new Blob([containerLogs.value], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const containerName = selectedContainer.value?.names[0]?.replace(/^\//, '') || 'container'
      a.download = `${containerName}-logs.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      notify.error('导出日志失败', error instanceof Error ? error.message : String(error), {
        source: 'lab',
        dedupeKey: 'container-logs'
      })
    }
  }

  return {
    containerLogs,
    logsLoading,
    loadContainerLogs,
    handleRefreshLogs,
    handleExportLogs
  }
}
