import { defineStore, storeToRefs } from 'pinia'
import type {
  LabCreationType,
  ComposeOptions,
  ComposeResult,
  CreateLabRequest,
  CreateLabResult
} from '@renderer/types/lab'
import { useNotification } from '@renderer/composables/useNotification'
import { labApi } from '@renderer/services/labApi'
import { useContainerStore } from './containerStore'
import { useLabListStore } from './labListStore'
import { useLabOperationStore } from './labOperationStore'

export const useLabStore = defineStore('lab', () => {
  const containerStore = useContainerStore()
  const listStore = useLabListStore()
  const operationStore = useLabOperationStore()
  const notify = useNotification()

  const {
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
    labCount
  } = storeToRefs(listStore)

  const { deleteConfirmState } = storeToRefs(operationStore)

  async function createLab(request: CreateLabRequest): Promise<CreateLabResult | null> {
    try {
      const result = await labApi.createLab(request)

      if (result.success && result.lab) {
        currentLab.value = result.lab
        operationLogs.value = []

        await listStore.refreshLabList()

        window.api.logger.info('[LabStore] 创建实验室成功', {
          labId: result.lab.labId,
          name: result.lab.name,
          creationType: request.creationType
        })
      } else if (result.error) {
        notify.error('创建失败', result.error, { source: 'lab' })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 创建实验室失败', {
        error: errorMessage,
        creationType: request.creationType
      })
      notify.error('创建失败', errorMessage, { source: 'lab' })
      return null
    }
  }

  async function saveCurrentLab(): Promise<boolean> {
    if (!currentLab.value) {
      return false
    }

    try {
      const result = await labApi.saveLab(currentLab.value)

      if (result.success) {
        await listStore.refreshLabList()

        window.api.logger.debug('[LabStore] 保存实验室成功', {
          labId: currentLab.value.labId
        })
      } else if (result.error) {
        notify.error('保存失败', result.error, { source: 'lab' })
      }

      return result.success
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 保存实验室失败', {
        error: errorMessage
      })
      notify.error('保存失败', errorMessage, { source: 'lab' })
      return false
    }
  }

  async function deleteLab(labId: string): Promise<boolean> {
    return operationStore.deleteLabById(labId)
  }

  async function retryFrontendInitialization(labId: string): Promise<boolean> {
    try {
      const result = await labApi.retryFrontendInitialization(labId)

      await listStore.refreshLabList()
      if (currentLab.value?.labId === labId) {
        await listStore.loadLab(labId, true)
      }

      notify.success(
        result.previewReady ? '前端恢复成功' : '前端初始化已重试',
        result.message ||
          (result.previewReady ? `预览地址: ${result.previewUrl}` : '可继续查看日志排查'),
        { source: 'lab' }
      )

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 重试前端初始化失败', {
        error: errorMessage,
        labId
      })
      notify.error('重试失败', errorMessage, { source: 'lab' })
      return false
    }
  }

  async function rebuildFrontendRuntime(labId: string): Promise<boolean> {
    try {
      const result = await labApi.rebuildFrontendRuntime(labId)

      await listStore.refreshLabList()
      if (currentLab.value?.labId === labId) {
        await listStore.loadLab(labId, true)
      }

      notify.success(
        result.previewReady ? '运行容器已重建' : '运行容器已重建，但服务仍未就绪',
        result.message || `工作区已复用，预览地址: ${result.previewUrl}`,
        { source: 'lab' }
      )

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 重建前端运行容器失败', {
        error: errorMessage,
        labId
      })
      notify.error('重建失败', errorMessage, { source: 'lab' })
      return false
    }
  }

  async function validateFrontendBuild(
    labId: string,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    try {
      const result = await labApi.validateFrontendBuild(labId)

      await listStore.refreshLabList()
      if (currentLab.value?.labId === labId) {
        await listStore.loadLab(labId, true)
      }

      if (!options?.silent) {
        notify.success('构建校验通过', result.message || '当前前端工作区已通过 Bun 构建校验', {
          source: 'lab'
        })
      }

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 前端构建校验失败', {
        error: errorMessage,
        labId
      })
      if (!options?.silent) {
        notify.error('构建校验失败', errorMessage, { source: 'lab' })
      }
      return false
    }
  }

  async function renameLab(labId: string, newName: string): Promise<boolean> {
    try {
      const result = await labApi.renameLab(labId, newName)

      if (result.success) {
        if (currentLab.value?.labId === labId) {
          currentLab.value.name = newName
        }

        await listStore.refreshLabList()
        await listStore.loadLabOperationLogs(labId)
        return true
      }

      if (result.error) {
        notify.error('重命名失败', result.error, { source: 'lab' })
      }

      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 重命名实验室失败', {
        error: errorMessage,
        labId
      })
      notify.error('重命名失败', errorMessage, { source: 'lab' })
      return false
    }
  }

  async function createFromTemplate(
    templateId: string,
    variables?: Record<string, string>
  ): Promise<ComposeResult | null> {
    try {
      const result = await labApi.createFromTemplate(templateId, variables)

      if (result.success) {
        await containerStore.refreshContainers()
        window.api.logger.info('[LabStore] 从模板创建实验室成功', {
          templateId,
          containerCount: result.containerIds.length
        })
      } else if (result.error) {
        notify.error('模板创建失败', result.error, {
          source: 'lab',
          dedupeKey: 'template-create'
        })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 从模板创建实验室失败', {
        error: errorMessage,
        templateId
      })
      notify.error('模板创建失败', errorMessage, {
        source: 'lab',
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
      const result = await labApi.createFromCompose(content, options)

      if (result.success) {
        await containerStore.refreshContainers()
        window.api.logger.info('[LabStore] 从 Compose 创建实验室成功', {
          projectName: options?.projectName,
          containerCount: result.containerIds.length
        })
      } else if (result.error) {
        notify.error('Compose 创建失败', result.error, {
          source: 'lab',
          dedupeKey: 'compose-create'
        })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 从 Compose 创建实验室失败', {
        error: errorMessage
      })
      notify.error('Compose 创建失败', errorMessage, {
        source: 'lab',
        dedupeKey: 'compose-create'
      })
      return null
    }
  }

  async function createFromDockerfile(
    dockerfile: string,
    context: string,
    labId?: string,
    labName?: string
  ): Promise<string | null> {
    try {
      const result = await labApi.createFromDockerfile(dockerfile, context, labId, labName)

      if (result.success && result.containerId) {
        await containerStore.refreshContainers()
        window.api.logger.info('[LabStore] 从 Dockerfile 创建实验室成功', {
          containerId: result.containerId.substring(0, 12)
        })
        return result.containerId
      }

      notify.error('Dockerfile 创建失败', result.error || '未知错误', {
        source: 'lab',
        dedupeKey: 'dockerfile-create'
      })
      return null
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 从 Dockerfile 创建实验室失败', {
        error: errorMessage
      })
      notify.error('Dockerfile 创建失败', errorMessage, {
        source: 'lab',
        dedupeKey: 'dockerfile-create'
      })
      return null
    }
  }

  async function handleSelectLab(labId: string): Promise<void> {
    await listStore.loadLab(labId)
  }

  async function handleNewLab(): Promise<void> {
    const request: CreateLabRequest = {
      name: '新实验室',
      creationType: 'existing'
    }
    await createLab(request)
  }

  async function handleDeleteLab(labId: string): Promise<void> {
    const lab = labList.value.find((item) => item.labId === labId)
    await operationStore.showDeleteConfirm(
      labId,
      lab?.name || '实验室',
      (lab?.creationType || 'existing') as LabCreationType,
      lab?.containerCount || 0
    )
  }

  async function connectSsh(
    labId: string,
    config: {
      host: string
      port: number
      username: string
      authType: 'password' | 'key'
      password?: string
      keyName?: string
      keyContent?: string
    }
  ): Promise<boolean> {
    const result = await window.api.ssh.connect(labId, {
      id: '',
      name: '',
      ...config
    })

    if (result.success) {
      await listStore.refreshLabList()
      return true
    }
    notify.error('SSH 连接失败', result.error || '未知错误', { source: 'lab' })
    return false
  }

  async function disconnectSsh(labId: string): Promise<boolean> {
    const result = await window.api.ssh.disconnect(labId)
    if (result.success) {
      await listStore.refreshLabList()
      return true
    }
    notify.error('断开连接失败', result.error || '未知错误', { source: 'lab' })
    return false
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
    deleteConfirmState,
    currentLabId,
    labCount,
    loadLabList: listStore.loadLabList,
    refreshLabList: listStore.refreshLabList,
    loadLab: listStore.loadLab,
    loadLabOperationLogs: listStore.loadLabOperationLogs,
    createLab,
    saveCurrentLab,
    deleteLab,
    retryFrontendInitialization,
    rebuildFrontendRuntime,
    validateFrontendBuild,
    renameLab,
    showDeleteConfirm: operationStore.showDeleteConfirm,
    hideDeleteConfirm: operationStore.hideDeleteConfirm,
    deleteLabWithConfirm: operationStore.deleteLabWithConfirm,
    confirmDelete: operationStore.confirmDelete,
    checkContainerStatus: listStore.checkContainerStatus,
    checkAllContainerStatus: listStore.checkAllContainerStatus,
    cleanupOrphanLab: operationStore.cleanupOrphanLab,
    recoverOrphanLab: operationStore.recoverOrphanLab,
    loadTemplates: listStore.loadTemplates,
    createFromTemplate,
    createFromCompose,
    createFromDockerfile,
    selectLabForSession: listStore.selectLabForSession,
    deselectLab: listStore.deselectLab,
    getSessionLab: listStore.getSessionLab,
    handleSelectLab,
    handleNewLab,
    handleDeleteLab,
    connectSsh,
    disconnectSsh
  }
})
