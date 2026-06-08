import { create } from 'zustand'
import type { LabCreationType, LabStatus } from '@renderer/types/lab'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import { labApi } from '@renderer/services/labApi'
import { useLabListStore } from './labListStore'
import { useLabTerminalSessionStore } from './labTerminalSessionStore'

export interface DeleteConfirmState {
  show: boolean
  labId: string | null
  labName: string
  creationType: LabCreationType | null
  status: LabStatus | null
  isDeleting: boolean
}

const initialDeleteConfirmState: DeleteConfirmState = {
  show: false,
  labId: null,
  labName: '',
  creationType: null,
  status: null,
  isDeleting: false
}

interface LabOperationState {
  deleteConfirmState: DeleteConfirmState

  showDeleteConfirm: (
    labId: string,
    labName: string,
    creationType: LabCreationType,
    metadata?: { status?: LabStatus }
  ) => Promise<void>
  hideDeleteConfirm: () => void
  deleteLabById: (
    labId: string,
    meta?: Partial<Pick<DeleteConfirmState, 'labName' | 'creationType'>>
  ) => Promise<boolean>
  deleteLabWithConfirm: () => Promise<boolean>
  confirmDelete: () => Promise<void>
}

function resolveLabMeta(labId: string): {
  labName: string
  creationType: LabCreationType
} {
  const labList = useLabListStore.getState().labList
  const lab = labList.find((item) => item.labId === labId)

  return {
    labName: lab?.name || '实验室',
    creationType: lab?.creationType || 'ssh'
  }
}

export const useLabOperationStore = create<LabOperationState>()((set, get) => ({
  deleteConfirmState: { ...initialDeleteConfirmState },

  showDeleteConfirm: async (
    labId: string,
    labName: string,
    creationType: LabCreationType,
    metadata?: { status?: LabStatus }
  ): Promise<void> => {
    let status = metadata?.status ?? null

    try {
      const lab = await labApi.loadLab(labId)
      status = lab?.status ?? status
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
        isDeleting: false
      }
    })
  },

  hideDeleteConfirm: (): void => {
    set({ deleteConfirmState: { ...initialDeleteConfirmState } })
  },

  deleteLabById: async (
    labId: string,
    meta?: Partial<Pick<DeleteConfirmState, 'labName' | 'creationType'>>
  ): Promise<boolean> => {
    const fallbackMeta = resolveLabMeta(labId)
    const labName = meta?.labName || fallbackMeta.labName

    // 设置删除中状态
    set((state) => ({
      deleteConfirmState: { ...state.deleteConfirmState, isDeleting: true }
    }))

    try {
      const result = await labApi.deleteLab(labId)

      if (result.success) {
        const listStore = useLabListStore.getState()
        if (listStore.currentLab?.labId === labId) {
          listStore.clearCurrentLabState()
        }

        useLabTerminalSessionStore.getState().removeSessionsByLabId(labId)
        await listStore.refreshLabList()
        get().hideDeleteConfirm()

        window.api.logger.info('[LabOperationStore] 删除实验室成功', { labId })
        notifySuccess('删除成功', `${labName}已成功删除`, { source: 'lab' })
        return true
      }

      if (result.error) {
        notifyError('删除失败', result.error, { source: 'lab' })
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

  deleteLabWithConfirm: async (): Promise<boolean> => {
    const { labId, labName, creationType } = get().deleteConfirmState
    if (!labId || !creationType) {
      return false
    }

    return get().deleteLabById(labId, {
      labName,
      creationType
    })
  },

  confirmDelete: async (): Promise<void> => {
    await get().deleteLabWithConfirm()
  }
}))
