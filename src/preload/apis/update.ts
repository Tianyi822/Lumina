import { ipcRenderer } from 'electron'
import type { DownloadProgress, UpdateStatusEvent } from '@shared/types/update'
import type { UpdateApi } from '../types/update'

/**
 * 自动更新相关的 API
 */
export const updateApi: UpdateApi = {
  /** 检查新版本 */
  checkForUpdate: () => {
    return ipcRenderer.invoke('update:check')
  },
  /** 下载新版本 */
  downloadUpdate: () => {
    return ipcRenderer.invoke('update:download')
  },
  /** 退出应用并安装更新 */
  quitAndInstall: () => {
    ipcRenderer.send('update:install')
  },
  /** 获取版本发布历史 */
  getReleases: () => {
    return ipcRenderer.invoke('update:get-releases')
  },
  /** 监听更新状态变更事件 */
  onStatus: (callback: (event: UpdateStatusEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data as UpdateStatusEvent)
    }
    ipcRenderer.on('update:on-status', handler)
    return () => {
      ipcRenderer.removeListener('update:on-status', handler)
    }
  },
  /** 监听更新下载进度事件 */
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
