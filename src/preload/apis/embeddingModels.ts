import { ipcRenderer } from 'electron'

/**
 * 嵌入模型提供商类型
 */
export type EmbeddingProviderType = 'openai' | 'aliyun' | 'ollama' | 'custom'

/**
 * 嵌入模型配置
 */
export interface EmbeddingConfig {
  /** 提供商类型 */
  provider?: EmbeddingProviderType
  /** API 基础 URL（OpenAI 兼容接口） */
  baseUrl: string
  /** API 密钥 */
  apiKey?: string
  /** 模型名称 */
  model: string
  /** 向量维度 */
  dimensions: number
  /** 是否启用 */
  enabled?: boolean
  /** 模型显示名称 */
  displayName?: string
  /** 创建时间 */
  createdAt?: string
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
 * API 响应基础类型
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * 嵌入模型管理相关的 API
 */
export const embeddingModelsApi = {
  /**
   * 获取所有嵌入模型
   */
  getAll: (): Promise<ApiResponse<Record<string, EmbeddingConfig>>> => {
    return ipcRenderer.invoke('embeddingModels:getAll')
  },

  /**
   * 根据ID获取嵌入模型
   */
  getById: (id: string): Promise<ApiResponse<EmbeddingConfig>> => {
    return ipcRenderer.invoke('embeddingModels:getById', id)
  },

  /**
   * 保存嵌入模型（新增或更新）
   */
  save: (id: string, config: EmbeddingConfig): Promise<ApiResponse> => {
    return ipcRenderer.invoke('embeddingModels:save', id, config)
  },

  /**
   * 删除嵌入模型
   */
  delete: (id: string): Promise<ApiResponse> => {
    return ipcRenderer.invoke('embeddingModels:delete', id)
  },

  /**
   * 测试嵌入模型连接
   */
  test: (id: string): Promise<ConnectionTestResult> => {
    return ipcRenderer.invoke('embeddingModels:test', id)
  }
}
