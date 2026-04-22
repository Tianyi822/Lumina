/**
 * 配置加载的状态信息
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
export interface ConfigSaveResult {
  success: boolean
  error?: string
}

/**
 * 对话模型连接测试结果
 */
export interface ModelConnectionTestResult {
  success: boolean
  error?: string
}

/**
 * 配置相关的 API
 */
export interface ConfigApi {
  getStatus: () => Promise<ConfigStatus>
  getConfig: () => Promise<unknown>
  getLoadResult: () => Promise<ConfigLoadResult>
  saveConfig: (config: unknown) => Promise<ConfigSaveResult>
  updateConfig: (partialConfig: unknown) => Promise<ConfigSaveResult>
  exists: () => Promise<boolean>
  testModelConnection: (config: unknown) => Promise<ModelConnectionTestResult>
}
