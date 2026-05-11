import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  UpdateStatus,
  DownloadProgress,
  ReleaseInfo,
  UpdateStatusEvent
} from '@shared/types/update'

export const useUpdateStore = defineStore('update', () => {
  const status = ref<UpdateStatus>('idle')
  const progress = ref<DownloadProgress | null>(null)
  const latestVersion = ref<string | null>(null)
  const releases = ref<ReleaseInfo[]>([])
  const loadingReleases = ref(false)
  const releasesError = ref<string | null>(null)

  let unsubscribeStatus: (() => void) | null = null
  let unsubscribeProgress: (() => void) | null = null

  function setupListeners(): void {
    unsubscribeStatus = window.api.update.onStatus((event: UpdateStatusEvent) => {
      status.value = event.status
      if (event.version) {
        latestVersion.value = event.version
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
    const result = await window.api.update.checkForUpdate()
    if (result.success && result.version) {
      latestVersion.value = result.version
    }
  }

  async function downloadUpdate(): Promise<void> {
    await window.api.update.downloadUpdate()
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
    setupListeners,
    cleanupListeners,
    checkForUpdate,
    downloadUpdate,
    quitAndInstall,
    fetchReleases
  }
})
