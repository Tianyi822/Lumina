import { create } from 'zustand'
import type { LabCreationType, LabData, CreateLabRequest, CreateLabResult } from '@renderer/types/lab'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import { labApi } from '@renderer/services/labApi'
import { useLabListStore } from './labListStore'
import { useLabOperationStore } from './labOperationStore'

interface LabState {
  // Getters (delegate to sub-stores)
  currentLab: () => LabData | null
  labList: () => import('@renderer/types/lab').LabListItem[]
  operationLogs: () => import('@renderer/types/lab').LabLogEntry[]
  isLoading: () => boolean
  listUpdateKey: () => number
  currentLabId: () => string | null
  labCount: () => number
  deleteConfirmState: () => import('./labOperationStore').DeleteConfirmState

  // Actions
  createLab: (request: CreateLabRequest) => Promise<CreateLabResult | null>
  saveCurrentLab: () => Promise<boolean>
  deleteLab: (labId: string) => Promise<boolean>
  renameLab: (labId: string, newName: string) => Promise<boolean>
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
  showDeleteConfirm: (
    labId: string,
    labName: string,
    creationType: LabCreationType,
    metadata?: { status?: import('@renderer/types/lab').LabStatus }
  ) => Promise<void>
  hideDeleteConfirm: () => void
  deleteLabWithConfirm: () => Promise<boolean>
  confirmDelete: () => Promise<void>
}

export const useLabStore = create<LabState>()(() => ({
  // ==================== Getters (delegate to sub-stores) ====================

  currentLab: () => useLabListStore.getState().currentLab,
  labList: () => useLabListStore.getState().labList,
  operationLogs: () => useLabListStore.getState().operationLogs,
  isLoading: () => useLabListStore.getState().isLoading,
  listUpdateKey: () => useLabListStore.getState().listUpdateKey,
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

  handleSelectLab: async (labId: string): Promise<void> => {
    await useLabListStore.getState().loadLab(labId)
  },

  handleNewLab: async (): Promise<void> => {
    const request: CreateLabRequest = {
      name: '新实验室',
      creationType: 'ssh'
    }
    await useLabStore.getState().createLab(request)
  },

  handleDeleteLab: async (labId: string): Promise<void> => {
    const labList = useLabListStore.getState().labList
    const lab = labList.find((item) => item.labId === labId)
    await useLabOperationStore
      .getState()
      .showDeleteConfirm(labId, lab?.name || '实验室', (lab?.creationType || 'ssh') as LabCreationType, {
        status: lab?.status
      })
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
  showDeleteConfirm: async (labId, labName, creationType, metadata?) => {
    await useLabOperationStore
      .getState()
      .showDeleteConfirm(labId, labName, creationType, metadata)
  },
  hideDeleteConfirm: () => {
    useLabOperationStore.getState().hideDeleteConfirm()
  },
  deleteLabWithConfirm: async () => {
    return useLabOperationStore.getState().deleteLabWithConfirm()
  },
  confirmDelete: async () => {
    await useLabOperationStore.getState().confirmDelete()
  }
}))
