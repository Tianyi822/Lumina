import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SandboxData, SandboxListItem, SandboxLogEntry } from '@shared/types/sandbox'

const DEFAULT_NEW_SANDBOX_NAME = '新沙箱'

export const useSandboxStore = defineStore('sandbox', () => {
  // ==================== State ====================

  const currentSandbox = ref<SandboxData | null>(null)
  const sandboxList = ref<SandboxListItem[]>([])
  const operationLogs = ref<SandboxLogEntry[]>([])
  const isLoading = ref(false)
  const listUpdateKey = ref(0)

  // ==================== Getters ====================

  const currentSandboxId = computed(() => currentSandbox.value?.sandboxId)

  const sandboxCount = computed(() => sandboxList.value.length)

  // ==================== Actions ====================

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
    // Getters
    currentSandboxId,
    sandboxCount,
    // Actions
    loadSandboxList,
    refreshSandboxList,
    loadSandbox,
    loadOperationLogs,
    createSandbox,
    saveCurrentSandbox,
    deleteSandbox,
    renameSandbox,
    handleSelectSandbox,
    handleNewSandbox,
    handleDeleteSandbox
  }
})
