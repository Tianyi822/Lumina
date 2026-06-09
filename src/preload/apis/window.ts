import { createIpcInvoker } from './base'
import { ipcRenderer } from 'electron'

/**
 * 窗口控制相关的 API
 * 提供窗口最小化、最大化、关闭、自定义标题栏和主题切换等功能
 */
export const windowApi = {
  ...createIpcInvoker<{
    /** 最小化窗口 */
    minimize: () => Promise<void>
    /** 最大化或还原窗口 */
    maximize: () => Promise<void>
    /** 关闭窗口 */
    close: () => Promise<void>
    /** 检查窗口是否处于最大化状态 */
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
