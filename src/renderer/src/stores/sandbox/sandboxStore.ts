import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  SandboxData,
  SandboxListItem,
  SandboxLogEntry,
  SandboxTemplate,
  SandboxSelection,
  ComposeOptions,
  ComposeResult
} from '@shared/types/sandbox'
import { useContainerStore } from './containerStore'

const DEFAULT_NEW_SANDBOX_NAME = '新沙箱'

export const useSandboxStore = defineStore('sandbox', () => {
  // ==================== Store Dependencies ====================

  const containerStore = useContainerStore()

  // ==================== State ====================

  const currentSandbox = ref<SandboxData | null>(null)
  const sandboxList = ref<SandboxListItem[]>([])
  const operationLogs = ref<SandboxLogEntry[]>([])
  const isLoading = ref(false)
  const listUpdateKey = ref(0)

  /** 沙箱模板列表 */
  const templates = ref<SandboxTemplate[]>([])
  /** 模板加载状态 */
  const templatesLoading = ref(false)

  /** 当前会话的沙箱选择 */
  const currentSessionSandbox = ref<SandboxSelection | null>(null)

  // ==================== Getters ====================

  const currentSandboxId = computed(() => currentSandbox.value?.sandboxId)
  const sandboxCount = computed(() => sandboxList.value.length)

  // ==================== Actions: 沙箱列表 ====================

  async function loadSandboxList(): Promise<void> {
    try {
      isLoading.value = true
      sandboxList.value = await window.api.sandbox.listSandboxs()

      window.api.logger.info('[SandboxStore] 沙箱列表加载完成', {
        count: sandboxList.value.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载沙箱列表失败', {
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

  async function loadSandbox(sandboxId: string): Promise<boolean> {
    if (currentSandbox.value?.sandboxId === sandboxId) {
      return true
    }

    try {
      isLoading.value = true

      const sandbox = await window.api.sandbox.loadSandbox(sandboxId)
      if (sandbox) {
        currentSandbox.value = sandbox
        await loadOperationLogs(sandboxId)

        window.api.logger.info('[SandboxStore] 沙箱加载成功', {
          sandboxId,
          name: sandbox.name
        })

        return true
      }

      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function loadOperationLogs(sandboxId: string): Promise<void> {
    try {
      operationLogs.value = await window.api.sandbox.readSandboxLog(sandboxId)
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载操作日志失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      operationLogs.value = []
    }
  }

  // ==================== Actions: 沙箱 CRUD ====================

  async function createSandbox(name?: string): Promise<SandboxData | null> {
    try {
      const sandbox = await window.api.sandbox.createSandbox(name || DEFAULT_NEW_SANDBOX_NAME)

      currentSandbox.value = sandbox
      operationLogs.value = []

      await refreshSandboxList()

      window.api.logger.info('[SandboxStore] 创建沙箱成功', {
        sandboxId: sandbox.sandboxId,
        name: sandbox.name
      })

      return sandbox
    } catch (error) {
      window.api.logger.error('[SandboxStore] 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  async function saveCurrentSandbox(): Promise<boolean> {
    if (!currentSandbox.value) {
      return false
    }

    try {
      const result = await window.api.sandbox.saveSandbox(currentSandbox.value)

      if (result.success) {
        await refreshSandboxList()

        window.api.logger.debug('[SandboxStore] 保存沙箱成功', {
          sandboxId: currentSandbox.value.sandboxId
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 保存沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return false
    }
  }

  async function deleteSandbox(sandboxId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.deleteSandbox(sandboxId)

      if (result.success) {
        if (currentSandbox.value?.sandboxId === sandboxId) {
          currentSandbox.value = null
          operationLogs.value = []
        }

        await refreshSandboxList()

        window.api.logger.info('[SandboxStore] 删除沙箱成功', { sandboxId })
        return true
      }

      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 删除沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return false
    }
  }

  async function renameSandbox(sandboxId: string, newName: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.renameSandbox(sandboxId, newName)

      if (result.success) {
        if (currentSandbox.value?.sandboxId === sandboxId) {
          currentSandbox.value.name = newName
        }

        await refreshSandboxList()
        await loadOperationLogs(sandboxId)

        return true
      }

      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 重命名沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return false
    }
  }

  // ==================== Actions: 模板 ====================

  async function loadTemplates(): Promise<void> {
    try {
      templatesLoading.value = true
      templates.value = await window.api.sandbox.listTemplates()

      window.api.logger.info('[SandboxStore] 模板列表加载完成', {
        count: templates.value.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载模板列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      templates.value = []
    } finally {
      templatesLoading.value = false
    }
  }

  async function createFromTemplate(
    templateId: string,
    variables?: Record<string, string>
  ): Promise<ComposeResult | null> {
    try {
      const result = await window.api.sandbox.createFromTemplate(templateId, variables)

      if (!result.error) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxStore] 从模板创建沙箱成功', {
          templateId,
          containerCount: result.containerIds.length
        })
      }

      return result
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从模板创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        templateId
      })
      return null
    }
  }

  async function createFromCompose(
    content: string,
    options?: ComposeOptions
  ): Promise<ComposeResult | null> {
    try {
      const result = await window.api.sandbox.createFromCompose(content, options)

      if (!result.error) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxStore] 从 Compose 创建沙箱成功', {
          projectName: options?.projectName,
          containerCount: result.containerIds.length
        })
      }

      return result
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从 Compose 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  async function createFromDockerfile(dockerfile: string, context: string): Promise<string | null> {
    try {
      const containerId = await window.api.sandbox.createFromDockerfile(dockerfile, context)

      if (containerId) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxStore] 从 Dockerfile 创建沙箱成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return containerId
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从 Dockerfile 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  // ==================== Actions: 会话关联 ====================

  async function selectSandboxForSession(
    containerId: string,
    sessionId?: string
  ): Promise<boolean> {
    try {
      const result = await window.api.sandbox.selectSandbox(containerId, sessionId)

      if (result.success) {
        const container = containerStore.containers.find((c) => c.id === containerId)
        if (container) {
          currentSessionSandbox.value = {
            containerId,
            containerName: container.names[0] || containerId.substring(0, 12),
            image: container.image,
            selectedAt: new Date().toISOString(),
            sessionId
          }
        }

        window.api.logger.info('[SandboxStore] 选择沙箱成功', {
          containerId: containerId.substring(0, 12),
          sessionId
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 选择沙箱失败', {
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
      window.api.logger.error('[SandboxStore] 取消选择沙箱失败', {
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
      window.api.logger.error('[SandboxStore] 获取会话沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return null
    }
  }

  // ==================== Actions: 事件处理 ====================

  async function handleSelectSandbox(sandboxId: string): Promise<void> {
    await loadSandbox(sandboxId)
  }

  async function handleNewSandbox(): Promise<void> {
    await createSandbox()
  }

  async function handleDeleteSandbox(sandboxId: string): Promise<void> {
    await deleteSandbox(sandboxId)
  }

  return {
    // State
    currentSandbox,
    sandboxList,
    operationLogs,
    isLoading,
    listUpdateKey,
    templates,
    templatesLoading,
    currentSessionSandbox,

    // Getters
    currentSandboxId,
    sandboxCount,

    // Actions: 沙箱列表
    loadSandboxList,
    refreshSandboxList,
    loadSandbox,
    loadOperationLogs,

    // Actions: 沙箱 CRUD
    createSandbox,
    saveCurrentSandbox,
    deleteSandbox,
    renameSandbox,

    // Actions: 模板
    loadTemplates,
    createFromTemplate,
    createFromCompose,
    createFromDockerfile,

    // Actions: 会话关联
    selectSandboxForSession,
    deselectSandbox,
    getSessionSandbox,

    // Actions: 事件处理
    handleSelectSandbox,
    handleNewSandbox,
    handleDeleteSandbox
  }
})
