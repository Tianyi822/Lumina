import { ipcRenderer } from 'electron'
import type { DownloadProgress, UpdateStatusEvent } from '@shared/types/update'
import type { UpdateApi } from '../types/update'

export const updateApi: UpdateApi = {
  checkForUpdate: () => {
    return ipcRenderer.invoke('update:check')
  },
  downloadUpdate: () => {
    return ipcRenderer.invoke('update:download')
  },
  quitAndInstall: () => {
    ipcRenderer.send('update:install')
  },
  getReleases: () => {
    return ipcRenderer.invoke('update:get-releases')
  },
  onStatus: (callback: (event: UpdateStatusEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data as UpdateStatusEvent)
    }
    ipcRenderer.on('update:on-status', handler)
    return () => {
      ipcRenderer.removeListener('update:on-status', handler)
    }
  },
  onProgress: (callback: (progress: DownloadProgress) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data as DownloadProgress)
    }
    ipcRenderer.on('update:on-progress', handler)
    return () => {
      ipcRenderer.removeListener('update:on-progress', handler)
    }
  }
}
