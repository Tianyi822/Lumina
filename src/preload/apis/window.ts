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
   * 设置 Electron 原生主题
   */
  setNativeTheme: (themeSource: 'dark' | 'light' | 'system'): Promise<void> => {
    return ipcRenderer.invoke('window:setNativeTheme', themeSource)
  },

  /**
   * 获取当前系统主题
   */
  getSystemTheme: (): Promise<'dark' | 'light'> => {
    return ipcRenderer.invoke('window:getSystemTheme')
  },

  /**
   * 使用系统默认浏览器打开外部链接
   */
  openExternal: (url: string): Promise<void> => {
    return ipcRenderer.invoke('window:openExternal', url)
  },

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
  },

  /**
   * 监听系统主题变化
   */
  onSystemThemeChanged: (callback: (theme: 'dark' | 'light') => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, theme: 'dark' | 'light'): void => {
      callback(theme)
    }
    ipcRenderer.on('window:system-theme-changed', listener)
    return () => {
      ipcRenderer.removeListener('window:system-theme-changed', listener)
    }
  }
}
