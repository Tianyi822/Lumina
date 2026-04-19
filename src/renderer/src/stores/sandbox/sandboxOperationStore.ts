import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type { SandboxCreationType, DeleteSandboxOptions } from '@shared/types/sandbox'
import { useNotification } from '@renderer/composables/useNotification'
import { useSandboxListStore } from './sandboxListStore'

interface DeleteConfirmState {
  show: boolean
  sandboxId: string | null
  sandboxName: string
  creationType: SandboxCreationType | null
  containerCount: number
  hasWorkspace: boolean
  workspaceName?: string
  isDeleting: boolean
}

export const useSandboxOperationStore = defineStore('sandboxOperation', () => {
  const listStore = useSandboxListStore()
  const { currentSandbox, sandboxList } = storeToRefs(listStore)

  const deleteConfirmState = ref<DeleteConfirmState>({
    show: false,
    sandboxId: null,
    sandboxName: '',
    creationType: null,
    containerCount: 0,
    hasWorkspace: false,
    workspaceName: undefined,
    isDeleting: false
  })

  /** @deprecated 请直接使用 useNotification() composable */
  function showMessage(
    type: 'error' | 'warning' | 'success' | 'info',
    title: string,
    message: string,
    duration: number = 5000
  ): void {
    const notify = useNotification()
    notify.notify(type, title, message, {
      source: 'sandbox',
      duration: duration > 0 ? duration : undefined,
      sticky: duration === 0
    })
  }

  /** @deprecated 通知中心已接管消失逻辑，无需手动调用 */
  function hideMessage(): void {
    // 新通知中心不支持按消息 ID 隐藏，由自动计时器或用户点击关闭
  }

  /** @deprecated 请直接使用 useNotification().error() */
  function showError(title: string, message: string): void {
    const notify = useNotification()
    notify.error(title, message, { source: 'sandbox' })
  }

  /** @deprecated 请直接使用 useNotification().warning() */
  function showWarning(title: string, message: string): void {
    const notify = useNotification()
    notify.warning(title, message, { source: 'sandbox' })
  }

  /** @deprecated 请直接使用 useNotification().success() */
  function showSuccess(title: string, message: string): void {
    const notify = useNotification()
    notify.success(title, message, { source: 'sandbox' })
  }

  /** @deprecated 请直接使用 useNotification().info() */
  function showInfo(title: string, message: string): void {
    const notify = useNotification()
    notify.info(title, message, { source: 'sandbox' })
  }

  /** @deprecated 请直接使用 useNotification().error()，去重由通知中心处理 */
  function notifyDockerError(title: string, message: string, dedupeKey?: string): void {
    const notify = useNotification()
    notify.error(title, message, {
      source: 'sandbox',
      dedupeKey: dedupeKey || `${title}:${message}`
    })
  }

  async function showDeleteConfirm(
    sandboxId: string,
    sandboxName: string,
    creationType: SandboxCreationType,
    containerCount: number
  ): Promise<void> {
    let hasWorkspace = false
    let workspaceName: string | undefined

    try {
      const sandbox = await window.api.sandbox.loadSandbox(sandboxId)
      hasWorkspace =
        sandbox?.frontend?.storageType === 'docker-volume' && !!sandbox.frontend.volumeName
      workspaceName = sandbox?.frontend?.volumeName
    } catch (error) {
      window.api.logger.warn('[SandboxOperationStore] 加载删除确认所需的沙箱详情失败', {
        sandboxId,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    deleteConfirmState.value = {
      show: true,
      sandboxId,
      sandboxName,
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
      sandboxId: null,
      sandboxName: '',
      creationType: null,
      containerCount: 0,
      hasWorkspace: false,
      workspaceName: undefined,
      isDeleting: false
    }
  }

  function resolveSandboxMeta(sandboxId: string): {
    sandboxName: string
    creationType: SandboxCreationType
    containerCount: number
  } {
    const sandbox = sandboxList.value.find((item) => item.sandboxId === sandboxId)

    return {
      sandboxName: sandbox?.name || '沙箱',
      creationType: sandbox?.creationType || 'existing',
      containerCount: sandbox?.containerCount || 0
    }
  }

  function formatDeleteError(
    error: string,
    creationType: SandboxCreationType
  ): {
    title: string
    message: string
  } {
    if (error.includes('正在运行')) {
      return {
        title: '无法删除运行中的容器',
        message:
          creationType === 'dockerfile' || creationType === 'compose'
            ? '容器正在运行，请先停止容器后再删除沙箱。您可以在监控面板中点击“停止”按钮。'
            : '容器正在运行，请先停止容器后再删除沙箱。'
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
        message: '删除前端工作区前必须同时删除关联容器。请勾选“同时删除容器”后再重试。'
      }
    }

    return {
      title: '删除失败',
      message: error
    }
  }

  async function deleteSandboxById(
    sandboxId: string,
    options?: DeleteSandboxOptions,
    meta?: Partial<Pick<DeleteConfirmState, 'sandboxName' | 'creationType' | 'containerCount'>>
  ): Promise<boolean> {
    const fallbackMeta = resolveSandboxMeta(sandboxId)
    const creationType = meta?.creationType || fallbackMeta.creationType

    // 设置删除中状态
    deleteConfirmState.value.isDeleting = true

    try {
      const result = await window.api.sandbox.deleteSandbox(sandboxId, options)

      if (result.success) {
        if (currentSandbox.value?.sandboxId === sandboxId) {
          listStore.clearCurrentSandboxState()
        }

        listStore.removeSandboxStatus(sandboxId)
        await listStore.refreshSandboxList()
        hideDeleteConfirm()

        window.api.logger.info('[SandboxOperationStore] 删除沙箱成功', { sandboxId })
        const successMessageParts = ['沙箱已成功删除']
        if (result.removedWorkspace) {
          successMessageParts.push('前端工作区已同时删除。')
        } else if (result.keptWorkspace) {
          successMessageParts.push('前端工作区已保留。')
        }
        showSuccess('删除成功', successMessageParts.join('\n'))
        return true
      }

      if (result.error) {
        const formatted = formatDeleteError(result.error, creationType)
        showError(formatted.title, formatted.message)
      }

      // 删除失败，重置状态
      deleteConfirmState.value.isDeleting = false
      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxOperationStore] 删除沙箱失败', {
        error: errorMessage,
        sandboxId
      })
      showError('删除失败', '删除沙箱时发生错误，请稍后重试')
      // 异常时重置状态
      deleteConfirmState.value.isDeleting = false
      return false
    }
  }

  async function deleteSandboxWithConfirm(options?: DeleteSandboxOptions): Promise<boolean> {
    const { sandboxId, sandboxName, creationType, containerCount } = deleteConfirmState.value
    if (!sandboxId || !creationType) {
      return false
    }

    return deleteSandboxById(sandboxId, options, {
      sandboxName,
      creationType,
      containerCount
    })
  }

  async function confirmDelete(options?: DeleteSandboxOptions): Promise<void> {
    await deleteSandboxWithConfirm(options)
  }

  async function cleanupOrphanSandbox(sandboxId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.cleanupOrphan(sandboxId)

      if (result.success) {
        if (currentSandbox.value?.sandboxId === sandboxId) {
          listStore.clearCurrentSandboxState()
        }

        listStore.removeSandboxStatus(sandboxId)
        await listStore.refreshSandboxList()
        showSuccess('清理成功', '孤儿沙箱已清理')

        window.api.logger.info('[SandboxOperationStore] 清理孤儿沙箱成功', { sandboxId })
        return true
      }

      showError('清理失败', result.error || '清理孤儿沙箱失败')
      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxOperationStore] 清理孤儿沙箱失败', {
        error: errorMessage,
        sandboxId
      })
      showError('清理失败', errorMessage || '清理孤儿沙箱失败')
      return false
    }
  }

  async function recoverOrphanSandbox(sandboxId: string, newContainerId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.recoverOrphan(sandboxId, newContainerId)

      if (result.success) {
        await listStore.checkContainerStatus(sandboxId)
        if (currentSandbox.value?.sandboxId === sandboxId) {
          await listStore.loadSandbox(sandboxId, true)
        }

        await listStore.refreshSandboxList()
        showSuccess('恢复成功', '孤儿沙箱已重新关联容器')

        window.api.logger.info('[SandboxOperationStore] 恢复孤儿沙箱成功', {
          sandboxId,
          newContainerId
        })
        return true
      }

      showError('恢复失败', result.error || '恢复孤儿沙箱失败')
      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxOperationStore] 恢复孤儿沙箱失败', {
        error: errorMessage,
        sandboxId
      })
      showError('恢复失败', errorMessage || '恢复孤儿沙箱失败')
      return false
    }
  }

  return {
    deleteConfirmState,
    showDeleteConfirm,
    hideDeleteConfirm,
    deleteSandboxById,
    deleteSandboxWithConfirm,
    confirmDelete,
    cleanupOrphanSandbox,
    recoverOrphanSandbox,
    showMessage,
    hideMessage,
    showError,
    showWarning,
    showSuccess,
    showInfo,
    notifyDockerError
  }
})
