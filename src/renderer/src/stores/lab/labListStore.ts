import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  LabData,
  LabListItem,
  LabLogEntry,
  LabTemplate,
  LabSelection,
  LabContainerStatus
} from '@renderer/types/lab'
import { labApi } from '@renderer/services/labApi'

export const useLabListStore = defineStore('labList', () => {
  const currentLab = ref<LabData | null>(null)
  const labList = ref<LabListItem[]>([])
  const operationLogs = ref<LabLogEntry[]>([])
  const isLoading = ref(false)
  const listUpdateKey = ref(0)
  let loadLabVersion = 0

  const templates = ref<LabTemplate[]>([])
  const templatesLoading = ref(false)
  const currentSessionLab = ref<LabSelection | null>(null)
  const labContainerStatus = ref<Map<string, LabContainerStatus>>(new Map())

  const currentLabId = computed(() => currentLab.value?.labId)
  const labCount = computed(() => labList.value.length)

  async function loadLabList(): Promise<void> {
    try {
      isLoading.value = true
      labList.value = await labApi.listLabs()

      window.api.logger.info('[LabListStore] 实验室列表加载完成', {
        count: labList.value.length
      })
    } catch (error) {
      window.api.logger.error('[LabListStore] 加载实验室列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      isLoading.value = false
    }
  }

  async function refreshLabList(): Promise<void> {
    await loadLabList()
    listUpdateKey.value++
  }

  async function loadLab(
    labId: string,
    force: boolean = false,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    if (!force && currentLab.value?.labId === labId) {
      return true
    }

    const version = ++loadLabVersion

    try {
      if (!options?.silent) {
        isLoading.value = true
      }

      const lab = await labApi.loadLabResolved(labId)
      if (!lab) {
        return false
      }

      if (version !== loadLabVersion) {
        return true
      }

      currentLab.value = lab
      await loadLabOperationLogs(labId)

      const { useContainerStore } = await import('./containerStore')
      const containerStore = useContainerStore()
      const containerId = lab.primaryContainerId || lab.containerIds?.[0]
      if (containerId) {
        await containerStore.loadContainerDetails(containerId, {
          silent: options?.silent
        })
      }

      if (!options?.silent) {
        window.api.logger.info('[LabListStore] 实验室加载成功', {
          labId,
          name: lab.name,
          containerId: containerId || 'none'
        })
      }

      return true
    } catch (error) {
      if (!options?.silent) {
        window.api.logger.error('[LabListStore] 加载实验室失败', {
          error: error instanceof Error ? error.message : String(error),
          labId
        })
      }
      return false
    } finally {
      if (!options?.silent) {
        isLoading.value = false
      }
    }
  }

  async function loadLabOperationLogs(labId: string): Promise<void> {
    try {
      operationLogs.value = await labApi.readLabLog(labId)
    } catch (error) {
      window.api.logger.error('[LabListStore] 加载操作日志失败', {
        error: error instanceof Error ? error.message : String(error),
        labId
      })
      operationLogs.value = []
    }
  }

  async function loadTemplates(): Promise<void> {
    try {
      templatesLoading.value = true
      templates.value = await labApi.listTemplates()

      window.api.logger.info('[LabListStore] 模板列表加载完成', {
        count: templates.value.length
      })
    } catch (error) {
      window.api.logger.error('[LabListStore] 加载模板列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      templates.value = []
    } finally {
      templatesLoading.value = false
    }
  }

  async function selectLabForSession(containerId: string, sessionId?: string): Promise<boolean> {
    try {
      const result = await labApi.selectLab(containerId, sessionId)

      if (result.success) {
        const { useContainerStore } = await import('./containerStore')
        const containerStore = useContainerStore()
        const container = containerStore.containers.find((item) => item.id === containerId)
        if (container) {
          currentSessionLab.value = {
            containerId,
            containerName: container.names[0] || containerId.substring(0, 12),
            image: container.image,
            selectedAt: new Date().toISOString(),
            sessionId
          }
        }

        window.api.logger.info('[LabListStore] 选择实验室成功', {
          containerId: containerId.substring(0, 12),
          sessionId
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[LabListStore] 选择实验室失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        sessionId
      })
      return false
    }
  }

  async function deselectLab(containerId: string): Promise<boolean> {
    try {
      const result = await labApi.deselectLab(containerId)

      if (result.success && currentSessionLab.value?.containerId === containerId) {
        currentSessionLab.value = null
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[LabListStore] 取消选择实验室失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  async function getSessionLab(sessionId: string): Promise<LabSelection | null> {
    try {
      return await labApi.getSessionLab(sessionId)
    } catch (error) {
      window.api.logger.error('[LabListStore] 获取会话实验室失败', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return null
    }
  }

  async function checkContainerStatus(labId: string): Promise<LabContainerStatus | null> {
    try {
      const status = await labApi.checkContainerStatus(labId)
      if (status) {
        labContainerStatus.value.set(labId, status)
      }
      return status
    } catch (error) {
      window.api.logger.error('[LabListStore] 检查容器状态失败', {
        error: error instanceof Error ? error.message : String(error),
        labId
      })
      return null
    }
  }

  async function checkAllContainerStatus(): Promise<void> {
    try {
      const statuses = await labApi.checkAllContainerStatus()
      for (const status of statuses) {
        labContainerStatus.value.set(status.labId, status)
      }

      window.api.logger.info('[LabListStore] 批量检查容器状态完成', {
        count: statuses.length
      })
    } catch (error) {
      window.api.logger.error('[LabListStore] 批量检查容器状态失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  function clearCurrentLabState(): void {
    currentLab.value = null
    operationLogs.value = []
  }

  function removeLabStatus(labId: string): void {
    labContainerStatus.value.delete(labId)
  }

  return {
    currentLab,
    labList,
    operationLogs,
    isLoading,
    listUpdateKey,
    templates,
    templatesLoading,
    currentSessionLab,
    labContainerStatus,
    currentLabId,
    labCount,
    loadLabList,
    refreshLabList,
    loadLab,
    loadLabOperationLogs,
    loadTemplates,
    selectLabForSession,
    deselectLab,
    getSessionLab,
    checkContainerStatus,
    checkAllContainerStatus,
    clearCurrentLabState,
    removeLabStatus
  }
})
