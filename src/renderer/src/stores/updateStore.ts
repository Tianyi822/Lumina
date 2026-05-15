import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  UpdateStatus,
  DownloadProgress,
  ReleaseInfo,
  UpdateStatusEvent,
  UpdateDiagnosticCode
} from '@shared/types/update'

export const useUpdateStore = defineStore('update', () => {
  const status = ref<UpdateStatus>('idle')
  const progress = ref<DownloadProgress | null>(null)
  const latestVersion = ref<string | null>(null)
  const releases = ref<ReleaseInfo[]>([])
  const loadingReleases = ref(false)
  const releasesError = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  const diagnosticCode = ref<UpdateDiagnosticCode | null>(null)
  const manualDownloadUrl = ref<string | null>(null)

  let unsubscribeStatus: (() => void) | null = null
  let unsubscribeProgress: (() => void) | null = null

  function clearError(): void {
    errorMessage.value = null
    diagnosticCode.value = null
    manualDownloadUrl.value = null
  }

  function setupListeners(): void {
    unsubscribeStatus = window.api.update.onStatus((event: UpdateStatusEvent) => {
      status.value = event.status
      if (event.version) {
        latestVersion.value = event.version
      }
      if (event.status === 'checking') {
        clearError()
        progress.value = null
      }
      if (event.status === 'available' || event.status === 'not-available') {
        clearError()
      }
      if (event.status === 'error') {
        errorMessage.value = event.message || '检查更新失败，请稍后重试'
        diagnosticCode.value = event.diagnosticCode || null
        manualDownloadUrl.value = event.manualDownloadUrl || null
      }
    })

    unsubscribeProgress = window.api.update.onProgress((data: DownloadProgress) => {
      progress.value = data
    })
  }

  function cleanupListeners(): void {
    unsubscribeStatus?.()
    unsubscribeProgress?.()
  }

  async function checkForUpdate(): Promise<void> {
    clearError()
    progress.value = null
    const result = await window.api.update.checkForUpdate()
    if (result.version) {
      latestVersion.value = result.version
    }
    if (!result.success) {
      status.value = 'error'
      errorMessage.value = result.message || result.error || '检查更新失败，请稍后重试'
      diagnosticCode.value = result.diagnosticCode || null
      manualDownloadUrl.value = result.manualDownloadUrl || null
    }
  }

  async function downloadUpdate(): Promise<void> {
    clearError()
    const result = await window.api.update.downloadUpdate()
    if (!result.success) {
      status.value = 'error'
      errorMessage.value = result.error || '下载更新失败'
    }
  }

  function quitAndInstall(): void {
    window.api.update.quitAndInstall()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function fetchReleases(_currentVersion: string): Promise<void> {
    if (releases.value.length > 0) {
      return
    }

    loadingReleases.value = true
    releasesError.value = null

    const result = await window.api.update.getReleases()
    if (result.success && result.data) {
      releases.value = result.data
    } else {
      releasesError.value = result.error || '获取版本历史失败'
    }

    loadingReleases.value = false
  }

  return {
    status,
    progress,
    latestVersion,
    releases,
    loadingReleases,
    releasesError,
    errorMessage,
    diagnosticCode,
    manualDownloadUrl,
    setupListeners,
    cleanupListeners,
    checkForUpdate,
    downloadUpdate,
    quitAndInstall,
    fetchReleases
  }
})
