import { defineStore, storeToRefs } from 'pinia'
import type {
  SandboxCreationType,
  ComposeOptions,
  ComposeResult,
  CreateSandboxRequest,
  CreateSandboxResult
} from '@shared/types/sandbox'
import { useNotification } from '@renderer/composables/useNotification'
import { useContainerStore } from './containerStore'
import { useSandboxListStore } from './sandboxListStore'
import { useSandboxOperationStore } from './sandboxOperationStore'

export const useSandboxStore = defineStore('sandbox', () => {
  const containerStore = useContainerStore()
  const listStore = useSandboxListStore()
  const operationStore = useSandboxOperationStore()
  const notify = useNotification()

  const {
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
    sandboxCount
  } = storeToRefs(listStore)

  const { deleteConfirmState } = storeToRefs(operationStore)

  async function createSandbox(request: CreateSandboxRequest): Promise<CreateSandboxResult | null> {
    try {
      const result = await window.api.sandbox.createSandbox(request)

      if (result.success && result.sandbox) {
        currentSandbox.value = result.sandbox
        operationLogs.value = []

        await listStore.refreshSandboxList()

        window.api.logger.info('[SandboxStore] 创建沙箱成功', {
          sandboxId: result.sandbox.sandboxId,
          name: result.sandbox.name,
          creationType: request.creationType
        })
      } else if (result.error) {
        notify.error('创建失败', result.error, { source: 'sandbox' })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 创建沙箱失败', {
        error: errorMessage,
        creationType: request.creationType
      })
      notify.error('创建失败', errorMessage, { source: 'sandbox' })
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
        await listStore.refreshSandboxList()

        window.api.logger.debug('[SandboxStore] 保存沙箱成功', {
          sandboxId: currentSandbox.value.sandboxId
        })
      } else if (result.error) {
        notify.error('保存失败', result.error, { source: 'sandbox' })
      }

      return result.success
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 保存沙箱失败', {
        error: errorMessage
      })
      notify.error('保存失败', errorMessage, { source: 'sandbox' })
      return false
    }
  }

  async function deleteSandbox(sandboxId: string): Promise<boolean> {
    return operationStore.deleteSandboxById(sandboxId)
  }

  async function retryFrontendInitialization(sandboxId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.retryFrontendInitialization(sandboxId)

      await listStore.refreshSandboxList()
      if (currentSandbox.value?.sandboxId === sandboxId) {
        await listStore.loadSandbox(sandboxId, true)
      }

      notify.success(
        result.previewReady ? '前端恢复成功' : '前端初始化已重试',
        result.message ||
          (result.previewReady ? `预览地址: ${result.previewUrl}` : '可继续查看日志排查'),
        { source: 'sandbox' }
      )

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 重试前端初始化失败', {
        error: errorMessage,
        sandboxId
      })
      notify.error('重试失败', errorMessage, { source: 'sandbox' })
      return false
    }
  }

  async function rebuildFrontendRuntime(sandboxId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.rebuildFrontendRuntime(sandboxId)

      await listStore.refreshSandboxList()
      if (currentSandbox.value?.sandboxId === sandboxId) {
        await listStore.loadSandbox(sandboxId, true)
      }

      notify.success(
        result.previewReady ? '运行容器已重建' : '运行容器已重建，但服务仍未就绪',
        result.message || `工作区已复用，预览地址: ${result.previewUrl}`,
        { source: 'sandbox' }
      )

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 重建前端运行容器失败', {
        error: errorMessage,
        sandboxId
      })
      notify.error('重建失败', errorMessage, { source: 'sandbox' })
      return false
    }
  }

  async function validateFrontendBuild(
    sandboxId: string,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    try {
      const result = await window.api.sandbox.validateFrontendBuild(sandboxId)

      await listStore.refreshSandboxList()
      if (currentSandbox.value?.sandboxId === sandboxId) {
        await listStore.loadSandbox(sandboxId, true)
      }

      if (!options?.silent) {
        notify.success('构建校验通过', result.message || '当前前端工作区已通过 Bun 构建校验', {
          source: 'sandbox'
        })
      }

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 前端构建校验失败', {
        error: errorMessage,
        sandboxId
      })
      if (!options?.silent) {
        notify.error('构建校验失败', errorMessage, { source: 'sandbox' })
      }
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

        await listStore.refreshSandboxList()
        await listStore.loadOperationLogs(sandboxId)
        return true
      }

      if (result.error) {
        notify.error('重命名失败', result.error, { source: 'sandbox' })
      }

      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 重命名沙箱失败', {
        error: errorMessage,
        sandboxId
      })
      notify.error('重命名失败', errorMessage, { source: 'sandbox' })
      return false
    }
  }

  async function createFromTemplate(
    templateId: string,
    variables?: Record<string, string>
  ): Promise<ComposeResult | null> {
    try {
      const result = await window.api.sandbox.createFromTemplate(templateId, variables)

      if (result.success) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxStore] 从模板创建沙箱成功', {
          templateId,
          containerCount: result.containerIds.length
        })
      } else if (result.error) {
        notify.error('模板创建失败', result.error, {
          source: 'sandbox',
          dedupeKey: 'template-create'
        })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 从模板创建沙箱失败', {
        error: errorMessage,
        templateId
      })
      notify.error('模板创建失败', errorMessage, {
        source: 'sandbox',
        dedupeKey: 'template-create'
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

      if (result.success) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxStore] 从 Compose 创建沙箱成功', {
          projectName: options?.projectName,
          containerCount: result.containerIds.length
        })
      } else if (result.error) {
        notify.error('Compose 创建失败', result.error, {
          source: 'sandbox',
          dedupeKey: 'compose-create'
        })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 从 Compose 创建沙箱失败', {
        error: errorMessage
      })
      notify.error('Compose 创建失败', errorMessage, {
        source: 'sandbox',
        dedupeKey: 'compose-create'
      })
      return null
    }
  }

  async function createFromDockerfile(
    dockerfile: string,
    context: string,
    sandboxId?: string,
    sandboxName?: string
  ): Promise<string | null> {
    try {
      const result = await window.api.sandbox.createFromDockerfile(
        dockerfile,
        context,
        sandboxId,
        sandboxName
      )

      if (result.success && result.containerId) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxStore] 从 Dockerfile 创建沙箱成功', {
          containerId: result.containerId.substring(0, 12)
        })
        return result.containerId
      }

      notify.error('Dockerfile 创建失败', result.error || '未知错误', {
        source: 'sandbox',
        dedupeKey: 'dockerfile-create'
      })
      return null
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 从 Dockerfile 创建沙箱失败', {
        error: errorMessage
      })
      notify.error('Dockerfile 创建失败', errorMessage, {
        source: 'sandbox',
        dedupeKey: 'dockerfile-create'
      })
      return null
    }
  }

  async function handleSelectSandbox(sandboxId: string): Promise<void> {
    await listStore.loadSandbox(sandboxId)
  }

  async function handleNewSandbox(): Promise<void> {
    const request: CreateSandboxRequest = {
      name: '新沙箱',
      creationType: 'existing'
    }
    await createSandbox(request)
  }

  async function handleDeleteSandbox(sandboxId: string): Promise<void> {
    const sandbox = sandboxList.value.find((item) => item.sandboxId === sandboxId)
    await operationStore.showDeleteConfirm(
      sandboxId,
      sandbox?.name || '沙箱',
      (sandbox?.creationType || 'existing') as SandboxCreationType,
      sandbox?.containerCount || 0
    )
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
    deleteConfirmState,
    currentSandboxId,
    sandboxCount,
    loadSandboxList: listStore.loadSandboxList,
    refreshSandboxList: listStore.refreshSandboxList,
    loadSandbox: listStore.loadSandbox,
    loadOperationLogs: listStore.loadOperationLogs,
    createSandbox,
    saveCurrentSandbox,
    deleteSandbox,
    retryFrontendInitialization,
    rebuildFrontendRuntime,
    validateFrontendBuild,
    renameSandbox,
    showDeleteConfirm: operationStore.showDeleteConfirm,
    hideDeleteConfirm: operationStore.hideDeleteConfirm,
    deleteSandboxWithConfirm: operationStore.deleteSandboxWithConfirm,
    confirmDelete: operationStore.confirmDelete,
    checkContainerStatus: listStore.checkContainerStatus,
    checkAllContainerStatus: listStore.checkAllContainerStatus,
    cleanupOrphanSandbox: operationStore.cleanupOrphanSandbox,
    recoverOrphanSandbox: operationStore.recoverOrphanSandbox,
    loadTemplates: listStore.loadTemplates,
    createFromTemplate,
    createFromCompose,
    createFromDockerfile,
    selectSandboxForSession: listStore.selectSandboxForSession,
    deselectSandbox: listStore.deselectSandbox,
    getSessionSandbox: listStore.getSessionSandbox,
    handleSelectSandbox,
    handleNewSandbox,
    handleDeleteSandbox
  }
})
