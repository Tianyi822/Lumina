import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/**
 * 配置相关的 API
 */
const configApi = {
  /**
   * 获取配置加载状态
   */
  getStatus: (): Promise<{
    loaded: boolean
    success: boolean
    error: string | null
    exists: boolean
  }> => {
    return ipcRenderer.invoke('config:getStatus')
  },

  /**
   * 获取配置
   */
  getConfig: (): Promise<unknown> => {
    return ipcRenderer.invoke('config:get')
  },

  /**
   * 获取配置加载结果
   */
  getLoadResult: (): Promise<{
    success: boolean
    config: unknown
    error?: string
  }> => {
    return ipcRenderer.invoke('config:getLoadResult')
  },

  /**
   * 保存配置
   */
  saveConfig: (config: unknown): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('config:save', config)
  },

  /**
   * 更新配置（部分更新）
   */
  updateConfig: (partialConfig: unknown): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke('config:update', partialConfig)
  },

  /**
   * 检查配置是否存在
   */
  exists: (): Promise<boolean> => {
    return ipcRenderer.invoke('config:exists')
  }
}

// 自定义渲染器 API
const api = {
  config: configApi
}

// 使用 `contextBridge` API 向渲染器暴露 Electron API
// 仅在启用了上下文隔离时使用，否则直接添加到 DOM 全局对象
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (在 dts 中定义)
  window.electron = electronAPI
  // @ts-ignore (在 dts 中定义)
  window.api = api
}
