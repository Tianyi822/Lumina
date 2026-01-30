import { ipcRenderer } from 'electron'

/**
 * 嵌入向量结果
 */
export interface EmbeddingResult {
  embedding: number[]
  model: string
  usage?: {
    prompt_tokens: number
    total_tokens: number
  }
}

/**
 * 批量嵌入向量结果
 */
export interface BatchEmbeddingResult {
  embeddings: number[][]
  model: string
  usage?: {
    prompt_tokens: number
    total_tokens: number
  }
}

/**
 * 连接测试结果
 */
export interface ConnectionTestResult {
  success: boolean
  error?: string
  model?: string
  dimensions?: number
}

/**
 * 嵌入配置
 */
export interface EmbeddingConfig {
  provider: string
  baseUrl: string
  apiKey?: string
  model: string
  dimensions: number
  enabled?: boolean
}

/**
 * API 响应基础类型
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 嵌入模型相关的 API
 */
export const embeddingApi = {
  /**
   * 获取预设嵌入模型列表
   */
  getPresets: (): Promise<ApiResponse<Record<string, { name: string; dimension: number }>>> => {
    return ipcRenderer.invoke('embedding:getPresets')
  },

  /**
   * 从预设ID创建嵌入配置
   */
  createFromPreset: (
    presetId: string,
    customConfig?: Partial<EmbeddingConfig>
  ): Promise<ApiResponse<EmbeddingConfig>> => {
    return ipcRenderer.invoke('embedding:createFromPreset', presetId, customConfig)
  },

  /**
   * 获取当前嵌入配置
   */
  getConfig: (): Promise<ApiResponse<EmbeddingConfig | null>> => {
    return ipcRenderer.invoke('embedding:getConfig')
  },

  /**
   * 设置嵌入配置
   */
  setConfig: (config: EmbeddingConfig): Promise<ApiResponse> => {
    return ipcRenderer.invoke('embedding:setConfig', config)
  },

  /**
   * 测试嵌入连接
   */
  testConnection: (): Promise<ConnectionTestResult> => {
    return ipcRenderer.invoke('embedding:testConnection')
  },

  /**
   * 生成单个文本的嵌入向量
   */
  embed: (text: string): Promise<ApiResponse<EmbeddingResult>> => {
    return ipcRenderer.invoke('embedding:embed', text)
  },

  /**
   * 批量生成嵌入向量
   */
  embedBatch: (texts: string[]): Promise<ApiResponse<BatchEmbeddingResult>> => {
    return ipcRenderer.invoke('embedding:embedBatch', texts)
  }
}
