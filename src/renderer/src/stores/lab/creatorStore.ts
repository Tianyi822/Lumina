import { create } from 'zustand'
import type { CreateLabRequest, CreateLabResult } from '@renderer/types/lab'
import { notifySuccess, notifyError } from '@renderer/composables/notificationCore'
import { useLabStore } from './labStore'
import { useUIStateStore, type LabDetailTab } from '../uiStateStore'
import type { LabCreateType, CreatePhase } from './types'

// ==================== 类型定义 ====================

interface SshConfig {
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password: string
  keyContent: string
  keyName: string
}

interface CreatorState {
  // 创建类型
  createType: LabCreateType

  // SSH 创建配置
  sshConfig: SshConfig

  // 创建状态跟踪
  isCreating: boolean
  createError: string | null
  createPhase: CreatePhase

  // ==================== Actions ====================

  // 创建类型
  setCreateType: (type: LabCreateType) => void

  // SSH 配置
  resetSshConfig: () => void
  updateSshConfig: (partial: Partial<SshConfig>) => void

  // 创建实验室
  handleCreate: () => Promise<boolean>

  // 重置
  reset: () => void
  clearCreateError: () => void

  // ==================== Getters ====================

  getCanCreate: () => boolean
  getCreatePhaseText: () => string
  getCreateProgress: () => number
}

const defaultSshConfig: SshConfig = {
  host: '',
  port: 22,
  username: '',
  authType: 'password',
  password: '',
  keyContent: '',
  keyName: ''
}

export const useLabCreatorStore = create<CreatorState>()((set, get) => ({
  // ==================== 初始状态 ====================

  createType: 'ssh',
  sshConfig: { ...defaultSshConfig },
  isCreating: false,
  createError: null,
  createPhase: 'idle',

  // ==================== 创建类型 ====================

  setCreateType: (type) => {
    set({ createType: type })
  },

  // ==================== SSH 配置 ====================

  resetSshConfig: () => set({ sshConfig: { ...defaultSshConfig } }),

  updateSshConfig: (partial) => set((state) => ({ sshConfig: { ...state.sshConfig, ...partial } })),

  // ==================== 统一创建入口 ====================

  handleCreate: async () => {
    const labStore = useLabStore.getState()
    const uiStateStore = useUIStateStore.getState()
    const { sshConfig } = get()

    set({ isCreating: true, createError: null, createPhase: 'metadata' })

    try {
      const labResult = await labStore.createLab({
        name: `${sshConfig.username}@${sshConfig.host}`,
        creationType: 'ssh',
        sshHost: sshConfig.host,
        sshPort: sshConfig.port,
        sshUsername: sshConfig.username,
        sshAuthType: sshConfig.authType,
        sshKeyName: sshConfig.authType === 'key' ? sshConfig.keyName : undefined
      })

      if (!labResult?.success || !labResult.lab?.labId) {
        set({ isCreating: false, createPhase: 'idle' })
        return false
      }

      set({ createPhase: 'done' })

      const connected = await labStore.connectSsh(labResult.lab.labId, {
        host: sshConfig.host,
        port: sshConfig.port,
        username: sshConfig.username,
        authType: sshConfig.authType,
        password: sshConfig.authType === 'password' ? sshConfig.password : undefined,
        keyName: sshConfig.authType === 'key' ? sshConfig.keyName : undefined,
        keyContent: sshConfig.authType === 'key' ? sshConfig.keyContent : undefined
      })

      if (connected) {
        notifySuccess('SSH 实验室已创建', `已连接到 ${sshConfig.host}`, { source: 'lab' })
      }

      // 加载实验室详情
      await labStore.loadLab(labResult.lab.labId, true, { silent: true })
      uiStateStore.setLastLabId(labResult.lab.labId)
      uiStateStore.setLabDetailTab((connected ? 'terminal' : 'stats') as LabDetailTab, labResult.lab.labId)
      uiStateStore.closeLabCreator()
      get().reset()
      return true
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      set({ createError: errorMsg, createPhase: 'idle', isCreating: false })
      notifyError('创建失败', errorMsg, { source: 'lab' })
      return false
    } finally {
      setTimeout(() => {
        if (get().createPhase === 'done') {
          set({ createPhase: 'idle', isCreating: false })
        }
      }, 1000)
    }
  },

  // ==================== 重置 ====================

  reset: () => {
    set({
      createType: 'ssh',
      isCreating: false,
      createError: null,
      createPhase: 'idle',
      sshConfig: { ...defaultSshConfig }
    })
  },

  clearCreateError: () => set({ createError: null, createPhase: 'idle' }),

  // ==================== Getters ====================

  getCanCreate: () => {
    const { sshConfig } = get()
    const hasCredentials =
      sshConfig.authType === 'password'
        ? sshConfig.password.trim().length > 0
        : sshConfig.keyContent.trim().length > 0 && sshConfig.keyName.trim().length > 0
    return (
      sshConfig.host.trim().length > 0 && sshConfig.username.trim().length > 0 && hasCredentials
    )
  },

  getCreatePhaseText: () => {
    switch (get().createPhase) {
      case 'metadata':
        return '创建实验室元数据...'
      case 'done':
        return '创建完成'
      default:
        return ''
    }
  },

  getCreateProgress: () => {
    switch (get().createPhase) {
      case 'metadata':
        return 50
      case 'done':
        return 100
      default:
        return 0
    }
  }
}))
