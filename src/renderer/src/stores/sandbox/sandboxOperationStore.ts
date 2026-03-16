import { ref } from 'vue'
import { defineStore, storeToRefs } from 'pinia'
import type { SandboxCreationType, DeleteSandboxOptions } from '@shared/types/sandbox'
import { useSandboxListStore } from './sandboxListStore'

interface DeleteConfirmState {
  show: boolean
  sandboxId: string | null
  sandboxName: string
  creationType: SandboxCreationType | null
  containerCount: number
}

interface OperationMessage {
  type: 'error' | 'warning' | 'success' | 'info'
  title: string
  message: string
  timestamp: number
}

const MESSAGE_DEDUP_WINDOW = 3000

export const useSandboxOperationStore = defineStore('sandboxOperation', () => {
  const listStore = useSandboxListStore()
  const { currentSandbox, sandboxList } = storeToRefs(listStore)

  const deleteConfirmState = ref<DeleteConfirmState>({
    show: false,
    sandboxId: null,
    sandboxName: '',
    creationType: null,
    containerCount: 0
  })

  const operationMessage = ref<OperationMessage | null>(null)
  const messageVisible = ref(false)
  const recentMessageTimestamps = new Map<string, number>()
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  function showMessage(
    type: OperationMessage['type'],
    title: string,
    message: string,
    duration: number = 5000
  ): void {
    if (messageTimer) {
      clearTimeout(messageTimer)
    }

    operationMessage.value = {
      type,
      title,
      message,
      timestamp: Date.now()
    }
    messageVisible.value = true

    if (duration > 0) {
      messageTimer = setTimeout(() => {
        hideMessage()
      }, duration)
    }
  }

  function hideMessage(): void {
    messageVisible.value = false
    if (messageTimer) {
      clearTimeout(messageTimer)
      messageTimer = null
    }

    setTimeout(() => {
      operationMessage.value = null
    }, 300)
  }

  function showError(title: string, message: string): void {
    showMessage('error', title, message)
  }

  function showWarning(title: string, message: string): void {
    showMessage('warning', title, message)
  }

  function showSuccess(title: string, message: string): void {
    showMessage('success', title, message, 3000)
  }

  function showInfo(title: string, message: string): void {
    showMessage('info', title, message)
  }

  function notifyDockerError(title: string, message: string, dedupeKey?: string): void {
    const messageKey = dedupeKey || `${title}:${message}`
    const now = Date.now()
    const lastShownAt = recentMessageTimestamps.get(messageKey)

    if (lastShownAt && now - lastShownAt < MESSAGE_DEDUP_WINDOW) {
      return
    }

    recentMessageTimestamps.set(messageKey, now)
    showError(title, message)
  }

  function showDeleteConfirm(
    sandboxId: string,
    sandboxName: string,
    creationType: SandboxCreationType,
    containerCount: number
  ): void {
    deleteConfirmState.value = {
      show: true,
      sandboxId,
      sandboxName,
      creationType,
      containerCount
    }
  }

  function hideDeleteConfirm(): void {
    deleteConfirmState.value = {
      show: false,
      sandboxId: null,
      sandboxName: '',
      creationType: null,
      containerCount: 0
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
        showSuccess('删除成功', '沙箱已成功删除')
        return true
      }

      if (result.error) {
        const formatted = formatDeleteError(result.error, creationType)
        showError(formatted.title, formatted.message)
      }

      return false
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxOperationStore] 删除沙箱失败', {
        error: errorMessage,
        sandboxId
      })
      showError('删除失败', '删除沙箱时发生错误，请稍后重试')
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

  async function confirmDelete(deleteContainers?: boolean): Promise<void> {
    await deleteSandboxWithConfirm(
      deleteContainers === undefined ? undefined : { deleteContainers }
    )
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
    operationMessage,
    messageVisible,
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
