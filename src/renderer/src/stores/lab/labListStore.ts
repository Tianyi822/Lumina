import { create } from 'zustand'
import type { LabData, LabListItem, LabLogEntry } from '@renderer/types/lab'
import { labApi } from '@renderer/services/labApi'

interface LabListState {
  currentLab: LabData | null
  labList: LabListItem[]
  operationLogs: LabLogEntry[]
  isLoading: boolean
  listUpdateKey: number

  // Getters
  currentLabId: () => string | null
  labCount: () => number

  // Actions
  loadLabList: () => Promise<void>
  refreshLabList: () => Promise<void>
  loadLab: (labId: string, force?: boolean, options?: { silent?: boolean }) => Promise<boolean>
  loadLabOperationLogs: (labId: string) => Promise<void>
  clearCurrentLabState: () => void
}

// 并发控制变量（闭包内，非 state）
let loadLabVersion = 0

export const useLabListStore = create<LabListState>()((set, get) => ({
  currentLab: null,
  labList: [],
  operationLogs: [],
  isLoading: false,
  listUpdateKey: 0,

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

      const lab = await labApi.loadLab(labId)
      if (!lab) {
        return false
      }

      if (version !== loadLabVersion) {
        return true
      }

      set({ currentLab: lab })
      await get().loadLabOperationLogs(labId)

      if (!options?.silent) {
        window.api.logger.info('[LabListStore] 实验室加载成功', {
          labId,
          name: lab.name
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

  clearCurrentLabState: (): void => {
    set({ currentLab: null, operationLogs: [] })
  }
}))
