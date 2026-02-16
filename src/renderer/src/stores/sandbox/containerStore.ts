import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  ContainerInfo,
  ContainerDetails,
  ContainerStats,
  ContainerFilter,
  ContainerState,
  TerminalLog,
  ExecCommand,
  LogOptions
} from '@shared/types/sandbox'

export const useContainerStore = defineStore('container', () => {
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
        resultType: typeof result,
        isArray: Array.isArray(result),
        length: Array.isArray(result) ? result.length : null,
        sample:
          Array.isArray(result) && result.length > 0
            ? JSON.stringify(result[0]).substring(0, 300)
            : null
      })

      containers.value = result

      window.api.logger.info('[ContainerStore] 容器列表加载完成', {
        count: containers.value.length
      })
    } catch (error) {
      window.api.logger.error('[ContainerStore] 加载容器列表失败', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      })
      containers.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function refreshContainers(): Promise<void> {
    await loadContainers()
    listUpdateKey.value++
  }

  async function loadContainerDetails(containerId: string): Promise<void> {
    try {
      selectedContainer.value = await window.api.sandbox.getContainerDetails(containerId)

      window.api.logger.info('[ContainerStore] 容器详情加载完成', {
        containerId: containerId.substring(0, 12)
      })
    } catch (error) {
      window.api.logger.error('[ContainerStore] 加载容器详情失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      selectedContainer.value = null
    }
  }

  async function loadContainerStats(containerId: string): Promise<void> {
    try {
      containerStats.value = await window.api.sandbox.getContainerStats(containerId)
    } catch (error) {
      window.api.logger.error('[ContainerStore] 加载容器统计失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      containerStats.value = null
    }
  }

  function setContainerFilter(filter: ContainerFilter): void {
    containerFilter.value = filter
  }

  function setContainerSearchQuery(query: string): void {
    containerSearchQuery.value = query
  }

  // ==================== Actions: 容器操作 ====================

  async function startContainer(containerId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.startContainer(containerId)

      if (result.success) {
        await refreshContainers()
        window.api.logger.info('[ContainerStore] 容器启动成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[ContainerStore] 启动容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  async function stopContainer(containerId: string, timeout?: number): Promise<boolean> {
    try {
      const result = await window.api.sandbox.stopContainer(containerId, timeout)

      if (result.success) {
        await refreshContainers()
        window.api.logger.info('[ContainerStore] 容器停止成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[ContainerStore] 停止容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  async function restartContainer(containerId: string): Promise<boolean> {
    try {
      const result = await window.api.sandbox.restartContainer(containerId)

      if (result.success) {
        await refreshContainers()
        window.api.logger.info('[ContainerStore] 容器重启成功', {
          containerId: containerId.substring(0, 12)
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[ContainerStore] 重启容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  }

  async function removeContainer(containerId: string, force?: boolean): Promise<boolean> {
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
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[ContainerStore] 删除容器失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
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

      terminalLogs.value.push({
        timestamp: new Date().toISOString(),
        type: result.exitCode === 0 ? 'output' : 'error',
        content: result.stdout || result.stderr || '命令执行完成'
      })

      return result
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
      return await window.api.sandbox.getContainerLogs(containerId, options)
    } catch (error) {
      window.api.logger.error('[ContainerStore] 获取容器日志失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
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
    setContainerFilter,
    setContainerSearchQuery,

    // Actions: 容器操作
    startContainer,
    stopContainer,
    restartContainer,
    removeContainer,

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
