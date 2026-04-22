import { ipcRenderer } from 'electron'

/**
 * 配置加载的状态
 */
export interface ConfigStatus {
  loaded: boolean
  success: boolean
  error: string | null
  exists: boolean
}

/**
 * 配置加载的结果
 */
export interface ConfigLoadResult {
  success: boolean
  config: unknown
  error?: string
}

/**
 * 配置保存或更新的结果
 */
export interface ConfigResult {
  success: boolean
  error?: string
}

/**
 * 对话模型连接测试的结果
 */
export interface ModelConnectionTestResult {
  success: boolean
  error?: string
}

/**
 * 配置相关的 API
 */
export const configApi = {
  /**
   * 获取配置加载的状态
   */
  getStatus: (): Promise<ConfigStatus> => {
    return ipcRenderer.invoke('config:getStatus')
  },

  /**
   * 获取配置数据
   */
  getConfig: (): Promise<unknown> => {
    return ipcRenderer.invoke('config:get')
  },

  /**
   * 获取配置加载的结果
   */
  getLoadResult: (): Promise<ConfigLoadResult> => {
    return ipcRenderer.invoke('config:getLoadResult')
  },

  /**
   * 保存完整的配置
   */
  saveConfig: (config: unknown): Promise<ConfigResult> => {
    return ipcRenderer.invoke('config:save', config)
  },

  /**
   * 更新部分配置
   */
  updateConfig: (partialConfig: unknown): Promise<ConfigResult> => {
    return ipcRenderer.invoke('config:update', partialConfig)
  },

  /**
   * 检查配置文件是否存在
   */
  exists: (): Promise<boolean> => {
    return ipcRenderer.invoke('config:exists')
  },

  /**
   * 测试对话模型连接
   */
  testModelConnection: (config: unknown): Promise<ModelConnectionTestResult> => {
    return ipcRenderer.invoke('config:testModelConnection', config)
  }
}
