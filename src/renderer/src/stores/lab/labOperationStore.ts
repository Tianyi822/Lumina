import { create } from 'zustand'
import type { LabCreationType, LabStatus, DeleteLabOptions } from '@renderer/types/lab'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import { labApi } from '@renderer/services/labApi'
import { useLabListStore } from './labListStore'
import { useLabTerminalSessionStore } from './labTerminalSessionStore'

export interface DeleteConfirmState {
  show: boolean
  labId: string | null
  labName: string
  creationType: LabCreationType | null
  status: LabStatus | null
  containerCount: number
  isOrphan: boolean
  hasWorkspace: boolean
  workspaceName?: string
  isDeleting: boolean
}

const initialDeleteConfirmState: DeleteConfirmState = {
  show: false,
  labId: null,
  labName: '',
  creationType: null,
  status: null,
  containerCount: 0,
  isOrphan: false,
  hasWorkspace: false,
  workspaceName: undefined,
  isDeleting: false
}

interface LabOperationState {
  deleteConfirmState: DeleteConfirmState

  showDeleteConfirm: (
    labId: string,
    labName: string,
    creationType: LabCreationType,
    containerCount: number,
    metadata?: { status?: LabStatus; isOrphan?: boolean }
  ) => Promise<void>
  hideDeleteConfirm: () => void
  deleteLabById: (
    labId: string,
    options?: DeleteLabOptions,
    meta?: Partial<Pick<DeleteConfirmState, 'labName' | 'creationType' | 'containerCount'>>
  ) => Promise<boolean>
  deleteLabWithConfirm: (options?: DeleteLabOptions) => Promise<boolean>
  confirmDelete: (options?: DeleteLabOptions) => Promise<void>
  cleanupOrphanLab: (labId: string) => Promise<boolean>
  recoverOrphanLab: (labId: string, newContainerId: string) => Promise<boolean>
}

function resolveLabMeta(labId: string): {
  labName: string
  creationType: LabCreationType
  containerCount: number
} {
  const labList = useLabListStore.getState().labList
  const lab = labList.find((item) => item.labId === labId)

  return {
    labName: lab?.name || '实验室',
    creationType: lab?.creationType || 'existing',
    containerCount: lab?.containerCount || 0
  }
}

function isManagedDockerLab(type: LabCreationType): boolean {
  return type === 'compose' || type === 'dockerfile'
}

function shouldOfferMetadataOnlyDelete(
  error: string,
  creationType: LabCreationType,
  options?: DeleteLabOptions
): boolean {
  return (
    isManagedDockerLab(creationType) &&
    options?.deleteContainers !== false &&
    (error.includes('Docker 不可用') || error.includes('无法确认或删除关联容器'))
  )
}

function formatDeleteError(
  error: string,
  creationType: LabCreationType
): {
  title: string
  message: string
} {
  if (error.includes('正在运行')) {
    return {
      title: '无法删除运行中的容器',
      message:
        creationType === 'dockerfile' || creationType === 'compose'
          ? '容器正在运行，请先停止容器后再删除实验室。您可以在监控面板中点击"停止"按钮。'
          : '容器正在运行，请先停止容器后再删除实验室。'
    }
  }

  if (error.includes('不存在')) {
    return {
      title: '容器不存在',
      message: '容器可能已被手动删除，请刷新列表后重试。'
    }
  }

  if (error.includes('权限不足')) {
    return {
      title: '权限不足',
      message: '当前用户没有足够的权限删除容器，请检查 Docker 权限配置。'
    }
  }

  if (error.includes('删除前端工作区前必须同时删除关联容器')) {
    return {
      title: '无法删除工作区',
      message: '删除前端工作区前必须同时删除关联容器。请勾选"同时删除容器"后再重试。'
    }
  }

  return {
    title: '删除失败',
    message: error
  }
}

