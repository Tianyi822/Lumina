import { ipcRenderer } from 'electron'

/**
 * 配置状态类型
 */
export interface ConfigStatus {
  loaded: boolean
  success: boolean
  error: string | null
  exists: boolean
}

/**
 * 配置加载结果类型
 */
export interface ConfigLoadResult {
  success: boolean
  config: unknown
  error?: string
}

/**
 * 配置保存/更新结果类型
 */
export interface ConfigResult {
  success: boolean
  error?: string
}

/**
 * 配置相关的 API
 */
export const configApi = {
  /**
   * 获取配置加载状态
   */
  getStatus: (): Promise<ConfigStatus> => {
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
  getLoadResult: (): Promise<ConfigLoadResult> => {
    return ipcRenderer.invoke('config:getLoadResult')
  },

  /**
   * 保存配置
   */
  saveConfig: (config: unknown): Promise<ConfigResult> => {
    return ipcRenderer.invoke('config:save', config)
  },

  /**
   * 更新配置（部分更新）
   */
  updateConfig: (partialConfig: unknown): Promise<ConfigResult> => {
    return ipcRenderer.invoke('config:update', partialConfig)
  },

  /**
   * 检查配置是否存在
   */
  exists: (): Promise<boolean> => {
    return ipcRenderer.invoke('config:exists')
  }
}
