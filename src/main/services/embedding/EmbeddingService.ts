import OpenAI from 'openai'
import type { EmbeddingConfig } from '@main/types/config'

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
 * 预定义的嵌入模型配置
 */
export const PRESET_EMBEDDING_MODELS: Record<
  string,
  { name: string; dimension: number; config: Partial<EmbeddingConfig> }
> = {
  'openai/small': {
    name: 'OpenAI text-embedding-3-small',
    dimension: 1536,
    config: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
      dimensions: 1536
    }
  },
  'openai/large': {
    name: 'OpenAI text-embedding-3-large',
    dimension: 3072,
    config: {
      baseUrl: 'https://api.openai.com/v1',
      model: 'text-embedding-3-large',
      dimensions: 3072
    }
  },
  'ollama/nomic': {
    name: 'Ollama nomic-embed-text',
    dimension: 768,
    config: {
      baseUrl: 'http://localhost:11434/v1',
      model: 'nomic-embed-text',
      dimensions: 768
    }
  },
  'aliyun/v4': {
    name: '阿里云百炼 text-embedding-v4',
    dimension: 1024,
    config: {
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'text-embedding-v4',
      dimensions: 1024
    }
  }
}

/**
 * 嵌入服务
 * 提供文本嵌入向量的生成功能，支持多种嵌入模型提供商
 */
export class EmbeddingService {
  private config: EmbeddingConfig | null = null
  private client: OpenAI | null = null

  /**
   * 设置嵌入模型配置
   */
  setConfig(config: EmbeddingConfig): void {
    this.config = config
    this.initializeClient()
  }

  /**
   * 获取当前配置
   */
  getConfig(): EmbeddingConfig | null {
    return this.config
  }

  /**
   * 初始化 OpenAI 客户端
   */
  private initializeClient(): void {
    if (!this.config) {
      this.client = null
      return
    }

    // 使用 OpenAI 兼容的配置创建客户端
    this.client = new OpenAI({
      baseURL: this.config.baseUrl,
      apiKey: this.config.apiKey || 'dummy-key' // Ollama 等本地服务可能不需要 API Key
    })
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.config || !this.client) {
      return {
        success: false,
        error: '嵌入模型未配置'
      }
    }

    try {
      // 发送一个简单的测试请求
      const response = await this.client.embeddings.create({
        model: this.config.model,
        input: 'test'
      })

      const embedding = response.data[0]
      return {
        success: true,
        model: response.model,
        dimensions: embedding.embedding.length
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 生成单个文本的嵌入向量
   */
  async embed(text: string): Promise<EmbeddingResult> {
    if (!this.config || !this.client) {
      throw new Error('嵌入模型未配置')
    }

    try {
      const params: OpenAI.EmbeddingCreateParams = {
        model: this.config.model,
        input: text
      }

      // 如果模型支持 dimensions 参数（如 text-embedding-v3/v4），则添加
      if (this.config.model.includes('text-embedding-v3') && this.config.dimensions) {
        // @ts-ignore - OpenAI 类型定义可能不包含此参数
        params.dimensions = this.config.dimensions
      }

      const response = await this.client.embeddings.create(params)
      const embedding = response.data[0]

      return {
        embedding: embedding.embedding,
        model: response.model,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              total_tokens: response.usage.total_tokens
            }
          : undefined
      }
    } catch (error) {
      throw new Error(`嵌入向量生成失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 批量生成嵌入向量
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (!this.config || !this.client) {
      throw new Error('嵌入模型未配置')
    }

    if (texts.length === 0) {
      throw new Error('输入文本列表不能为空')
    }

    try {
      const params: OpenAI.EmbeddingCreateParams = {
        model: this.config.model,
        input: texts
      }

      // 如果模型支持 dimensions 参数，则添加
      if (this.config.model.includes('text-embedding-v3') && this.config.dimensions) {
        // @ts-ignore - OpenAI 类型定义可能不包含此参数
        params.dimensions = this.config.dimensions
      }

      const response = await this.client.embeddings.create(params)

      // 按索引排序以确保顺序正确
      const sortedData = response.data.sort((a, b) => a.index - b.index)

      return {
        embeddings: sortedData.map((item) => item.embedding),
        model: response.model,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              total_tokens: response.usage.total_tokens
            }
          : undefined
      }
    } catch (error) {
      throw new Error(`批量嵌入向量生成失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 从预设ID获取嵌入配置
   */
  static getPresetConfig(presetId: string, customConfig?: Partial<EmbeddingConfig>): EmbeddingConfig {
    const preset = PRESET_EMBEDDING_MODELS[presetId]
    if (!preset) {
      throw new Error(`未找到预设模型: ${presetId}`)
    }

    return {
      ...preset.config,
      ...customConfig,
      enabled: true
    } as EmbeddingConfig
  }

  /**
   * 获取所有预设模型
   */
  static getPresets(): Record<string, { name: string; dimension: number }> {
    const result: Record<string, { name: string; dimension: number }> = {}
    for (const [id, preset] of Object.entries(PRESET_EMBEDDING_MODELS)) {
      result[id] = {
        name: preset.name,
        dimension: preset.dimension
      }
    }
    return result
  }
}

// 单例实例
let embeddingServiceInstance: EmbeddingService | null = null

/**
 * 获取嵌入服务单例
 */
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService()
  }
  return embeddingServiceInstance
}
