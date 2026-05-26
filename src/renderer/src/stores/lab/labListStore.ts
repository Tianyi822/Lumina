import { create } from 'zustand'
import type {
  LabData,
  LabListItem,
  LabLogEntry,
  LabTemplate,
  LabSelection,
  LabContainerStatus
} from '@renderer/types/lab'
import { labApi } from '@renderer/services/labApi'

interface LabListState {
  currentLab: LabData | null
  labList: LabListItem[]
  operationLogs: LabLogEntry[]
  isLoading: boolean
  listUpdateKey: number
  templates: LabTemplate[]
  templatesLoading: boolean
  currentSessionLab: LabSelection | null
  labContainerStatus: Record<string, LabContainerStatus>

  // Getters
  currentLabId: () => string | null
  labCount: () => number

  // Actions
  loadLabList: () => Promise<void>
  refreshLabList: () => Promise<void>
  loadLab: (labId: string, force?: boolean, options?: { silent?: boolean }) => Promise<boolean>
  loadLabOperationLogs: (labId: string) => Promise<void>
  loadTemplates: () => Promise<void>
  selectLabForSession: (containerId: string, sessionId?: string) => Promise<boolean>
  deselectLab: (containerId: string) => Promise<boolean>
  getSessionLab: (sessionId: string) => Promise<LabSelection | null>
  checkContainerStatus: (labId: string) => Promise<LabContainerStatus | null>
  checkAllContainerStatus: () => Promise<void>
  clearCurrentLabState: () => void
  removeLabStatus: (labId: string) => void
}

// 并发控制变量（闭包内，非 state）
let loadLabVersion = 0

export const useLabListStore = create<LabListState>()((set, get) => ({
  currentLab: null,
  labList: [],
  operationLogs: [],
  isLoading: false,
  listUpdateKey: 0,
  templates: [],
  templatesLoading: false,
  currentSessionLab: null,
  labContainerStatus: {},

  // Getters
  currentLabId: () => get().currentLab?.labId ?? null,
  labCount: () => get().labList.length,

  loadLabList: async (): Promise<void> => {
    try {
      set({ isLoading: true })
      const labList = await labApi.listLabs()
      set({ labList })

      window.api.logger.info('[LabListStore] 实验室列表加载完成', {
        count: labList.length
      })
    } catch (error) {
      window.api.logger.error('[LabListStore] 加载实验室列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      set({ isLoading: false })
    }
  },

  refreshLabList: async (): Promise<void> => {
    await get().loadLabList()
    set((state) => ({ listUpdateKey: state.listUpdateKey + 1 }))
  },

  loadLab: async (
    labId: string,
    force: boolean = false,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    const { currentLab } = get()
    if (!force && currentLab?.labId === labId) {
      return true
    }

    const version = ++loadLabVersion

    try {
      if (!options?.silent) {
        set({ isLoading: true })
      }

      const lab = await labApi.loadLabResolved(labId)
      if (!lab) {
        return false
      }

      if (version !== loadLabVersion) {
        return true
      }

      set({ currentLab: lab })
      await get().loadLabOperationLogs(labId)

      // 动态导入 containerStore 避免循环依赖
      const { useContainerStore } = await import('./containerStore')
      const containerStore = useContainerStore.getState()
      const containerId = lab.primaryContainerId || lab.containerIds?.[0]
      if (containerId) {
        await containerStore.loadContainerDetails(containerId, {
          silent: options?.silent
        })
      }

      if (!options?.silent) {
        window.api.logger.info('[LabListStore] 实验室加载成功', {
          labId,
          name: lab.name,
          containerId: containerId || 'none'
        })
      }

      return true
    } catch (error) {
      if (!options?.silent) {
        window.api.logger.error('[LabListStore] 加载实验室失败', {
          error: error instanceof Error ? error.message : String(error),
          labId
        })
      }
      return false
    } finally {
      if (!options?.silent) {
        set({ isLoading: false })
      }
    }
  },

  loadLabOperationLogs: async (labId: string): Promise<void> => {
    try {
      const operationLogs = await labApi.readLabLog(labId)
      set({ operationLogs })
    } catch (error) {
      window.api.logger.error('[LabListStore] 加载操作日志失败', {
        error: error instanceof Error ? error.message : String(error),
        labId
      })
      set({ operationLogs: [] })
    }
  },

  loadTemplates: async (): Promise<void> => {
    try {
      set({ templatesLoading: true })
      const templates = await labApi.listTemplates()
      set({ templates })

      window.api.logger.info('[LabListStore] 模板列表加载完成', {
        count: templates.length
      })
    } catch (error) {
      window.api.logger.error('[LabListStore] 加载模板列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      set({ templates: [] })
    } finally {
      set({ templatesLoading: false })
    }
  },

  selectLabForSession: async (containerId: string, sessionId?: string): Promise<boolean> => {
    try {
      const result = await labApi.selectLab(containerId, sessionId)

      if (result.success) {
        const { useContainerStore } = await import('./containerStore')
        const containerStore = useContainerStore.getState()
        const container = containerStore.containers.find((item) => item.id === containerId)
        if (container) {
          set({
            currentSessionLab: {
              containerId,
              containerName: container.names[0] || containerId.substring(0, 12),
              image: container.image,
              selectedAt: new Date().toISOString(),
              sessionId
            }
          })
        }

        window.api.logger.info('[LabListStore] 选择实验室成功', {
          containerId: containerId.substring(0, 12),
          sessionId
        })
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[LabListStore] 选择实验室失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId,
        sessionId
      })
      return false
    }
  },

  deselectLab: async (containerId: string): Promise<boolean> => {
    try {
      const result = await labApi.deselectLab(containerId)

      if (result.success) {
        const { currentSessionLab } = get()
        if (currentSessionLab?.containerId === containerId) {
          set({ currentSessionLab: null })
        }
      }

      return result.success
    } catch (error) {
      window.api.logger.error('[LabListStore] 取消选择实验室失败', {
        error: error instanceof Error ? error.message : String(error),
        containerId
      })
      return false
    }
  },

  getSessionLab: async (sessionId: string): Promise<LabSelection | null> => {
    try {
      return await labApi.getSessionLab(sessionId)
    } catch (error) {
      window.api.logger.error('[LabListStore] 获取会话实验室失败', {
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return null
    }
  },

  checkContainerStatus: async (labId: string): Promise<LabContainerStatus | null> => {
    try {
      const status = await labApi.checkContainerStatus(labId)
      if (status) {
        set((state) => ({
          labContainerStatus: { ...state.labContainerStatus, [labId]: status }
        }))
      }
      return status
    } catch (error) {
      window.api.logger.error('[LabListStore] 检查容器状态失败', {
        error: error instanceof Error ? error.message : String(error),
        labId
      })
      return null
    }
  },

  checkAllContainerStatus: async (): Promise<void> => {
    try {
      const statuses = await labApi.checkAllContainerStatus()
      const statusMap: Record<string, LabContainerStatus> = {}
      for (const status of statuses) {
        statusMap[status.labId] = status
      }
      set((state) => ({ labContainerStatus: { ...state.labContainerStatus, ...statusMap } }))

      window.api.logger.info('[LabListStore] 批量检查容器状态完成', {
        count: statuses.length
      })
    } catch (error) {
      window.api.logger.error('[LabListStore] 批量检查容器状态失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  clearCurrentLabState: (): void => {
    set({ currentLab: null, operationLogs: [] })
  },

  removeLabStatus: (labId: string): void => {
    set((state) => {
      const rest = { ...state.labContainerStatus }
      delete rest[labId]
      return { labContainerStatus: rest }
    })
  }
}))
