import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  ContainerFilter,
  ContainerState,
  TerminalLog,
  ExecCommand,
  LogOptions
} from '@shared/types/sandbox'
import type { ContainerInfo, ContainerDetails, ContainerStats } from '@shared/types/sandbox'
import { useNotification } from '@renderer/composables/useNotification'

export const useContainerStore = defineStore('container', () => {
  const notify = useNotification()
  let latestStatsRequestId = 0

  // ==================== State ====================

  /** Docker 容器列表 */
  const containers = ref<ContainerInfo[]>([])
  /** 选中的容器详情 */
  const selectedContainer = ref<ContainerDetails | null>(null)
  /** 容器资源统计 */
  const containerStats = ref<ContainerStats | null>(null)
  /** 容器过滤条件 */
  const containerFilter = ref<ContainerFilter>({ state: 'all' })
  /** 容器搜索关键词 */
  const containerSearchQuery = ref('')
  /** 终端日志 */
  const terminalLogs = ref<TerminalLog[]>([])
  /** 加载状态 */
  const isLoading = ref(false)
  /** 列表更新 key（用于触发外部组件更新） */
  const listUpdateKey = ref(0)

  // ==================== Getters ====================

  /** 过滤后的容器列表 */
  const filteredContainers = computed(() => {
    let result = containers.value

    if (containerFilter.value.state && containerFilter.value.state !== 'all') {
      if (containerFilter.value.state === 'running') {
        result = result.filter((c) => c.state === 'running')
      } else if (containerFilter.value.state === 'stopped') {
        result = result.filter((c) => c.state === 'exited' || c.state === 'dead')
      } else {
        result = result.filter((c) => c.state === containerFilter.value.state)
      }
    }

    if (containerSearchQuery.value.trim()) {
      const query = containerSearchQuery.value.toLowerCase()
      result = result.filter(
        (c) =>
          c.names.some((n) => n.toLowerCase().includes(query)) ||
          c.image.toLowerCase().includes(query)
      )
    }

    return result
  })

  /** 运行中的容器数量 */
  const runningContainerCount = computed(
    () => containers.value.filter((c) => c.state === 'running').length
  )

  /** 已停止的容器数量 */
  const stoppedContainerCount = computed(
    () => containers.value.filter((c) => c.state === 'exited' || c.state === 'dead').length
  )

  // ==================== Actions: 容器列表 ====================

  async function loadContainers(): Promise<void> {
    try {
      isLoading.value = true
      // 将 Vue 响应式对象转换为普通对象，避免 IPC 序列化错误
      const filter = JSON.parse(JSON.stringify(containerFilter.value))
      window.api.logger.info('[ContainerStore] 开始加载容器列表', { filter })

      const result = await window.api.sandbox.listContainers(filter)
      window.api.logger.info('[ContainerStore] IPC 返回结果', {
        success: result.success,
        length: result.containers?.length || 0,
        sample:
          result.containers && result.containers.length > 0
            ? JSON.stringify(result.containers[0]).substring(0, 300)
            : null
      })

      if (!result.success) {
        containers.value = []
        notify.error('加载容器列表失败', result.error || '未知错误', {
          source: 'sandbox',
          dedupeKey: 'container-error'
        })
        return
      }

      containers.value = result.containers || []

      window.api.logger.info('[ContainerStore] 容器列表加载完成', {
        count: containers.value.length
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 加载容器列表失败', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      })
      containers.value = []
      notify.error('加载容器列表失败', errorMessage, {
        source: 'sandbox',
        dedupeKey: 'container-error'
      })
    } finally {
      isLoading.value = false
    }
  }

  async function refreshContainers(): Promise<void> {
    await loadContainers()
    listUpdateKey.value++
  }

  async function loadContainerDetails(
    containerId: string,
    options?: { silent?: boolean }
  ): Promise<void> {
    try {
      const result = await window.api.sandbox.getContainerDetails(containerId)

      if (!result.success) {
        selectedContainer.value = null
        if (!options?.silent) {
          notify.error('加载容器详情失败', result.error || '未知错误', {
            source: 'sandbox',
            dedupeKey: 'container-error'
          })
        }
        return
      }

      selectedContainer.value = result.details || null

      if (!options?.silent) {
        window.api.logger.info('[ContainerStore] 容器详情加载完成', {
          containerId: containerId.substring(0, 12)
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (!options?.silent) {
        window.api.logger.error('[ContainerStore] 加载容器详情失败', {
          error: errorMessage,
          containerId
        })
      }
      selectedContainer.value = null
      if (!options?.silent) {
        notify.error('加载容器详情失败', errorMessage, {
          source: 'sandbox',
          dedupeKey: 'container-error'
        })
      }
    }
  }

  async function loadContainerStats(
    containerId: string,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    const requestId = ++latestStatsRequestId

    try {
      const result = await window.api.sandbox.getContainerStats(containerId)
      if (requestId !== latestStatsRequestId) {
        return false
      }

      if (!result.success) {
        containerStats.value = null
        if (!options?.silent) {
          notify.error('加载容器统计失败', result.error || '未知错误', {
            source: 'sandbox',
            dedupeKey: 'container-error'
          })
        }
        return false
      }

      containerStats.value = result.stats || null
      return !!result.stats
    } catch (error) {
      if (requestId !== latestStatsRequestId) {
        return false
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 加载容器统计失败', {
        error: errorMessage,
        containerId
      })
      containerStats.value = null
      if (!options?.silent) {
        notify.error('加载容器统计失败', errorMessage, {
          source: 'sandbox',
          dedupeKey: 'container-error'
        })
      }
      return false
    }
  }

  function clearContainerStats(): void {
    latestStatsRequestId++
    containerStats.value = null
  }

  function setContainerFilter(filter: ContainerFilter): void {
    containerFilter.value = filter
  }

  function setContainerSearchQuery(query: string): void {
    containerSearchQuery.value = query
  }

  // ==================== Actions: 容器操作 ====================

  async function startContainer(
    containerId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.api.sandbox.startContainer(containerId)

      if (result.success) {
        await refreshContainers()
        // 如果当前有选中的容器，刷新其详情
        if (selectedContainer.value?.id === containerId) {
          await loadContainerDetails(containerId)
          // 同时刷新容器统计
          await loadContainerStats(containerId)
        }
        window.api.logger.info('[ContainerStore] 容器启动成功', {
          containerId: containerId.substring(0, 12)
        })
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 启动容器失败', {
        error: errorMessage,
        containerId
      })
      return { success: false, error: errorMessage }
    }
  }

  async function stopContainer(
    containerId: string,
    timeout?: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.api.sandbox.stopContainer(containerId, timeout)

      if (result.success) {
        await refreshContainers()
        // 如果当前有选中的容器，刷新其详情
        if (selectedContainer.value?.id === containerId) {
          await loadContainerDetails(containerId)
        }
        window.api.logger.info('[ContainerStore] 容器停止成功', {
          containerId: containerId.substring(0, 12)
        })
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 停止容器失败', {
        error: errorMessage,
        containerId
      })
      return { success: false, error: errorMessage }
    }
  }

  async function restartContainer(
    containerId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.api.sandbox.restartContainer(containerId)

      if (result.success) {
        await refreshContainers()
        // 如果当前有选中的容器，刷新其详情
        if (selectedContainer.value?.id === containerId) {
          await loadContainerDetails(containerId)
          // 同时刷新容器统计
          await loadContainerStats(containerId)
        }
        window.api.logger.info('[ContainerStore] 容器重启成功', {
          containerId: containerId.substring(0, 12)
        })
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 重启容器失败', {
        error: errorMessage,
        containerId
      })
      return { success: false, error: errorMessage }
    }
  }

  async function removeContainer(
    containerId: string,
    force?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.api.sandbox.removeContainer(containerId, force)

      if (result.success) {
        await refreshContainers()
        if (selectedContainer.value?.id === containerId) {
          selectedContainer.value = null
        }
        window.api.logger.info('[ContainerStore] 容器删除成功', {
          containerId: containerId.substring(0, 12)
        })
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 删除容器失败', {
        error: errorMessage,
        containerId
      })
      return { success: false, error: errorMessage }
    }
  }

  // ==================== Actions: Compose 项目操作 ====================

  async function composeStop(
    projectName: string,
    timeout?: number
  ): Promise<{ success: boolean; error?: string; stoppedContainerIds?: string[] }> {
    try {
      const result = await window.api.sandbox.compose.stop(projectName, { timeout })

      if (result.success) {
        await refreshContainers()
        // 如果当前有选中的容器属于该项目，刷新其详情
        if (selectedContainer.value) {
          const composeProjectLabel = selectedContainer.value.labels?.['com.docker.compose.project']
          if (composeProjectLabel === projectName) {
            await loadContainerDetails(selectedContainer.value.id)
          }
        }
        window.api.logger.info('[ContainerStore] Compose 项目停止成功', {
          projectName,
          stoppedCount: result.stoppedContainerIds?.length || 0
        })
        return {
          success: true,
          stoppedContainerIds: result.stoppedContainerIds
        }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 停止 Compose 项目失败', {
        error: errorMessage,
        projectName
      })
      return { success: false, error: errorMessage }
    }
  }

  async function composeStart(
    projectName: string
  ): Promise<{ success: boolean; error?: string; containerIds?: string[] }> {
    try {
      const result = await window.api.sandbox.compose.start(projectName)

      if (result.success) {
        await refreshContainers()
        // 如果当前有选中的容器属于该项目，刷新其详情
        if (selectedContainer.value) {
          const composeProjectLabel = selectedContainer.value.labels?.['com.docker.compose.project']
          if (composeProjectLabel === projectName) {
            await loadContainerDetails(selectedContainer.value.id)
            await loadContainerStats(selectedContainer.value.id)
          }
        }
        window.api.logger.info('[ContainerStore] Compose 项目启动成功', {
          projectName,
          startedCount: result.containerIds?.length || 0
        })
        return {
          success: true,
          containerIds: result.containerIds
        }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 启动 Compose 项目失败', {
        error: errorMessage,
        projectName
      })
      return { success: false, error: errorMessage }
    }
  }

  async function composeRestart(
    projectName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.api.sandbox.compose.restart(projectName)

      if (result.success) {
        await refreshContainers()
        // 如果当前有选中的容器属于该项目，刷新其详情
        if (selectedContainer.value) {
          const composeProjectLabel = selectedContainer.value.labels?.['com.docker.compose.project']
          if (composeProjectLabel === projectName) {
            await loadContainerDetails(selectedContainer.value.id)
            await loadContainerStats(selectedContainer.value.id)
          }
        }
        window.api.logger.info('[ContainerStore] Compose 项目重启成功', { projectName })
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 重启 Compose 项目失败', {
        error: errorMessage,
        projectName
      })
      return { success: false, error: errorMessage }
    }
  }

  // ==================== Actions: 命令执行 ====================

  async function execCommand(
    containerId: string,
    command: ExecCommand
  ): Promise<{ exitCode: number; stdout: string; stderr: string; duration: number } | null> {
    try {
      terminalLogs.value.push({
        timestamp: new Date().toISOString(),
        type: 'input',
        content: command.command
      })

      const result = await window.api.sandbox.execCommand(containerId, command)

      if (!result.success || !result.result) {
        const errorMessage = result.error || '命令执行失败'
        notify.error('执行命令失败', errorMessage, {
          source: 'sandbox',
          dedupeKey: 'container-error'
        })
        terminalLogs.value.push({
          timestamp: new Date().toISOString(),
          type: 'error',
          content: errorMessage
        })
        return null
      }

      terminalLogs.value.push({
        timestamp: new Date().toISOString(),
        type: result.result.exitCode === 0 ? 'output' : 'error',
        content: result.result.stdout || result.result.stderr || '命令执行完成'
      })

      return result.result
    } catch (error) {
      window.api.logger.error('[ContainerStore] 执行命令失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        command: command.command
      })

      terminalLogs.value.push({
        timestamp: new Date().toISOString(),
        type: 'error',
        content: error instanceof Error ? error.message : String(error)
      })

      return null
    }
  }

  function clearTerminalLogs(): void {
    terminalLogs.value = []
  }

  // ==================== Actions: 文件操作 ====================

  async function copyToContainer(
    containerId: string,
    source: string,
    target: string
  ): Promise<boolean> {
    try {
      const result = await window.api.sandbox.copyToContainer(containerId, source, target)

      if (result.success) {
        window.api.logger.info('[ContainerStore] 文件复制到容器成功', {
          containerId: containerId.substring(0, 12),
          source,
          target
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[ContainerStore] 复制文件到容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        source,
        target
      })
      return false
    }
  }

  async function copyFromContainer(
    containerId: string,
    source: string,
    target: string
  ): Promise<boolean> {
    try {
      const result = await window.api.sandbox.copyFromContainer(containerId, source, target)

      if (result.success) {
        window.api.logger.info('[ContainerStore] 文件从容器复制成功', {
          containerId: containerId.substring(0, 12),
          source,
          target
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[ContainerStore] 从容器复制文件失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        source,
        target
      })
      return false
    }
  }

  // ==================== Actions: 日志 ====================

  async function getContainerLogs(containerId: string, options?: LogOptions): Promise<string> {
    try {
      const result = await window.api.sandbox.getContainerLogs(containerId, options)
      if (!result.success) {
        notify.error('加载容器日志失败', result.error || '未知错误', {
          source: 'sandbox',
          dedupeKey: 'container-error'
        })
        return ''
      }

      return result.logs || ''
    } catch (error) {
      window.api.logger.error('[ContainerStore] 获取容器日志失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      notify.error('加载容器日志失败', error instanceof Error ? error.message : String(error), {
        source: 'sandbox',
        dedupeKey: 'container-error'
      })
      return ''
    }
  }

  // ==================== Helper Functions ====================

  function getStateLabel(state: ContainerState): string {
    const labels: Record<ContainerState, string> = {
      created: '已创建',
      running: '运行中',
      paused: '已暂停',
      restarting: '重启中',
      removing: '删除中',
      exited: '已停止',
      dead: '已终止'
    }
    return labels[state] || state
  }

  function getStateClass(state: ContainerState): string {
    return `state-${state}`
  }

  function formatCreated(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 30) return `${days}天前`
    return date.toLocaleDateString('zh-CN')
  }

  return {
    // State
    containers,
    selectedContainer,
    containerStats,
    containerFilter,
    containerSearchQuery,
    terminalLogs,
    isLoading,
    listUpdateKey,

    // Getters
    filteredContainers,
    runningContainerCount,
    stoppedContainerCount,

    // Actions: 容器列表
    loadContainers,
    refreshContainers,
    loadContainerDetails,
    loadContainerStats,
    clearContainerStats,
    setContainerFilter,
    setContainerSearchQuery,

    // Actions: 容器操作
    startContainer,
    stopContainer,
    restartContainer,
    removeContainer,

    // Actions: Compose 项目操作
    composeStop,
    composeStart,
    composeRestart,

    // Actions: 命令执行
    execCommand,
    clearTerminalLogs,

    // Actions: 文件操作
    copyToContainer,
    copyFromContainer,

    // Actions: 日志
    getContainerLogs,

    // Helper Functions
    getStateLabel,
    getStateClass,
    formatCreated
  }
})
