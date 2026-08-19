import { create } from 'zustand'
import { i18n } from '@renderer/i18n'
import type {
  UpdateStatus,
  DownloadProgress,
  ReleaseInfo,
  UpdateStatusEvent,
  UpdateDiagnosticCode
} from '@shared/types/update'

interface UpdateState {
  status: UpdateStatus
  progress: DownloadProgress | null
  latestVersion: string | null
  releases: ReleaseInfo[]
  loadingReleases: boolean
  releasesError: string | null
  errorMessage: string | null
  diagnosticCode: UpdateDiagnosticCode | null
  manualDownloadUrl: string | null

  clearError: () => void
  setupListeners: () => void
  cleanupListeners: () => void
  openManualDownload: () => Promise<void>
  checkForUpdate: () => Promise<void>
  checkForUpdateOnForeground: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => void
  fetchReleases: (currentVersion: string) => Promise<void>
}

/** 是否应在设置入口展示更新提示圆点 */
/** 判断是否有待处理的更新（显示小红点） */
export function hasPendingUpdateBadge(status: UpdateStatus): boolean {
  return status === 'available' || status === 'downloaded'
}

function applyCheckResult(
  result: Awaited<ReturnType<typeof window.api.update.checkForUpdate>>
): Partial<UpdateState> {
  const patch: Partial<UpdateState> = {}
  if (result.version) patch.latestVersion = result.version
  if (result.success && result.manualDownloadUrl) {
    patch.manualDownloadUrl = result.manualDownloadUrl
  }
  if (!result.success) {
    patch.status = 'error'
    patch.errorMessage =
      result.message || result.error || i18n.t('notifications.settings.update.checkFailed')
    patch.diagnosticCode = result.diagnosticCode || null
    patch.manualDownloadUrl = result.manualDownloadUrl || null
  }
  return patch
}

let unsubscribeStatus: (() => void) | null = null
let unsubscribeProgress: (() => void) | null = null
let updateListenersAttached = false

/**
 * 应用更新 Store
 * 管理自动更新的状态检查、下载、安装及相关事件监听
 */
export const useUpdateStore = create<UpdateState>()((set, get) => ({
  status: 'idle',
  progress: null,
  latestVersion: null,
  releases: [],
  loadingReleases: false,
  releasesError: null,
  errorMessage: null,
  diagnosticCode: null,
  manualDownloadUrl: null,

  clearError: () => set({ errorMessage: null, diagnosticCode: null, manualDownloadUrl: null }),

  /** 注册更新状态和进度监听器（仅注册一次） */
  setupListeners: () => {
    if (updateListenersAttached) return
    updateListenersAttached = true

    unsubscribeStatus = window.api.update.onStatus((event: UpdateStatusEvent) => {
      const patch: Partial<UpdateState> = { status: event.status }
      if (event.version) {
        patch.latestVersion = event.version
      }
      if (event.status === 'checking') {
        patch.errorMessage = null
        patch.diagnosticCode = null
        patch.manualDownloadUrl = null
        patch.progress = null
      }
      if (event.status === 'available') {
        patch.errorMessage = null
        patch.diagnosticCode = null
        patch.manualDownloadUrl = event.manualDownloadUrl || null
      }
      if (event.status === 'not-available' || event.status === 'installing') {
        patch.errorMessage = null
        patch.diagnosticCode = null
        patch.manualDownloadUrl = null
      }
      if (event.status === 'error') {
        patch.errorMessage = event.message || i18n.t('notifications.settings.update.checkFailed')
        patch.diagnosticCode = event.diagnosticCode || null
        patch.manualDownloadUrl = event.manualDownloadUrl || null
      }
      set(patch)
    })

    unsubscribeProgress = window.api.update.onProgress((data: DownloadProgress) => {
      set({ progress: data })
    })
  },

  /** 清理更新监听器 */
  cleanupListeners: () => {
    if (!updateListenersAttached) return
    updateListenersAttached = false
    unsubscribeStatus?.()
    unsubscribeProgress?.()
    unsubscribeStatus = null
    unsubscribeProgress = null
  },

  /** 在浏览器中打开手动下载页面 */
  openManualDownload: async () => {
    const url = get().manualDownloadUrl
    if (!url) return
    try {
      await window.api.window.openExternal(url)
    } catch {
      // 保留页面上的下载按钮供用户再次点击
    }
  },

  /** 主动检查更新 */
  checkForUpdate: async () => {
    set({ errorMessage: null, diagnosticCode: null, manualDownloadUrl: null, progress: null })
    const result = await window.api.update.checkForUpdate()
    set(applyCheckResult(result))
  },

  /** 前台检查更新（避免在检查/下载/安装中重复触发） */
  checkForUpdateOnForeground: async () => {
    const { status } = get()
    if (status === 'checking' || status === 'downloading' || status === 'installing') {
      return
    }

    const result = await window.api.update.checkForUpdate()
    set(applyCheckResult(result))
  },

  /** 下载更新 */
  downloadUpdate: async () => {
    set({ errorMessage: null, diagnosticCode: null, manualDownloadUrl: null })
    const result = await window.api.update.downloadUpdate()
    if (!result.success) {
      set({
        status: 'error',
        errorMessage: result.error || i18n.t('notifications.settings.update.downloadFailed')
      })
    }
  },

  /** 退出应用并安装更新 */
  quitAndInstall: () => {
    window.api.update.quitAndInstall()
  },

  /** 获取版本发布历史（只加载一次） */
  fetchReleases: async () => {
    const state = get()
    if (state.releases.length > 0) return

    set({ loadingReleases: true, releasesError: null })

    const result = await window.api.update.getReleases()
    if (result.success && result.data) {
      set({ releases: result.data })
    } else {
      set({ releasesError: result.error || i18n.t('notifications.settings.update.releasesFailed') })
    }

    set({ loadingReleases: false })
  }
}))
