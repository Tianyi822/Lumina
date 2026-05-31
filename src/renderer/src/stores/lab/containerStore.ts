import { create } from 'zustand'
import type {
  ContainerFilter,
  ContainerState,
  TerminalLog,
  ExecCommand,
  LogOptions
} from '@renderer/types/lab'
import type { ContainerInfo, ContainerDetails, ContainerStats } from '@renderer/types/lab'
import { notifyError } from '@renderer/composables/notificationCore'
import { deepClone } from '@shared/utils'
import { labApi } from '@renderer/services/labApi'

interface ContainerStoreState {
  // State
  containers: ContainerInfo[]
  selectedContainer: ContainerDetails | null
  containerStats: ContainerStats | null
  containerFilter: ContainerFilter
  containerSearchQuery: string
  terminalLogs: TerminalLog[]
  isLoading: boolean
  listUpdateKey: number

  // Getters
  filteredContainers: () => ContainerInfo[]
  runningContainerCount: () => number
  stoppedContainerCount: () => number

  // Actions: 容器列表
  loadContainers: () => Promise<void>
  refreshContainers: () => Promise<void>
  loadContainerDetails: (containerId: string, options?: { silent?: boolean }) => Promise<boolean>
  loadContainerStats: (containerId: string, options?: { silent?: boolean }) => Promise<boolean>
  clearContainerStats: () => void
  setContainerFilter: (filter: ContainerFilter) => void
  setContainerSearchQuery: (query: string) => void

  // Actions: 容器操作
  startContainer: (containerId: string) => Promise<{ success: boolean; error?: string }>
  stopContainer: (
    containerId: string,
    timeout?: number
  ) => Promise<{ success: boolean; error?: string }>
  restartContainer: (containerId: string) => Promise<{ success: boolean; error?: string }>
  removeContainer: (
    containerId: string,
    force?: boolean
  ) => Promise<{ success: boolean; error?: string }>

  // Actions: Compose 项目操作
  composeStop: (
    projectName: string,
    timeout?: number
  ) => Promise<{ success: boolean; error?: string; stoppedContainerIds?: string[] }>
  composeStart: (
    projectName: string
  ) => Promise<{ success: boolean; error?: string; containerIds?: string[] }>
  composeRestart: (projectName: string) => Promise<{ success: boolean; error?: string }>

  // Actions: 命令执行
  execCommand: (
    containerId: string,
    command: ExecCommand
  ) => Promise<{
    exitCode: number
    stdout: string
    stderr: string
    duration: number
  } | null>
  clearTerminalLogs: () => void

  // Actions: 文件操作
  copyToContainer: (containerId: string, source: string, target: string) => Promise<boolean>
  copyFromContainer: (containerId: string, source: string, target: string) => Promise<boolean>

  // Actions: 日志
  getContainerLogs: (containerId: string, options?: LogOptions) => Promise<string>

  // Helper Functions
  getStateLabel: (state: ContainerState) => string
  getStateClass: (state: ContainerState) => string
  formatCreated: (timestamp: number) => string
}

// 并发控制变量（闭包内，非 state）
let latestStatsRequestId = 0