export const useLabOperationStore = create<LabOperationState>()((set, get) => ({
  deleteConfirmState: { ...initialDeleteConfirmState },

  showDeleteConfirm: async (
    labId: string,
    labName: string,
    creationType: LabCreationType,
    containerCount: number,
    metadata?: { status?: LabStatus; isOrphan?: boolean }
  ): Promise<void> => {
    let hasWorkspace = false
    let workspaceName: string | undefined
    let status = metadata?.status ?? null
    let isOrphan = metadata?.isOrphan ?? false

    try {
      const lab = await labApi.loadLab(labId)
      hasWorkspace = lab?.frontend?.storageType === 'docker-volume' && !!lab.frontend.volumeName
      workspaceName = lab?.frontend?.volumeName
      status = lab?.status ?? status
      isOrphan = lab?.isOrphan ?? isOrphan
    } catch (error) {
      window.api.logger.warn('[LabOperationStore] 加载删除确认所需的实验室详情失败', {
        labId,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    set({
      deleteConfirmState: {
        show: true,
        labId,
        labName,
        creationType,
        status,
        containerCount,
        isOrphan,
        hasWorkspace,
        workspaceName,
        isDeleting: false
      }
    })
  },

  hideDeleteConfirm: (): void => {
    set({ deleteConfirmState: { ...initialDeleteConfirmState } })
  },

  deleteLabById: async (
    labId: string,
    options?: DeleteLabOptions,
    meta?: Partial<Pick<DeleteConfirmState, 'labName' | 'creationType' | 'containerCount'>>
  ): Promise<boolean> => {
    const fallbackMeta = resolveLabMeta(labId)
    const creationType = meta?.creationType || fallbackMeta.creationType

    // 设置删除中状态
    set((state) => ({
      deleteConfirmState: { ...state.deleteConfirmState, isDeleting: true }
    }))

    try {
      const result = await labApi.deleteLab(labId, options)

      if (result.success) {
        const listStore = useLabListStore.getState()
        if (listStore.currentLab?.labId === labId) {
          listStore.clearCurrentLabState()
        }

        useLabTerminalSessionStore.getState().removeSessionsByLabId(labId)

        listStore.removeLabStatus(labId)
        await listStore.refreshLabList()
        get().hideDeleteConfirm()

        window.api.logger.info('[LabOperationStore] 删除实验室成功', { labId })
        const successMessageParts = ['实验室已成功删除']
        if (result.removedWorkspace) {
          successMessageParts.push('前端工作区已同时删除。')
        } else if (result.keptWorkspace) {
          successMessageParts.push('前端工作区已保留。')
        }
        notifySuccess('删除成功', successMessageParts.join('\n'), { source: 'lab' })
        return true
      }

      if (result.error) {
        if (shouldOfferMetadataOnlyDelete(result.error, creationType, options)) {
          set((state) => ({
            deleteConfirmState: { ...state.deleteConfirmState, isDeleting: false }
          }))
          const confirmed = await useNotificationCenterStore
            .getState()
            .requestConfirm(
              '当前无法连接 Docker，无法确认或删除关联容器。\n\n继续删除只会移除 Lumina 中的实验室元数据。删除后元数据会丢失，无法再通过此记录重连或恢复关联。',
              '仅删除实验室元数据',
              true
            )

          if (confirmed) {
            return get().deleteLabById(
              labId,
              {
                ...options,
                deleteContainers: false,
                deleteWorkspace: false
              },
              meta
            )
          }

          return false
        }

        const formatted = formatDeleteError(result.error, creationType)
        notifyError(formatted.title, formatted.message, { source: 'lab' })
      }

      // 删除失败，重置状态
      set((state) => ({
        deleteConfirmState: { ...state.deleteConfirmState, isDeleting: false }
      }))
      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabOperationStore] 删除实验室失败', {
        error: errorMessage,
        labId
      })
      notifyError('删除失败', '删除实验室时发生错误，请稍后重试', { source: 'lab' })
      // 异常时重置状态
      set((state) => ({
        deleteConfirmState: { ...state.deleteConfirmState, isDeleting: false }
      }))
      return false
    }
  },

  deleteLabWithConfirm: async (options?: DeleteLabOptions): Promise<boolean> => {
    const { labId, labName, creationType, containerCount } = get().deleteConfirmState
    if (!labId || !creationType) {
      return false
    }

    return get().deleteLabById(labId, options, {
      labName,
      creationType,
      containerCount
    })
  },

  confirmDelete: async (options?: DeleteLabOptions): Promise<void> => {
    await get().deleteLabWithConfirm(options)
  },

  cleanupOrphanLab: async (labId: string): Promise<boolean> => {
    try {
      const result = await labApi.cleanupOrphan(labId)

      if (result.success) {
        const listStore = useLabListStore.getState()
        if (listStore.currentLab?.labId === labId) {
          listStore.clearCurrentLabState()
        }

        listStore.removeLabStatus(labId)
        await listStore.refreshLabList()
        notifySuccess('清理成功', '孤儿实验室已清理', { source: 'lab' })

        window.api.logger.info('[LabOperationStore] 清理孤儿实验室成功', { labId })
        return true
      }

      notifyError('清理失败', result.error || '清理孤儿实验室失败', { source: 'lab' })
      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabOperationStore] 清理孤儿实验室失败', {
        error: errorMessage,
        labId
      })
      notifyError('清理失败', errorMessage || '清理孤儿实验室失败', { source: 'lab' })
      return false
    }
  },

  recoverOrphanLab: async (labId: string, newContainerId: string): Promise<boolean> => {
    try {
      const result = await labApi.recoverOrphan(labId, newContainerId)

      if (result.success) {
        const listStore = useLabListStore.getState()
        await listStore.checkContainerStatus(labId)
        if (listStore.currentLab?.labId === labId) {
          await listStore.loadLab(labId, true)
        }

        await listStore.refreshLabList()
        notifySuccess('恢复成功', '孤儿实验室已重新关联容器', { source: 'lab' })

        window.api.logger.info('[LabOperationStore] 恢复孤儿实验室成功', {
          labId,
          newContainerId
        })
        return true
      }

      notifyError('恢复失败', result.error || '恢复孤儿实验室失败', { source: 'lab' })
      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabOperationStore] 恢复孤儿实验室失败', {
        error: errorMessage,
        labId
      })
      notifyError('恢复失败', errorMessage || '恢复孤儿实验室失败', { source: 'lab' })
      return false
    }
  }
}))
