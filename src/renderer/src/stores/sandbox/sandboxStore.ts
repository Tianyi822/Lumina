import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  SandboxData,
  SandboxListItem,
  SandboxLogEntry,
  SandboxTemplate,
  SandboxSelection,
  SandboxCreationType,
  ComposeOptions,
  ComposeResult,
  CreateSandboxRequest,
  CreateSandboxResult,
  DeleteSandboxOptions,
  SandboxContainerStatus
} from '@shared/types/sandbox'
import { useContainerStore } from './containerStore'

/** 删除确认状态 */
interface DeleteConfirmState {
  show: boolean
  sandboxId: string | null
  sandboxName: string
  creationType: SandboxCreationType | null
  containerCount: number
}

/** 操作错误/提示状态 */
interface OperationMessage {
  type: 'error' | 'warning' | 'success' | 'info'
  title: string
  message: string
  timestamp: number
}

export const useSandboxStore = defineStore('sandbox', () => {
  // ==================== Store Dependencies ====================

  const containerStore = useContainerStore()

  // ==================== State ====================

  const currentSandbox = ref<SandboxData | null>(null)
  const sandboxList = ref<SandboxListItem[]>([])
  const operationLogs = ref<SandboxLogEntry[]>([])
  const isLoading = ref(false)
  const listUpdateKey = ref(0)

  /** 沙箱模板列表 */
  const templates = ref<SandboxTemplate[]>([])
  /** 模板加载状态 */
  const templatesLoading = ref(false)

  /** 当前会话的沙箱选择 */
  const currentSessionSandbox = ref<SandboxSelection | null>(null)

  // ==================== State: Phase 4 新增 ====================

  /** 沙箱容器状态映射 */
  const sandboxContainerStatus = ref<Map<string, SandboxContainerStatus>>(new Map())

  /** 删除确认对话框状态 */
  const deleteConfirmState = ref<DeleteConfirmState>({
    show: false,
    sandboxId: null,
    sandboxName: '',
    creationType: null,
    containerCount: 0
  })

  /** 全局操作消息提示 */
  const operationMessage = ref<OperationMessage | null>(null)
  const messageVisible = ref(false)
  let messageTimer: ReturnType<typeof setTimeout> | null = null

  // ==================== Getters ====================

  const currentSandboxId = computed(() => currentSandbox.value?.sandboxId)
  const sandboxCount = computed(() => sandboxList.value.length)

  // ==================== Actions: 沙箱列表 ====================

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

  async function loadSandbox(sandboxId: string, force: boolean = false): Promise<boolean> {
    // 如果不是强制刷新且当前沙箱已经是目标沙箱，则跳过
    if (!force && currentSandbox.value?.sandboxId === sandboxId) {
      return true
    }

    try {
      isLoading.value = true

      const sandbox = await window.api.sandbox.loadSandbox(sandboxId)
      if (sandbox) {
        currentSandbox.value = sandbox
        await loadOperationLogs(sandboxId)

        // 加载关联的容器
        const containerStore = useContainerStore()
        const containerId = sandbox.primaryContainerId || sandbox.containerIds?.[0]
        if (containerId) {
          await containerStore.loadContainerDetails(containerId)
        }

        window.api.logger.info('[SandboxStore] 沙箱加载成功', {
          sandboxId,
          name: sandbox.name,
          containerId: containerId || 'none'
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

  // ==================== Actions: 沙箱 CRUD ====================

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
      const result = await window.api.sandbox.deleteSandbox(sandboxId, {})

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

  // ==================== Actions: 模板 ====================

  async function loadTemplates(): Promise<void> {
    try {
      templatesLoading.value = true
      templates.value = await window.api.sandbox.listTemplates()

      window.api.logger.info('[SandboxStore] 模板列表加载完成', {
        count: templates.value.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxStore] 加载模板列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      templates.value = []
    } finally {
      templatesLoading.value = false
    }
  }

  async function createFromTemplate(
    templateId: string,
    variables?: Record<string, string>
  ): Promise<ComposeResult | null> {
    try {
      const result = await window.api.sandbox.createFromTemplate(templateId, variables)

      if (!result.error) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxStore] 从模板创建沙箱成功', {
          templateId,
          containerCount: result.containerIds.length
        })
      }

      return result
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从模板创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        templateId
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

      if (!result.error) {
        await containerStore.refreshContainers()
        window.api.logger.info('[SandboxStore] 从 Compose 创建沙箱成功', {
          projectName: options?.projectName,
          containerCount: result.containerIds.length
        })
      }

      return result
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从 Compose 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
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
      } else {
        window.api.logger.error('[SandboxStore] 从 Dockerfile 创建沙箱失败', {
          error: result.error || '未知错误'
        })
        return null
      }
    } catch (error) {
      window.api.logger.error('[SandboxStore] 从 Dockerfile 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  // ==================== Actions: 会话关联 ====================

  async function selectSandboxForSession(
    containerId: string,
    sessionId?: string
  ): Promise<boolean> {
    try {
      const result = await window.api.sandbox.selectSandbox(containerId, sessionId)

      if (result.success) {
        const container = containerStore.containers.find((c) => c.id === containerId)
        if (container) {
          currentSessionSandbox.value = {
            containerId,
            containerName: container.names[0] || containerId.substring(0, 12),
            image: container.image,
            selectedAt: new Date().toISOString(),
            sessionId
          }
        }

        window.api.logger.info('[SandboxStore] 选择沙箱成功', {
          containerId: containerId.substring(0, 12),
          sessionId
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 选择沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        sessionId
      })
      return false
    }
  }

  async function deselectSandbox(containerId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.deselectSandbox(containerId)

      if (result.success && currentSessionSandbox.value?.containerId === containerId) {
        currentSessionSandbox.value = null
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[SandboxStore] 取消选择沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  async function getSessionSandbox(sessionId: string): Promise<SandboxSelection | null> {
    try {
      return await window.api.sandbox.getSessionSandbox(sessionId)
    } catch (error) {
      window.api.logger.error('[SandboxStore] 获取会话沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return null
    }
  }

  // ==================== Actions: 事件处理 ====================

  async function handleSelectSandbox(sandboxId: string): Promise<void> {
    await loadSandbox(sandboxId)
  }

  async function handleNewSandbox(): Promise<void> {
    // 创建默认沙箱请求（使用 existing 类型）
    const request: CreateSandboxRequest = {
      name: '新沙箱',
      creationType: 'existing'
    }
    await createSandbox(request)
  }

  async function handleDeleteSandbox(sandboxId: string): Promise<void> {
    await deleteSandbox(sandboxId)
  }

  // ==================== Actions: Phase 4 新增 ====================

  /**
   * 创建沙箱（带类型指定）
   */
  async function createSandbox(request: CreateSandboxRequest): Promise<CreateSandboxResult | null> {
    try {
      const result = await window.api.sandbox.createSandbox(request)

      if (result.success && result.sandbox) {
        currentSandbox.value = result.sandbox
        operationLogs.value = []

        await refreshSandboxList()

        window.api.logger.info('[SandboxStore] 创建沙箱成功', {
          sandboxId: result.sandbox.sandboxId,
          name: result.sandbox.name,
          creationType: request.creationType
        })
      }

      return result
    } catch (error) {
      window.api.logger.error('[SandboxStore] 创建沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        creationType: request.creationType
      })
      return null
    }
  }

  /**
   * 显示删除确认对话框
   */
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

  /**
   * 隐藏删除确认对话框
   */
  function hideDeleteConfirm(): void {
    deleteConfirmState.value = {
      show: false,
      sandboxId: null,
      sandboxName: '',
      creationType: null,
      containerCount: 0
    }
  }

  /**
   * 删除沙箱（带确认）
   */
  async function deleteSandboxWithConfirm(options?: DeleteSandboxOptions): Promise<boolean> {
    const { sandboxId, creationType } = deleteConfirmState.value
    if (!sandboxId) return false

    try {
      const result = await window.api.sandbox.deleteSandbox(sandboxId, options)

      if (result.success) {
        if (currentSandbox.value?.sandboxId === sandboxId) {
          currentSandbox.value = null
          operationLogs.value = []
        }

        // 从容器状态映射中移除
        sandboxContainerStatus.value.delete(sandboxId)

        await refreshSandboxList()
        hideDeleteConfirm()

        window.api.logger.info('[SandboxStore] 删除沙箱成功', { sandboxId })

        // 显示成功提示
        showSuccess('删除成功', '沙箱已成功删除')
        return true
      }

      // 删除失败，显示友好错误提示
      if (result.error) {
        // 分析错误类型，显示友好提示
        let title = '删除失败'
        let message = result.error

        if (result.error.includes('正在运行')) {
          title = '无法删除运行中的容器'
          message =
            creationType === 'dockerfile' || creationType === 'compose'
              ? '容器正在运行，请先停止容器后再删除沙箱。您可以在监控面板中点击"停止"按钮。'
              : '容器正在运行，请先停止容器后再删除沙箱。'
        } else if (result.error.includes('不存在')) {
          title = '容器不存在'
          message = '容器可能已被手动删除，请刷新列表后重试。'
        } else if (result.error.includes('权限不足')) {
          title = '权限不足'
          message = '当前用户没有足够的权限删除容器，请检查 Docker 权限配置。'
        }

        showError(title, message)
      }

      return false
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[SandboxStore] 删除沙箱失败', {
        error: errorMsg,
        sandboxId
      })

      // 显示友好的错误提示
      showError('删除失败', '删除沙箱时发生错误，请稍后重试')
      return false
    }
  }

  /**
   * 确认删除沙箱
   */
  async function confirmDelete(): Promise<void> {
    await deleteSandboxWithConfirm()
  }

  /**
   * 检查单个沙箱的容器状态
   */
  async function checkContainerStatus(sandboxId: string): Promise<SandboxContainerStatus | null> {
    try {
      const status = await window.api.sandbox.checkContainerStatus(sandboxId)
      if (status) {
        sandboxContainerStatus.value.set(sandboxId, status)
      }
      return status
    } catch (error) {
      window.api.logger.error('[SandboxStore] 检查容器状态失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return null
    }
  }

  /**
   * 批量检查所有沙箱的容器状态
   */
  async function checkAllContainerStatus(): Promise<void> {
    try {
      const statuses = await window.api.sandbox.checkAllContainerStatus()
      for (const status of statuses) {
        sandboxContainerStatus.value.set(status.sandboxId, status)
      }

      window.api.logger.info('[SandboxStore] 批量检查容器状态完成', {
        count: statuses.length
      })
    } catch (error) {
      window.api.logger.error('[SandboxStore] 批量检查容器状态失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * 清理孤儿沙箱
   */
  async function cleanupOrphanSandbox(sandboxId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.cleanupOrphan(sandboxId)

      if (result.success) {
        if (currentSandbox.value?.sandboxId === sandboxId) {
          currentSandbox.value = null
          operationLogs.value = []
        }

        sandboxContainerStatus.value.delete(sandboxId)
        await refreshSandboxList()

        window.api.logger.info('[SandboxStore] 清理孤儿沙箱成功', { sandboxId })
        return true
      }

      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 清理孤儿沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return false
    }
  }

  /**
   * 恢复孤儿沙箱（重新关联容器）
   */
  async function recoverOrphanSandbox(sandboxId: string, newContainerId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.recoverOrphan(sandboxId, newContainerId)

      if (result.success) {
        // 重新检查容器状态
        await checkContainerStatus(sandboxId)

        // 如果是当前沙箱，重新加载数据
        if (currentSandbox.value?.sandboxId === sandboxId) {
          await loadSandbox(sandboxId)
        }

        await refreshSandboxList()

        window.api.logger.info('[SandboxStore] 恢复孤儿沙箱成功', { sandboxId, newContainerId })
        return true
      }

      return false
    } catch (error) {
      window.api.logger.error('[SandboxStore] 恢复孤儿沙箱失败', {
        error: error instanceof Error ? error.message : String(error),
        sandboxId
      })
      return false
    }
  }

  // ==================== Actions: 消息提示 ====================

  /**
   * 显示操作消息
   */
  function showMessage(
    type: OperationMessage['type'],
    title: string,
    message: string,
    duration: number = 5000
  ): void {
    // 清除之前的定时器
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

    // 自动关闭
    if (duration > 0) {
      messageTimer = setTimeout(() => {
        hideMessage()
      }, duration)
    }
  }

  /**
   * 隐藏消息
   */
  function hideMessage(): void {
    messageVisible.value = false
    if (messageTimer) {
      clearTimeout(messageTimer)
      messageTimer = null
    }
    // 延迟清除消息内容（让淡出动画完成）
    setTimeout(() => {
      operationMessage.value = null
    }, 300)
  }

  /**
   * 显示错误消息
   */
  function showError(title: string, message: string): void {
    showMessage('error', title, message)
  }

  /**
   * 显示警告消息
   */
  function showWarning(title: string, message: string): void {
    showMessage('warning', title, message)
  }

  /**
   * 显示成功消息
   */
  function showSuccess(title: string, message: string): void {
    showMessage('success', title, message, 3000)
  }

  return {
    // State
    currentSandbox,
    sandboxList,
    operationLogs,
    isLoading,
    listUpdateKey,
    templates,
    templatesLoading,
    currentSessionSandbox,

    // State: Phase 4 新增
    sandboxContainerStatus,
    deleteConfirmState,

    // State: 消息提示
    operationMessage,
    messageVisible,

    // Getters
    currentSandboxId,
    sandboxCount,

    // Actions: 沙箱列表
    loadSandboxList,
    refreshSandboxList,
    loadSandbox,
    loadOperationLogs,

    // Actions: 沙箱 CRUD
    createSandbox,
    saveCurrentSandbox,
    deleteSandbox,
    renameSandbox,

    // Actions: 沙箱删除确认
    showDeleteConfirm,
    hideDeleteConfirm,
    deleteSandboxWithConfirm,
    confirmDelete,
    checkContainerStatus,
    checkAllContainerStatus,
    cleanupOrphanSandbox,
    recoverOrphanSandbox,

    // Actions: 模板
    loadTemplates,
    createFromTemplate,
    createFromCompose,
    createFromDockerfile,

    // Actions: 会话关联
    selectSandboxForSession,
    deselectSandbox,
    getSessionSandbox,

    // Actions: 事件处理
    handleSelectSandbox,
    handleNewSandbox,
    handleDeleteSandbox,

    // Actions: 消息提示
    showMessage,
    hideMessage,
    showError,
    showWarning,
    showSuccess
  }
})
