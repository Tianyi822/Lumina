/**
 * 容器操作 composable
 * 处理容器的启动、停止、重启、删除等操作
 */
import { useNotification } from '@renderer/composables/useNotification'
import { useContainerStore, useSandboxStore } from '@renderer/stores'
import type { SandboxData } from '@shared/types/sandbox'

/** 容器操作 composable 返回值类型 */
export interface UseContainerActionsReturn {
  handleContainerStart: () => Promise<void>
  handleContainerStop: () => Promise<void>
  handleContainerRestart: () => Promise<void>
  handleContainerRemove: () => Promise<void>
  handleRefreshStats: () => Promise<void>
  handleExecuteCommand: (command: string) => Promise<void>
  handleClearTerminal: () => void
  refreshSandboxStatus: () => Promise<void>
  handleRefreshStatus: () => Promise<void>
}

export function useContainerActions(
  currentSandbox: { value: SandboxData | null },
  selectedContainer: { value: { id: string } | null }
): UseContainerActionsReturn {
  const containerStore = useContainerStore()
  const sandboxStore = useSandboxStore()
  const notify = useNotification()

  /**
   * 启动容器
   */
  async function handleContainerStart(): Promise<void> {
    // 如果是 Compose 类型沙箱，使用 composeStart 启动所有容器
    if (
      currentSandbox.value?.creationType === 'compose' &&
      currentSandbox.value.composeProjectName
    ) {
      const result = await containerStore.composeStart(currentSandbox.value.composeProjectName)
      if (!result.success && result.error) {
        notify.error('启动 Compose 项目失败', result.error, {
          source: 'sandbox',
          dedupeKey: 'container-action'
        })
      } else if (result.success) {
        await refreshSandboxStatus()
      }
      return
    }

    if (selectedContainer.value) {
      const result = await containerStore.startContainer(selectedContainer.value.id)
      if (!result.success && result.error) {
        notify.error('启动容器失败', result.error, {
          source: 'sandbox',
          dedupeKey: 'container-action'
        })
      } else if (result.success) {
        await refreshSandboxStatus()
      }
    }
  }

  /**
   * 停止容器
   */
  async function handleContainerStop(): Promise<void> {
    // 如果是 Compose 类型沙箱，使用 composeStop 停止所有容器
    if (
      currentSandbox.value?.creationType === 'compose' &&
      currentSandbox.value.composeProjectName
    ) {
      const result = await containerStore.composeStop(currentSandbox.value.composeProjectName)
      if (!result.success && result.error) {
        notify.error('停止 Compose 项目失败', result.error, {
          source: 'sandbox',
          dedupeKey: 'container-action'
        })
      } else if (
        result.success &&
        result.stoppedContainerIds &&
        result.stoppedContainerIds.length > 0
      ) {
        notify.success('停止成功', `已停止 ${result.stoppedContainerIds.length} 个容器`, {
          source: 'sandbox'
        })
        await refreshSandboxStatus()
      } else if (result.success) {
        await refreshSandboxStatus()
      }
      return
    }

    if (selectedContainer.value) {
      const result = await containerStore.stopContainer(selectedContainer.value.id)
      if (!result.success && result.error) {
        notify.error('停止容器失败', result.error, {
          source: 'sandbox',
          dedupeKey: 'container-action'
        })
      } else if (result.success) {
        await refreshSandboxStatus()
      }
    }
  }

  /**
   * 重启容器
   */
  async function handleContainerRestart(): Promise<void> {
    // 如果是 Compose 类型沙箱，使用 composeRestart 重启所有容器
    if (
      currentSandbox.value?.creationType === 'compose' &&
      currentSandbox.value.composeProjectName
    ) {
      const result = await containerStore.composeRestart(currentSandbox.value.composeProjectName)
      if (!result.success && result.error) {
        notify.error('重启 Compose 项目失败', result.error, {
          source: 'sandbox',
          dedupeKey: 'container-action'
        })
      } else if (result.success) {
        await refreshSandboxStatus()
      }
      return
    }

    if (selectedContainer.value) {
      const result = await containerStore.restartContainer(selectedContainer.value.id)
      if (!result.success && result.error) {
        notify.error('重启容器失败', result.error, {
          source: 'sandbox',
          dedupeKey: 'container-action'
        })
      } else if (result.success) {
        await refreshSandboxStatus()
      }
    }
  }

  /**
   * 删除容器
   */
  async function handleContainerRemove(): Promise<void> {
    if (selectedContainer.value) {
      const result = await containerStore.removeContainer(selectedContainer.value.id)
      if (!result.success && result.error) {
        notify.error('删除容器失败', result.error, {
          source: 'sandbox',
          dedupeKey: 'container-action'
        })
      }
    }
  }

  /**
   * 刷新监控数据
   */
  async function handleRefreshStats(): Promise<void> {
    if (selectedContainer.value) {
      await containerStore.loadContainerStats(selectedContainer.value.id)
    }
  }

  /**
   * 执行命令
   */
  async function handleExecuteCommand(command: string): Promise<void> {
    if (!selectedContainer.value) return
    await containerStore.execCommand(selectedContainer.value.id, { command })
  }

  /**
   * 清空终端日志
   */
  function handleClearTerminal(): void {
    containerStore.clearTerminalLogs()
  }

  /**
   * 刷新沙箱状态
   */
  async function refreshSandboxStatus(): Promise<void> {
    if (!currentSandbox.value) return
    await sandboxStore.checkContainerStatus(currentSandbox.value.sandboxId)
    await sandboxStore.refreshSandboxList()
    await sandboxStore.loadSandbox(currentSandbox.value.sandboxId, true)
  }

  /**
   * 刷新当前沙箱状态（包括容器列表和详情）
   */
  async function handleRefreshStatus(): Promise<void> {
    if (!currentSandbox.value) return

    // 刷新容器列表
    await containerStore.loadContainers()

    // 重新加载当前容器的详情
    const containerId =
      currentSandbox.value.primaryContainerId || currentSandbox.value.containerIds?.[0]
    if (containerId) {
      await containerStore.loadContainerDetails(containerId)
    }

    // 同时刷新沙箱列表以保持同步
    await sandboxStore.refreshSandboxList()
    await sandboxStore.loadSandbox(currentSandbox.value.sandboxId, true)
  }

  return {
    handleContainerStart,
    handleContainerStop,
    handleContainerRestart,
    handleContainerRemove,
    handleRefreshStats,
    handleExecuteCommand,
    handleClearTerminal,
    refreshSandboxStatus,
    handleRefreshStatus
  }
}