export const useContainerStore = create<ContainerStoreState>()((set, get) => ({
  // ==================== State ====================
  containers: [],
  selectedContainer: null,
  containerStats: null,
  containerFilter: { state: 'all' },
  containerSearchQuery: '',
  terminalLogs: [],
  isLoading: false,
  listUpdateKey: 0,

  // ==================== Getters ====================

  /** 过滤后的容器列表 */
  filteredContainers: (): ContainerInfo[] => {
    let result = get().containers

    const filter = get().containerFilter
    if (filter.state && filter.state !== 'all') {
      if (filter.state === 'running') {
        result = result.filter((c) => c.state === 'running')
      } else if (filter.state === 'stopped') {
        result = result.filter((c) => c.state === 'exited' || c.state === 'dead')
      } else {
        result = result.filter((c) => c.state === filter.state)
      }
    }

    const query = get().containerSearchQuery.trim()
    if (query) {
      const lowerQuery = query.toLowerCase()
      result = result.filter(
        (c) =>
          c.names.some((n) => n.toLowerCase().includes(lowerQuery)) ||
          c.image.toLowerCase().includes(lowerQuery)
      )
    }

    return result
  },

  /** 运行中的容器数量 */
  runningContainerCount: (): number => {
    return get().containers.filter((c) => c.state === 'running').length
  },

  /** 已停止的容器数量 */
  stoppedContainerCount: (): number => {
    return get().containers.filter((c) => c.state === 'exited' || c.state === 'dead').length
  },

  // ==================== Actions: 容器列表 ====================

  loadContainers: async (): Promise<void> => {
    try {
      set({ isLoading: true })
      // 将对象转换为普通对象，避免 IPC 序列化错误
      const filter = deepClone(get().containerFilter)
      window.api.logger.info('[ContainerStore] 开始加载容器列表', { filter })

      const result = await labApi.listContainers(filter)
      window.api.logger.info('[ContainerStore] IPC 返回结果', {
        success: result.success,
        length: result.containers?.length || 0,
        sample:
          result.containers && result.containers.length > 0
            ? JSON.stringify(result.containers[0]).substring(0, 300)
            : null
      })

      if (!result.success) {
        set({ containers: [] })
        notifyError('加载容器列表失败', result.error || '未知错误', {
          source: 'lab',
          dedupeKey: 'container-error'
        })
        return
      }

      const containers = result.containers || []
      set({ containers })
      window.api.logger.info('[ContainerStore] 容器列表加载完成', {
        count: containers.length
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[ContainerStore] 加载容器列表失败', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      })
      set({ containers: [] })
      notifyError('加载容器列表失败', errorMessage, {
        source: 'lab',
        dedupeKey: 'container-error'
      })
    } finally {
      set({ isLoading: false })
    }
  },

  refreshContainers: async (): Promise<void> => {
    await get().loadContainers()
    set((state) => ({ listUpdateKey: state.listUpdateKey + 1 }))
  },

  loadContainerDetails: async (
    containerId: string,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    try {
      const result = await labApi.getContainerDetails(containerId)

      if (!result.success) {
        const currentSelected = get().selectedContainer
        if (result.reason === 'not_found' || currentSelected?.id !== containerId) {
          set({ selectedContainer: null })
        }
        if (!options?.silent) {
          notifyError('加载容器详情失败', result.error || '未知错误', {
            source: 'lab',
            dedupeKey: 'container-error'
          })
        }
        return false
      }

      set({ selectedContainer: result.details || null })

      if (!options?.silent) {
        window.api.logger.info('[ContainerStore] 容器详情加载完成', {
          containerId: containerId.substring(0, 12)
        })
      }
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (!options?.silent) {
        window.api.logger.error('[ContainerStore] 加载容器详情失败', {
          error: errorMessage,
          containerId
        })
      }
      const currentSelected = get().selectedContainer
      if (currentSelected?.id !== containerId) {
        set({ selectedContainer: null })
      }
      if (!options?.silent) {
        notifyError('加载容器详情失败', errorMessage, {
          source: 'lab',
          dedupeKey: 'container-error'
        })
      }
      return false
    }
  },

  loadContainerStats: async (
    containerId: string,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    const requestId = ++latestStatsRequestId

    try {
      const result = await labApi.getContainerStats(containerId)
      if (requestId !== latestStatsRequestId) {
        return false
      }

      if (!result.success) {
        set({ containerStats: null })
        if (!options?.silent) {
          notifyError('加载容器统计失败', result.error || '未知错误', {
            source: 'lab',
            dedupeKey: 'container-error'
          })
        }
        return false
      }

      set({ containerStats: result.stats || null })
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
      set({ containerStats: null })
      if (!options?.silent) {
        notifyError('加载容器统计失败', errorMessage, {
          source: 'lab',
          dedupeKey: 'container-error'
        })
      }
      return false
    }
  },

  clearContainerStats: (): void => {
    latestStatsRequestId++
    set({ containerStats: null })
  },

  setContainerFilter: (filter: ContainerFilter): void => {
    set({ containerFilter: filter })
  },

  setContainerSearchQuery: (query: string): void => {
    set({ containerSearchQuery: query })
  },

  // ==================== Actions: 容器操作 ====================

  startContainer: async (containerId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await labApi.startContainer(containerId)

      if (result.success) {
        await get().refreshContainers()
        // 如果当前有选中的容器，刷新其详情
        if (get().selectedContainer?.id === containerId) {
          await get().loadContainerDetails(containerId)
          // 同时刷新容器统计
          await get().loadContainerStats(containerId)
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
  },

  stopContainer: async (
    containerId: string,
    timeout?: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await labApi.stopContainer(containerId, timeout)

      if (result.success) {
        await get().refreshContainers()
        // 如果当前有选中的容器，刷新其详情
        if (get().selectedContainer?.id === containerId) {
          await get().loadContainerDetails(containerId)
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
  },

  restartContainer: async (containerId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await labApi.restartContainer(containerId)

      if (result.success) {
        await get().refreshContainers()
        // 如果当前有选中的容器，刷新其详情
        if (get().selectedContainer?.id === containerId) {
          await get().loadContainerDetails(containerId)
          // 同时刷新容器统计
          await get().loadContainerStats(containerId)
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
  },

  removeContainer: async (
    containerId: string,
    force?: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await labApi.removeContainer(containerId, force)

      if (result.success) {
        await get().refreshContainers()
        if (get().selectedContainer?.id === containerId) {
          set({ selectedContainer: null })
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
  },

  // ==================== Actions: Compose 项目操作 ====================

  composeStop: async (
    projectName: string,
    timeout?: number
  ): Promise<{ success: boolean; error?: string; stoppedContainerIds?: string[] }> => {
    try {
      const result = await labApi.compose.stop(projectName, { timeout })

      if (result.success) {
        await get().refreshContainers()
        // 如果当前有选中的容器属于该项目，刷新其详情
        const selected = get().selectedContainer
        if (selected) {
          const composeProjectLabel = selected.labels?.['com.docker.compose.project']
          if (composeProjectLabel === projectName) {
            await get().loadContainerDetails(selected.id)
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
  },

  composeStart: async (
    projectName: string
  ): Promise<{ success: boolean; error?: string; containerIds?: string[] }> => {
    try {
      const result = await labApi.compose.start(projectName)

      if (result.success) {
        await get().refreshContainers()
        // 如果当前有选中的容器属于该项目，刷新其详情
        const selected = get().selectedContainer
        if (selected) {
          const composeProjectLabel = selected.labels?.['com.docker.compose.project']
          if (composeProjectLabel === projectName) {
            await get().loadContainerDetails(selected.id)
            await get().loadContainerStats(selected.id)
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
  },

  composeRestart: async (projectName: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await labApi.compose.restart(projectName)

      if (result.success) {
        await get().refreshContainers()
        // 如果当前有选中的容器属于该项目，刷新其详情
        const selected = get().selectedContainer
        if (selected) {
          const composeProjectLabel = selected.labels?.['com.docker.compose.project']
          if (composeProjectLabel === projectName) {
            await get().loadContainerDetails(selected.id)
            await get().loadContainerStats(selected.id)
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
  },

  // ==================== Actions: 命令执行 ====================

  execCommand: async (
    containerId: string,
    command: ExecCommand
  ): Promise<{
    exitCode: number
    stdout: string
    stderr: string
    duration: number
  } | null> => {
    try {
      set((state) => ({
        terminalLogs: [
          ...state.terminalLogs,
          {
            timestamp: new Date().toISOString(),
            type: 'input' as const,
            content: command.command
          }
        ]
      }))

      const result = await labApi.execCommand(containerId, command)

      if (!result.success || !result.result) {
        const errorMessage = result.error || '命令执行失败'
        notifyError('执行命令失败', errorMessage, {
          source: 'lab',
          dedupeKey: 'container-error'
        })
        set((state) => ({
          terminalLogs: [
            ...state.terminalLogs,
            {
              timestamp: new Date().toISOString(),
              type: 'error' as const,
              content: errorMessage
            }
          ]
        }))
        return null
      }

      set((state) => ({
        terminalLogs: [
          ...state.terminalLogs,
          {
            timestamp: new Date().toISOString(),
            type: result.result!.exitCode === 0 ? ('output' as const) : ('error' as const),
            content: result.result!.stdout || result.result!.stderr || '命令执行完成'
          }
        ]
      }))

      return result.result
    } catch (error) {
      window.api.logger.error('[ContainerStore] 执行命令失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        command: command.command
      })

      set((state) => ({
        terminalLogs: [
          ...state.terminalLogs,
          {
            timestamp: new Date().toISOString(),
            type: 'error' as const,
            content: error instanceof Error ? error.message : String(error)
          }
        ]
      }))

      return null
    }
  },

  clearTerminalLogs: (): void => {
    set({ terminalLogs: [] })
  },

  // ==================== Actions: 文件操作 ====================

  copyToContainer: async (
    containerId: string,
    source: string,
    target: string
  ): Promise<boolean> => {
    try {
      const result = await labApi.copyToContainer(containerId, source, target)

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
  },

  copyFromContainer: async (
    containerId: string,
    source: string,
    target: string
  ): Promise<boolean> => {
    try {
      const result = await labApi.copyFromContainer(containerId, source, target)

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
  },

  // ==================== Actions: 日志 ====================

  getContainerLogs: async (containerId: string, options?: LogOptions): Promise<string> => {
    try {
      const result = await labApi.getContainerLogs(containerId, options)
      if (!result.success) {
        notifyError('加载容器日志失败', result.error || '未知错误', {
          source: 'lab',
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
      notifyError('加载容器日志失败', error instanceof Error ? error.message : String(error), {
        source: 'lab',
        dedupeKey: 'container-error'
      })
      return ''
    }
  },

  // ==================== Helper Functions ====================

  getStateLabel: (state: ContainerState): string => {
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
  },

  getStateClass: (state: ContainerState): string => {
    return `state-${state}`
  },

  formatCreated: (timestamp: number): string => {
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
}))
