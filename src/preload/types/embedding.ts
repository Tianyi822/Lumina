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
 * 嵌入模型支持的提供商类型
 */
export type EmbeddingProviderType = 'openai' | 'aliyun' | 'ollama' | 'custom'

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
 * 嵌入模型的扩展配置
 */
export interface EmbeddingModelConfig {
  /** 提供商类型 */
  provider?: EmbeddingProviderType
  /** API 基础地址，需要兼容 OpenAI 接口 */
  baseUrl: string
  /** API 密钥 */
  apiKey?: string
  /** 模型名称 */
  model: string
  /** 向量维度 */
  dimensions: number
  /** 该配置是否启用 */
  enabled?: boolean
  /** 模型显示的名称 */
  displayName?: string
  /** 配置创建的时间 */
  createdAt?: string
}

/**
 * 嵌入模型相关的 API
 */
export interface EmbeddingApi {
  getPresets: () => Promise<{
    success: boolean
    data?: Record<string, { name: string; dimension: number }>
    error?: string
  }>
  createFromPreset: (
    presetId: string,
    customConfig?: Partial<EmbeddingConfig>
  ) => Promise<{ success: boolean; data?: EmbeddingConfig; error?: string }>
  getConfig: () => Promise<{ success: boolean; data?: EmbeddingConfig | null; error?: string }>
  setConfig: (config: EmbeddingConfig) => Promise<{ success: boolean; error?: string }>
  testConnection: () => Promise<ConnectionTestResult>
  embed: (text: string) => Promise<{ success: boolean; data?: EmbeddingResult; error?: string }>
  embedBatch: (
    texts: string[]
  ) => Promise<{ success: boolean; data?: BatchEmbeddingResult; error?: string }>
}

/**
 * 嵌入模型管理相关的 API
 */
export interface EmbeddingModelsApi {
  getAll: () => Promise<{
    success: boolean
    data?: Record<string, EmbeddingModelConfig>
    error?: string
  }>
  getById: (id: string) => Promise<{
    success: boolean
    data?: EmbeddingModelConfig
    error?: string
  }>
  save: (
    id: string,
    config: EmbeddingModelConfig
  ) => Promise<{
    success: boolean
    error?: string
  }>
  delete: (id: string) => Promise<{
    success: boolean
    error?: string
  }>
  test: (id: string) => Promise<ConnectionTestResult>
  setDefault: (id: string) => Promise<{
    success: boolean
    error?: string
  }>
}
