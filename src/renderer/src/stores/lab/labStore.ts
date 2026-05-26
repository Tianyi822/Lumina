import { create } from 'zustand'
import type {
  LabCreationType,
  LabData,
  ComposeOptions,
  ComposeResult,
  CreateLabRequest,
  CreateLabResult
} from '@renderer/types/lab'
import type { DeleteLabOptions } from '@shared/types/lab'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import { labApi } from '@renderer/services/labApi'
import { useContainerStore } from './containerStore'
import { useLabListStore } from './labListStore'
import { useLabOperationStore } from './labOperationStore'

interface LabState {
  // Getters (delegate to sub-stores)
  currentLab: () => LabData | null
  labList: () => import('@renderer/types/lab').LabListItem[]
  operationLogs: () => import('@renderer/types/lab').LabLogEntry[]
  isLoading: () => boolean
  listUpdateKey: () => number
  templates: () => import('@renderer/types/lab').LabTemplate[]
  templatesLoading: () => boolean
  currentSessionLab: () => import('@renderer/types/lab').LabSelection | null
  labContainerStatus: () => Record<string, import('@renderer/types/lab').LabContainerStatus>
  currentLabId: () => string | null
  labCount: () => number
  deleteConfirmState: () => import('./labOperationStore').DeleteConfirmState

  // Actions
  createLab: (request: CreateLabRequest) => Promise<CreateLabResult | null>
  saveCurrentLab: () => Promise<boolean>
  deleteLab: (labId: string) => Promise<boolean>
  retryFrontendInitialization: (labId: string) => Promise<boolean>
  rebuildFrontendRuntime: (labId: string) => Promise<boolean>
  validateFrontendBuild: (labId: string, options?: { silent?: boolean }) => Promise<boolean>
  renameLab: (labId: string, newName: string) => Promise<boolean>
  createFromTemplate: (
    templateId: string,
    variables?: Record<string, string>
  ) => Promise<ComposeResult | null>
  createFromCompose: (content: string, options?: ComposeOptions) => Promise<ComposeResult | null>
  createFromDockerfile: (
    dockerfile: string,
    context: string,
    labId?: string,
    labName?: string
  ) => Promise<string | null>
  handleSelectLab: (labId: string) => Promise<void>
  handleNewLab: () => Promise<void>
  handleDeleteLab: (labId: string) => Promise<void>
  connectSsh: (
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
  ) => Promise<boolean>
  disconnectSsh: (labId: string) => Promise<boolean>

  // Delegated actions from sub-stores
  loadLabList: () => Promise<void>
  refreshLabList: () => Promise<void>
  loadLab: (labId: string, force?: boolean, options?: { silent?: boolean }) => Promise<boolean>
  loadLabOperationLogs: (labId: string) => Promise<void>
  loadTemplates: () => Promise<void>
  showDeleteConfirm: (
    labId: string,
    labName: string,
    creationType: LabCreationType,
    containerCount: number,
    metadata?: { status?: import('@renderer/types/lab').LabStatus; isOrphan?: boolean }
  ) => Promise<void>
  hideDeleteConfirm: () => void
  deleteLabWithConfirm: (options?: DeleteLabOptions) => Promise<boolean>
  confirmDelete: (options?: DeleteLabOptions) => Promise<void>
  checkContainerStatus: (
    labId: string
  ) => Promise<import('@renderer/types/lab').LabContainerStatus | null>
  checkAllContainerStatus: () => Promise<void>
  cleanupOrphanLab: (labId: string) => Promise<boolean>
  recoverOrphanLab: (labId: string, newContainerId: string) => Promise<boolean>
  selectLabForSession: (containerId: string, sessionId?: string) => Promise<boolean>
  deselectLab: (containerId: string) => Promise<boolean>
  getSessionLab: (sessionId: string) => Promise<import('@renderer/types/lab').LabSelection | null>
}

