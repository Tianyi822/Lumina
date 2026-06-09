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
  /** 获取配置加载的状态 */
  getStatus: () => Promise<ConfigStatus>
  /** 获取完整配置数据 */
  getConfig: () => Promise<unknown>
  /** 获取配置加载的结果 */
  getLoadResult: () => Promise<ConfigLoadResult>
  /** 保存完整的配置 */
  saveConfig: (config: unknown) => Promise<ConfigSaveResult>
  /** 更新部分配置字段 */
  updateConfig: (partialConfig: unknown) => Promise<ConfigSaveResult>
  /** 检查配置文件是否存在 */
  exists: () => Promise<boolean>
  /** 测试对话模型连接是否正常 */
  testModelConnection: (config: unknown) => Promise<ModelConnectionTestResult>
}
