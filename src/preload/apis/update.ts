import { ipcRenderer } from 'electron'
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
  onStatus: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
      callback(data as Parameters<typeof callback>[0])
    }
    ipcRenderer.on('update:on-status', handler)
    return () => {
      ipcRenderer.removeListener('update:on-status', handler)
    }
  },
  onProgress: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
      callback(data as Parameters<typeof callback>[0])
    }
    ipcRenderer.on('update:on-progress', handler)
    return () => {
      ipcRenderer.removeListener('update:on-progress', handler)
    }
  }
}
