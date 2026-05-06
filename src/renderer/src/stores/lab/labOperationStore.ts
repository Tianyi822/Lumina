import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type { LabCreationType, DeleteLabOptions } from '@renderer/types/lab'
import { useNotification } from '@renderer/composables/useNotification'
import { labApi } from '@renderer/services/labApi'
import { useLabListStore } from './labListStore'

export interface DeleteConfirmState {
  show: boolean
  labId: string | null
  labName: string
  creationType: LabCreationType | null
  containerCount: number
  hasWorkspace: boolean
  workspaceName?: string
  isDeleting: boolean
}

export const useLabOperationStore = defineStore('labOperation', () => {
  const listStore = useLabListStore()
  const { currentLab, labList } = storeToRefs(listStore)
  const notify = useNotification()

  const deleteConfirmState = ref<DeleteConfirmState>({
    show: false,
    labId: null,
    labName: '',
    creationType: null,
    containerCount: 0,
    hasWorkspace: false,
    workspaceName: undefined,
    isDeleting: false
  })

  async function showDeleteConfirm(
    labId: string,
    labName: string,
    creationType: LabCreationType,
    containerCount: number
  ): Promise<void> {
    let hasWorkspace = false
    let workspaceName: string | undefined

    try {
      const lab = await labApi.loadLab(labId)
      hasWorkspace = lab?.frontend?.storageType === 'docker-volume' && !!lab.frontend.volumeName
      workspaceName = lab?.frontend?.volumeName
    } catch (error) {
      window.api.logger.warn('[LabOperationStore] 加载删除确认所需的实验室详情失败', {
        labId,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    deleteConfirmState.value = {
      show: true,
      labId,
      labName,
      creationType,
      containerCount,
      hasWorkspace,
      workspaceName,
      isDeleting: false
    }
  }

  function hideDeleteConfirm(): void {
    deleteConfirmState.value = {
      show: false,
      labId: null,
      labName: '',
      creationType: null,
      containerCount: 0,
      hasWorkspace: false,
      workspaceName: undefined,
      isDeleting: false
    }
  }

  function resolveLabMeta(labId: string): {
    labName: string
    creationType: LabCreationType
    containerCount: number
  } {
    const lab = labList.value.find((item) => item.labId === labId)

    return {
      labName: lab?.name || '实验室',
      creationType: lab?.creationType || 'existing',
      containerCount: lab?.containerCount || 0
    }
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

  async function deleteLabById(
    labId: string,
    options?: DeleteLabOptions,
    meta?: Partial<Pick<DeleteConfirmState, 'labName' | 'creationType' | 'containerCount'>>
  ): Promise<boolean> {
    const fallbackMeta = resolveLabMeta(labId)
    const creationType = meta?.creationType || fallbackMeta.creationType

    // 设置删除中状态
    deleteConfirmState.value.isDeleting = true

    try {
      const result = await labApi.deleteLab(labId, options)

      if (result.success) {
        if (currentLab.value?.labId === labId) {
          listStore.clearCurrentLabState()
        }

        listStore.removeLabStatus(labId)
        await listStore.refreshLabList()
        hideDeleteConfirm()

        window.api.logger.info('[LabOperationStore] 删除实验室成功', { labId })
        const successMessageParts = ['实验室已成功删除']
        if (result.removedWorkspace) {
          successMessageParts.push('前端工作区已同时删除。')
        } else if (result.keptWorkspace) {
          successMessageParts.push('前端工作区已保留。')
        }
        notify.success('删除成功', successMessageParts.join('\n'), { source: 'lab' })
        return true
      }

      if (result.error) {
        const formatted = formatDeleteError(result.error, creationType)
        notify.error(formatted.title, formatted.message, { source: 'lab' })
      }

      // 删除失败，重置状态
      deleteConfirmState.value.isDeleting = false
      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabOperationStore] 删除实验室失败', {
        error: errorMessage,
        labId
      })
      notify.error('删除失败', '删除实验室时发生错误，请稍后重试', { source: 'lab' })
      // 异常时重置状态
      deleteConfirmState.value.isDeleting = false
      return false
    }
  }

  async function deleteLabWithConfirm(options?: DeleteLabOptions): Promise<boolean> {
    const { labId, labName, creationType, containerCount } = deleteConfirmState.value
    if (!labId || !creationType) {
      return false
    }

    return deleteLabById(labId, options, {
      labName,
      creationType,
      containerCount
    })
  }

  async function confirmDelete(options?: DeleteLabOptions): Promise<void> {
    await deleteLabWithConfirm(options)
  }

  async function cleanupOrphanLab(labId: string): Promise<boolean> {
    try {
      const result = await labApi.cleanupOrphan(labId)

      if (result.success) {
        if (currentLab.value?.labId === labId) {
          listStore.clearCurrentLabState()
        }

        listStore.removeLabStatus(labId)
        await listStore.refreshLabList()
        notify.success('清理成功', '孤儿实验室已清理', { source: 'lab' })

        window.api.logger.info('[LabOperationStore] 清理孤儿实验室成功', { labId })
        return true
      }

      notify.error('清理失败', result.error || '清理孤儿实验室失败', { source: 'lab' })
      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabOperationStore] 清理孤儿实验室失败', {
        error: errorMessage,
        labId
      })
      notify.error('清理失败', errorMessage || '清理孤儿实验室失败', { source: 'lab' })
      return false
    }
  }

  async function recoverOrphanLab(labId: string, newContainerId: string): Promise<boolean> {
    try {
      const result = await labApi.recoverOrphan(labId, newContainerId)

      if (result.success) {
        await listStore.checkContainerStatus(labId)
        if (currentLab.value?.labId === labId) {
          await listStore.loadLab(labId, true)
        }

        await listStore.refreshLabList()
        notify.success('恢复成功', '孤儿实验室已重新关联容器', { source: 'lab' })

        window.api.logger.info('[LabOperationStore] 恢复孤儿实验室成功', {
          labId,
          newContainerId
        })
        return true
      }

      notify.error('恢复失败', result.error || '恢复孤儿实验室失败', { source: 'lab' })
      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[LabOperationStore] 恢复孤儿实验室失败', {
        error: errorMessage,
        labId
      })
      notify.error('恢复失败', errorMessage || '恢复孤儿实验室失败', { source: 'lab' })
      return false
    }
  }

  return {
    deleteConfirmState,
    showDeleteConfirm,
    hideDeleteConfirm,
    deleteLabById,
    deleteLabWithConfirm,
    confirmDelete,
    cleanupOrphanLab,
    recoverOrphanLab
  }
})
