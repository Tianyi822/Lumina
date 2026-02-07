import { ipcRenderer } from 'electron'

/**
 * 单个文本的嵌入向量结果
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
 * 批量文本的嵌入向量结果
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
 * 连接测试的结果
 */
export interface ConnectionTestResult {
  success: boolean
  error?: string
  model?: string
  dimensions?: number
}

/**
 * 嵌入模型的配置
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
 * API 响应的通用格式
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
   * 获取预设的嵌入模型列表
   */
  getPresets: (): Promise<ApiResponse<Record<string, { name: string; dimension: number }>>> => {
    return ipcRenderer.invoke('embedding:getPresets')
  },

  /**
   * 根据预设 ID 创建嵌入配置
   */
  createFromPreset: (
    presetId: string,
    customConfig?: Partial<EmbeddingConfig>
  ): Promise<ApiResponse<EmbeddingConfig>> => {
    return ipcRenderer.invoke('embedding:createFromPreset', presetId, customConfig)
  },

  /**
   * 获取当前嵌入模型配置
   */
  getConfig: (): Promise<ApiResponse<EmbeddingConfig | null>> => {
    return ipcRenderer.invoke('embedding:getConfig')
  },

  /**
   * 设置嵌入模型配置
   */
  setConfig: (config: EmbeddingConfig): Promise<ApiResponse> => {
    return ipcRenderer.invoke('embedding:setConfig', config)
  },

  /**
   * 测试嵌入模型的连接
   */
  testConnection: (): Promise<ConnectionTestResult> => {
    return ipcRenderer.invoke('embedding:testConnection')
  },

  /**
   * 为单个文本生成嵌入向量
   */
  embed: (text: string): Promise<ApiResponse<EmbeddingResult>> => {
    return ipcRenderer.invoke('embedding:embed', text)
  },

  /**
   * 批量为多个文本生成嵌入向量
   */
  embedBatch: (texts: string[]): Promise<ApiResponse<BatchEmbeddingResult>> => {
    return ipcRenderer.invoke('embedding:embedBatch', texts)
  }
}
