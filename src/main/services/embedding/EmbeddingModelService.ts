import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getConfigDirPath } from '@main/services/config/configPaths'
import { logger } from '@main/services/logger'
import type { EmbeddingConfig } from '@shared/types/config'

/**
 * 嵌入模型数据文件路径
 */
function getEmbeddingModelsFilePath(): string {
  return join(getConfigDirPath(), 'embedding-models.json')
}

/**
 * 读取嵌入模型配置
 */
function readEmbeddingModels(): Record<string, EmbeddingConfig> {
  const filePath = getEmbeddingModelsFilePath()
  if (!existsSync(filePath)) {
    return {}
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as Record<string, EmbeddingConfig>
  } catch (error) {
    logger.error('读取嵌入模型配置失败', 'main', { error })
    return {}
  }
}

/**
 * 写入嵌入模型配置
 */
function writeEmbeddingModels(models: Record<string, EmbeddingConfig>): void {
  const filePath = getEmbeddingModelsFilePath()
  const content = JSON.stringify(models, null, 2)
  writeFileSync(filePath, content, 'utf-8')
}

/**
 * 嵌入模型管理服务
 * 提供嵌入模型的增删改查功能
 */
export class EmbeddingModelService {
  private models: Record<string, EmbeddingConfig> = {}
  private loaded: boolean = false

  /**
   * 初始化嵌入模型服务
   */
  initialize(): void {
    try {
      this.models = readEmbeddingModels()
      this.loaded = true
      logger.info('嵌入模型服务初始化成功', 'main', {
        count: Object.keys(this.models).length
      })
    } catch (error) {
      const errorMessage = `嵌入模型服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      this.models = {}
      this.loaded = true
    }
  }

  /**
   * 获取所有嵌入模型
   */
  getAllModels(): Record<string, EmbeddingConfig> {
    if (!this.loaded) {
      this.initialize()
    }
    return { ...this.models }
  }

  /**
   * 根据ID获取嵌入模型
   */
  getModelById(id: string): EmbeddingConfig | null {
    if (!this.loaded) {
      this.initialize()
    }
    return this.models[id] || null
  }

  /**
   * 添加或更新嵌入模型
   */
  saveModel(id: string, config: EmbeddingConfig): void {
    if (!this.loaded) {
      this.initialize()
    }

    this.models[id] = {
      ...config,
      createdAt: config.createdAt || new Date().toISOString()
    }

    this.save()

    logger.info('嵌入模型保存成功', 'main', { id, model: config.model })
  }

  /**
   * 删除嵌入模型
   */
  deleteModel(id: string): boolean {
    if (!this.loaded) {
      this.initialize()
    }

    if (!this.models[id]) {
      return false
    }

    delete this.models[id]
    this.save()

    logger.info('嵌入模型删除成功', 'main', { id })
    return true
  }

  /**
   * 保存模型配置到文件
   */
  private save(): void {
    try {
      writeEmbeddingModels(this.models)
    } catch (error) {
      const errorMessage = `保存嵌入模型配置失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
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
