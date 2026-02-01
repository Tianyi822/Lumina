import { configManager } from '@main/services/config'
import { logger } from '@main/services/logger'
import type { EmbeddingConfig } from '@shared/types/config'

/**
 * 嵌入模型管理服务
 * 提供嵌入模型的增删改查功能
 */
export class EmbeddingModelService {
  private loaded: boolean = false

  /**
   * 获取嵌入模型配置
   */
  private getEmbeddingModels(): Record<string, EmbeddingConfig> {
    const config = configManager.getConfig()
    return config?.embeddingModels || {}
  }

  /**
   * 保存嵌入模型配置
   */
  private saveEmbeddingModels(models: Record<string, EmbeddingConfig>): void {
    configManager.updateConfig({ embeddingModels: models })
  }

  /**
   * 初始化嵌入模型服务
   */
  initialize(): void {
    this.loaded = true
    const models = this.getEmbeddingModels()
    logger.info('嵌入模型服务初始化成功', 'main', {
      count: Object.keys(models).length
    })
  }

  /**
   * 获取所有嵌入模型
   */
  getAllModels(): Record<string, EmbeddingConfig> {
    if (!this.loaded) {
      this.initialize()
    }
    return { ...this.getEmbeddingModels() }
  }

  /**
   * 根据ID获取嵌入模型
   */
  getModelById(id: string): EmbeddingConfig | null {
    if (!this.loaded) {
      this.initialize()
    }
    const models = this.getEmbeddingModels()
    return models[id] || null
  }

  /**
   * 添加或更新嵌入模型
   */
  saveModel(id: string, config: EmbeddingConfig): void {
    if (!this.loaded) {
      this.initialize()
    }

    const models = this.getEmbeddingModels()
    models[id] = {
      ...config,
      createdAt: config.createdAt || new Date().toISOString()
    }

    this.saveEmbeddingModels(models)

    logger.info('嵌入模型保存成功', 'main', { id, model: config.model })
  }

  /**
   * 删除嵌入模型
   */
  deleteModel(id: string): boolean {
    if (!this.loaded) {
      this.initialize()
    }

    const models = this.getEmbeddingModels()
    if (!models[id]) {
      return false
    }

    delete models[id]
    this.saveEmbeddingModels(models)

    logger.info('嵌入模型删除成功', 'main', { id })
    return true
  }

  /**
   * 检查服务是否已加载
   */
  isLoaded(): boolean {
    return this.loaded
  }
}

// 单例实例
let embeddingModelServiceInstance: EmbeddingModelService | null = null

/**
 * 获取嵌入模型服务单例
 */
export function getEmbeddingModelService(): EmbeddingModelService {
  if (!embeddingModelServiceInstance) {
    embeddingModelServiceInstance = new EmbeddingModelService()
  }
  return embeddingModelServiceInstance
}
