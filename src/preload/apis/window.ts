import { createIpcInvoker } from './base'
import { ipcRenderer } from 'electron'

/**
 * 窗口控制相关的 API
 */
export const windowApi = {
  ...createIpcInvoker<{
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }>('window', ['minimize', 'maximize', 'close', 'isMaximized']),

  /**
   * 监听窗口最大化状态的变化
   */
  onMaximizedChanged: (callback: (isMaximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, isMaximized: boolean): void => {
      callback(isMaximized)
    }
    ipcRenderer.on('window:maximized-changed', listener)
    return () => {
      ipcRenderer.removeListener('window:maximized-changed', listener)
    }
  }
}
