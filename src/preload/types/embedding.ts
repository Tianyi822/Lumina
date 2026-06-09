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
  /** 获取预设的嵌入模型列表 */
  getPresets: () => Promise<{
    success: boolean
    data?: Record<string, { name: string; dimension: number }>
    error?: string
  }>
  /** 根据预设 ID 创建嵌入配置 */
  createFromPreset: (
    presetId: string,
    customConfig?: Partial<EmbeddingConfig>
  ) => Promise<{ success: boolean; data?: EmbeddingConfig; error?: string }>
  /** 获取当前正在使用的嵌入配置 */
  getConfig: () => Promise<{ success: boolean; data?: EmbeddingConfig | null; error?: string }>
  /** 设置（运行时）嵌入配置 */
  setConfig: (config: EmbeddingConfig) => Promise<{ success: boolean; error?: string }>
  /** 测试嵌入服务的连接状态 */
  testConnection: () => Promise<ConnectionTestResult>
  /** 为单个文本生成嵌入向量 */
  embed: (text: string) => Promise<{ success: boolean; data?: EmbeddingResult; error?: string }>
  /** 批量生成嵌入向量 */
  embedBatch: (
    texts: string[]
  ) => Promise<{ success: boolean; data?: BatchEmbeddingResult; error?: string }>
}

/**
 * 嵌入模型管理相关的 API
 */
export interface EmbeddingModelsApi {
  /** 获取所有已保存的嵌入模型 */
  getAll: () => Promise<{
    success: boolean
    data?: Record<string, EmbeddingModelConfig>
    error?: string
  }>
  /** 根据 ID 获取嵌入模型配置 */
  getById: (id: string) => Promise<{
    success: boolean
    data?: EmbeddingModelConfig
    error?: string
  }>
  /** 保存或更新嵌入模型配置 */
  save: (
    id: string,
    config: EmbeddingModelConfig
  ) => Promise<{
    success: boolean
    error?: string
  }>
  /** 删除嵌入模型配置 */
  delete: (id: string) => Promise<{
    success: boolean
    error?: string
  }>
  /** 测试嵌入模型的连接 */
  test: (id: string) => Promise<ConnectionTestResult>
  /** 设置默认嵌入模型 */
  setDefault: (id: string) => Promise<{
    success: boolean
    error?: string
  }>
}