export const useLabStore = create<LabState>()(() => ({
  // ==================== Getters (delegate to sub-stores) ====================

  currentLab: () => useLabListStore.getState().currentLab,
  labList: () => useLabListStore.getState().labList,
  operationLogs: () => useLabListStore.getState().operationLogs,
  isLoading: () => useLabListStore.getState().isLoading,
  listUpdateKey: () => useLabListStore.getState().listUpdateKey,
  templates: () => useLabListStore.getState().templates,
  templatesLoading: () => useLabListStore.getState().templatesLoading,
  currentSessionLab: () => useLabListStore.getState().currentSessionLab,
  labContainerStatus: () => useLabListStore.getState().labContainerStatus,
  currentLabId: () => useLabListStore.getState().currentLabId(),
  labCount: () => useLabListStore.getState().labCount(),
  deleteConfirmState: () => useLabOperationStore.getState().deleteConfirmState,

  // ==================== Actions ====================

  createLab: async (request: CreateLabRequest): Promise<CreateLabResult | null> => {
    const listStore = useLabListStore.getState()

    try {
      const result = await labApi.createLab(request)

      if (result.success && result.lab) {
        listStore.clearCurrentLabState()
        // 直接设置 currentLab 而不是 clearCurrentLabState + refreshLabList
        // refreshLabList 会重新加载列表，loadLab 会加载详情
        await listStore.refreshLabList()

        window.api.logger.info('[LabStore] 创建实验室成功', {
          labId: result.lab.labId,
          name: result.lab.name,
          creationType: request.creationType
        })
      } else if (result.error) {
        notifyError('创建失败', result.error, { source: 'lab' })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 创建实验室失败', {
        error: errorMessage,
        creationType: request.creationType
      })
      notifyError('创建失败', errorMessage, { source: 'lab' })
      return null
    }
  },

  saveCurrentLab: async (): Promise<boolean> => {
    const currentLab = useLabListStore.getState().currentLab
    if (!currentLab) {
      return false
    }

    try {
      const result = await labApi.saveLab(currentLab)

      if (result.success) {
        await useLabListStore.getState().refreshLabList()

        window.api.logger.debug('[LabStore] 保存实验室成功', {
          labId: currentLab.labId
        })
      } else if (result.error) {
        notifyError('保存失败', result.error, { source: 'lab' })
      }

      return result.success
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 保存实验室失败', {
        error: errorMessage
      })
      notifyError('保存失败', errorMessage, { source: 'lab' })
      return false
    }
  },

  deleteLab: async (labId: string): Promise<boolean> => {
    return useLabOperationStore.getState().deleteLabById(labId)
  },

  retryFrontendInitialization: async (labId: string): Promise<boolean> => {
    const listStore = useLabListStore.getState()
    try {
      const result = await labApi.retryFrontendInitialization(labId)

      await listStore.refreshLabList()
      if (listStore.currentLab?.labId === labId) {
        await listStore.loadLab(labId, true)
      }

      notifySuccess(
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
      notifyError('重试失败', errorMessage, { source: 'lab' })
      return false
    }
  },

  rebuildFrontendRuntime: async (labId: string): Promise<boolean> => {
    const listStore = useLabListStore.getState()
    try {
      const result = await labApi.rebuildFrontendRuntime(labId)

      await listStore.refreshLabList()
      if (listStore.currentLab?.labId === labId) {
        await listStore.loadLab(labId, true)
      }

      notifySuccess(
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
      notifyError('重建失败', errorMessage, { source: 'lab' })
      return false
    }
  },

  validateFrontendBuild: async (
    labId: string,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    const listStore = useLabListStore.getState()
    try {
      const result = await labApi.validateFrontendBuild(labId)

      await listStore.refreshLabList()
      if (listStore.currentLab?.labId === labId) {
        await listStore.loadLab(labId, true)
      }

      if (!options?.silent) {
        notifySuccess('构建校验通过', result.message || '当前前端工作区已通过 Bun 构建校验', {
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
        notifyError('构建校验失败', errorMessage, { source: 'lab' })
      }
      return false
    }
  },

  renameLab: async (labId: string, newName: string): Promise<boolean> => {
    const listStore = useLabListStore.getState()
    try {
      const result = await labApi.renameLab(labId, newName)

      if (result.success) {
        if (listStore.currentLab?.labId === labId) {
          // Zustand immutable update
          useLabListStore.setState((state) => ({
            currentLab: state.currentLab ? { ...state.currentLab, name: newName } : null
          }))
        }

        await listStore.refreshLabList()
        await listStore.loadLabOperationLogs(labId)
        return true
      }

      if (result.error) {
        notifyError('重命名失败', result.error, { source: 'lab' })
      }

      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 重命名实验室失败', {
        error: errorMessage,
        labId
      })
      notifyError('重命名失败', errorMessage, { source: 'lab' })
      return false
    }
  },

  createFromTemplate: async (
    templateId: string,
    variables?: Record<string, string>
  ): Promise<ComposeResult | null> => {
    try {
      const result = await labApi.createFromTemplate(templateId, variables)

      if (result.success) {
        await useContainerStore.getState().refreshContainers()
        window.api.logger.info('[LabStore] 从模板创建实验室成功', {
          templateId,
          containerCount: result.containerIds.length
        })
      } else if (result.error) {
        notifyError('模板创建失败', result.error, {
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
      notifyError('模板创建失败', errorMessage, {
        source: 'lab',
        dedupeKey: 'template-create'
      })
      return null
    }
  },

  createFromCompose: async (
    content: string,
    options?: ComposeOptions
  ): Promise<ComposeResult | null> => {
    try {
      const result = await labApi.createFromCompose(content, options)

      if (result.success) {
        await useContainerStore.getState().refreshContainers()
        window.api.logger.info('[LabStore] 从 Compose 创建实验室成功', {
          projectName: options?.projectName,
          containerCount: result.containerIds.length
        })
      } else if (result.error) {
        notifyError('Compose 创建失败', result.error, {
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
      notifyError('Compose 创建失败', errorMessage, {
        source: 'lab',
        dedupeKey: 'compose-create'
      })
      return null
    }
  },

  createFromDockerfile: async (
    dockerfile: string,
    context: string,
    labId?: string,
    labName?: string
  ): Promise<string | null> => {
    try {
      const result = await labApi.createFromDockerfile(dockerfile, context, labId, labName)

      if (result.success && result.containerId) {
        await useContainerStore.getState().refreshContainers()
        window.api.logger.info('[LabStore] 从 Dockerfile 创建实验室成功', {
          containerId: result.containerId.substring(0, 12)
        })
        return result.containerId
      }

      notifyError('Dockerfile 创建失败', result.error || '未知错误', {
        source: 'lab',
        dedupeKey: 'dockerfile-create'
      })
      return null
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabStore] 从 Dockerfile 创建实验室失败', {
        error: errorMessage
      })
      notifyError('Dockerfile 创建失败', errorMessage, {
        source: 'lab',
        dedupeKey: 'dockerfile-create'
      })
      return null
    }
  },

  handleSelectLab: async (labId: string): Promise<void> => {
    await useLabListStore.getState().loadLab(labId)
  },

  handleNewLab: async (): Promise<void> => {
    const request: CreateLabRequest = {
      name: '新实验室',
      creationType: 'existing'
    }
    await useLabStore.getState().createLab(request)
  },

  handleDeleteLab: async (labId: string): Promise<void> => {
    const labList = useLabListStore.getState().labList
    const lab = labList.find((item) => item.labId === labId)
    await useLabOperationStore
      .getState()
      .showDeleteConfirm(
        labId,
        lab?.name || '实验室',
        (lab?.creationType || 'existing') as LabCreationType,
        lab?.containerCount || 0,
        {
          status: lab?.status,
          isOrphan: lab?.isOrphan
        }
      )
  },

  connectSsh: async (
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
  ): Promise<boolean> => {
    const { password, ...sshConfig } = config
    const result = await window.api.ssh.connect(
      labId,
      {
        id: '',
        name: '',
        ...sshConfig
      },
      password
    )

    if (result.success) {
      const listStore = useLabListStore.getState()
      await listStore.refreshLabList()
      if (listStore.currentLabId() === labId) {
        await listStore.loadLab(labId, true, { silent: true })
      }
      return true
    }
    notifyError('SSH 连接失败', result.error || '未知错误', { source: 'lab' })
    return false
  },

  disconnectSsh: async (labId: string): Promise<boolean> => {
    const result = await window.api.ssh.disconnect(labId)
    if (result.success) {
      const listStore = useLabListStore.getState()
      await listStore.refreshLabList()
      if (listStore.currentLabId() === labId) {
        await listStore.loadLab(labId, true, { silent: true })
      }
      return true
    }
    notifyError('断开连接失败', result.error || '未知错误', { source: 'lab' })
    return false
  },

  // ==================== Delegated Actions ====================

  loadLabList: async () => {
    await useLabListStore.getState().loadLabList()
  },
  refreshLabList: async () => {
    await useLabListStore.getState().refreshLabList()
  },
  loadLab: async (labId, force?, options?) => {
    return useLabListStore.getState().loadLab(labId, force, options)
  },
  loadLabOperationLogs: async (labId) => {
    await useLabListStore.getState().loadLabOperationLogs(labId)
  },
  loadTemplates: async () => {
    await useLabListStore.getState().loadTemplates()
  },
  showDeleteConfirm: async (labId, labName, creationType, containerCount, metadata?) => {
    await useLabOperationStore
      .getState()
      .showDeleteConfirm(labId, labName, creationType, containerCount, metadata)
  },
  hideDeleteConfirm: () => {
    useLabOperationStore.getState().hideDeleteConfirm()
  },
  deleteLabWithConfirm: async (options?) => {
    return useLabOperationStore.getState().deleteLabWithConfirm(options)
  },
  confirmDelete: async (options?) => {
    await useLabOperationStore.getState().confirmDelete(options)
  },
  checkContainerStatus: async (labId) => {
    return useLabListStore.getState().checkContainerStatus(labId)
  },
  checkAllContainerStatus: async () => {
    await useLabListStore.getState().checkAllContainerStatus()
  },
  cleanupOrphanLab: async (labId) => {
    return useLabOperationStore.getState().cleanupOrphanLab(labId)
  },
  recoverOrphanLab: async (labId, newContainerId) => {
    return useLabOperationStore.getState().recoverOrphanLab(labId, newContainerId)
  },
  selectLabForSession: async (containerId, sessionId?) => {
    return useLabListStore.getState().selectLabForSession(containerId, sessionId)
  },
  deselectLab: async (containerId) => {
    return useLabListStore.getState().deselectLab(containerId)
  },
  getSessionLab: async (sessionId) => {
    return useLabListStore.getState().getSessionLab(sessionId)
  }
}))
