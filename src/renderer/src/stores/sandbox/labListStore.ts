import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  SandboxData,
  SandboxListItem,
  SandboxLogEntry,
  SandboxTemplate,
  SandboxSelection,
  SandboxContainerStatus
} from '@shared/types/sandbox'

export const useSandboxListStore = defineStore('sandboxList', () => {
  const currentSandbox = ref<SandboxData | null>(null)
  const sandboxList = ref<SandboxListItem[]>([])
  const operationLogs = ref<SandboxLogEntry[]>([])
  const isLoading = ref(false)
  const listUpdateKey = ref(0)

  const templates = ref<SandboxTemplate[]>([])
  const templatesLoading = ref(false)
  const currentSessionSandbox = ref<SandboxSelection | null>(null)
  const sandboxContainerStatus = ref<Map<string, SandboxContainerStatus>>(new Map())

  const currentSandboxId = computed(() => currentSandbox.value?.sandboxId)
  const sandboxCount = computed(() => sandboxList.value.length)

  async function loadSandboxList(): Promise<void> {
    try {
      isLoading.value = true
      sandboxList.value = await window.api.sandbox.listSandboxs()

      window.api.logger.info('[SandboxListStore] 实验室列表加载完成', {
        count: sandboxList.value.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxListStore] 加载实验室列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      isLoading.value = false
    }
  }

  async function refreshSandboxList(): Promise<void> {
    await loadSandboxList()
    listUpdateKey.value++
  }

  async function loadSandbox(
    sandboxId: string,
    force: boolean = false,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    if (!force && currentSandbox.value?.sandboxId === sandboxId) {
      return true
    }

    try {
      if (!options?.silent) {
        isLoading.value = true
      }

      const sandbox = await window.api.sandbox.loadSandboxResolved(sandboxId)
      if (!sandbox) {
        return false
      }

      currentSandbox.value = sandbox
      await loadOperationLogs(sandboxId)

      const { useContainerStore } = await import('./containerStore')
      const containerStore = useContainerStore()
      const containerId = sandbox.primaryContainerId || sandbox.containerIds?.[0]
      if (containerId) {
        await containerStore.loadContainerDetails(containerId, {
          silent: options?.silent
        })
      }

      if (!options?.silent) {
        window.api.logger.info('[SandboxListStore] 实验室加载成功', {
          sandboxId,
          name: sandbox.name,
          containerId: containerId || 'none'
        })
      }

      return true
    } catch (error) {
      if (!options?.silent) {
        window.api.logger.error('[SandboxListStore] 加载实验室失败', {
          error: error instanceof Error ? error.message : String(error),
          sandboxId
        })
      }
      return false
    } finally {
      if (!options?.silent) {
        isLoading.value = false
      }
    }
  }

  async function loadOperationLogs(sandboxId: string): Promise<void> {
    try {
      operationLogs.value = await window.api.sandbox.readSandboxLog(sandboxId)
    } catch (error) {
      window.api.logger.error('[SandboxListStore] 加载操作日志失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      operationLogs.value = []
    }
  }

  async function loadTemplates(): Promise<void> {
    try {
      templatesLoading.value = true
      templates.value = await window.api.sandbox.listTemplates()

      window.api.logger.info('[SandboxListStore] 模板列表加载完成', {
        count: templates.value.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxListStore] 加载模板列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      templates.value = []
    } finally {
      templatesLoading.value = false
    }
  }

  async function selectSandboxForSession(
    containerId: string,
    sessionId?: string
  ): Promise<boolean> {
    try {
      const result = await window.api.sandbox.selectSandbox(containerId, sessionId)

      if (result.success) {
        const { useContainerStore } = await import('./containerStore')
        const containerStore = useContainerStore()
        const container = containerStore.containers.find((item) => item.id === containerId)
        if (container) {
          currentSessionSandbox.value = {
            containerId,
            containerName: container.names[0] || containerId.substring(0, 12),
            image: container.image,
            selectedAt: new Date().toISOString(),
            sessionId
          }
        }

        window.api.logger.info('[SandboxListStore] 选择实验室成功', {
          containerId: containerId.substring(0, 12),
          sessionId
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxListStore] 选择实验室失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        sessionId
      })
      return false
    }
  }

  async function deselectSandbox(containerId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.deselectSandbox(containerId)

      if (result.success && currentSessionSandbox.value?.containerId === containerId) {
        currentSessionSandbox.value = null
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxListStore] 取消选择实验室失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  async function getSessionSandbox(sessionId: string): Promise<SandboxSelection | null> {
    try {
      return await window.api.sandbox.getSessionSandbox(sessionId)
    } catch (error) {
      window.api.logger.error('[SandboxListStore] 获取会话实验室失败', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return null
    }
  }

  async function checkContainerStatus(sandboxId: string): Promise<SandboxContainerStatus | null> {
    try {
      const status = await window.api.sandbox.checkContainerStatus(sandboxId)
      if (status) {
        sandboxContainerStatus.value.set(sandboxId, status)
      }
      return status
    } catch (error) {
      window.api.logger.error('[SandboxListStore] 检查容器状态失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return null
    }
  }

  async function checkAllContainerStatus(): Promise<void> {
    try {
      const statuses = await window.api.sandbox.checkAllContainerStatus()
      for (const status of statuses) {
        sandboxContainerStatus.value.set(status.sandboxId, status)
      }

      window.api.logger.info('[SandboxListStore] 批量检查容器状态完成', {
        count: statuses.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxListStore] 批量检查容器状态失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  function clearCurrentSandboxState(): void {
    currentSandbox.value = null
    operationLogs.value = []
  }

  function removeSandboxStatus(sandboxId: string): void {
    sandboxContainerStatus.value.delete(sandboxId)
  }

  return {
    currentSandbox,
    sandboxList,
    operationLogs,
    isLoading,
    listUpdateKey,
    templates,
    templatesLoading,
    currentSessionSandbox,
    sandboxContainerStatus,
    currentSandboxId,
    sandboxCount,
    loadSandboxList,
    refreshSandboxList,
    loadSandbox,
    loadOperationLogs,
    loadTemplates,
    selectSandboxForSession,
    deselectSandbox,
    getSessionSandbox,
    checkContainerStatus,
    checkAllContainerStatus,
    clearCurrentSandboxState,
    removeSandboxStatus
  }
})
