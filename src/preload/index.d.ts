import { ElectronAPI } from '@electron-toolkit/preload'

/**
 * 配置加载状态
 */
interface ConfigStatus {
  loaded: boolean
  success: boolean
  error: string | null
  exists: boolean
}

/**
 * 配置加载结果
 */
interface ConfigLoadResult {
  success: boolean
  config: unknown
  error?: string
}

/**
 * 保存/更新结果
 */
interface ConfigSaveResult {
  success: boolean
  error?: string
}

/**
 * 配置 API
 */
interface ConfigApi {
  getStatus: () => Promise<ConfigStatus>
  getConfig: () => Promise<unknown>
  getLoadResult: () => Promise<ConfigLoadResult>
  saveConfig: (config: unknown) => Promise<ConfigSaveResult>
  updateConfig: (partialConfig: unknown) => Promise<ConfigSaveResult>
  exists: () => Promise<boolean>
}

/**
 * 自定义 API
 */
interface CustomApi {
  config: ConfigApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomApi
  }
}
