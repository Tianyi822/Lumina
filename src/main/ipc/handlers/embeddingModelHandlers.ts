import { ipcMain } from 'electron'
import { configManager } from '@main/services/config'
import { getEmbeddingModelService, getEmbeddingService } from '@main/services/embedding'
import { logger } from '@main/services/logger'
import type { EmbeddingConfig } from '@main/types/config'

// 初始化嵌入模型管理服务，在应用启动时加载所有保存的嵌入模型配置
export function initializeEmbeddingModels(): void {
  try {
    getEmbeddingModelService().initialize()
    logger.info('嵌入模型管理服务已初始化')
  } catch (error) {
    const errorMessage = `嵌入模型管理服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
    logger.error(errorMessage)
  }
}

// 注册嵌入模型管理的 IPC 处理程序，处理模型增删改查和测试连接等操作
export function registerEmbeddingModelHandlers(): void {
  // 获取所有已保存的嵌入模型列表
  ipcMain.handle('embeddingModels:getAll', () => {
    try {
      const models = getEmbeddingModelService().getAllModels()
      return {
        success: true,
        data: models
      }
    } catch (error) {
      const errorMessage = `获取嵌入模型列表失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 根据模型 ID 获取单个嵌入模型的配置
  ipcMain.handle('embeddingModels:getById', (_event, id: string) => {
    try {
      const model = getEmbeddingModelService().getModelById(id)
      if (!model) {
        return {
          success: false,
          error: '嵌入模型不存在'
        }
      }
      return {
        success: true,
        data: model
      }
    } catch (error) {
      const errorMessage = `获取嵌入模型失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 保存或更新嵌入模型配置，同时持久化到应用配置文件
  ipcMain.handle('embeddingModels:save', async (_event, id: string, config: EmbeddingConfig) => {
    try {
      getEmbeddingModelService().saveModel(id, config)

      // 同时更新到应用配置
      const currentConfig = configManager.getConfig()
      if (currentConfig) {
        const embeddingModels = currentConfig.embeddingModels || {}
        embeddingModels[id] = config

        await configManager.updateConfig({
          embeddingModels
        })
      }

      logger.info('嵌入模型已保存', 'main', { id, model: config.model })
      return {
        success: true
      }
    } catch (error) {
      const errorMessage = `保存嵌入模型失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 删除指定的嵌入模型，同时从应用配置中移除
  ipcMain.handle('embeddingModels:delete', async (_event, id: string) => {
    try {
      const success = getEmbeddingModelService().deleteModel(id)

      if (!success) {
        return {
          success: false,
          error: '嵌入模型不存在'
        }
      }

      // 同时从应用配置中删除
      const currentConfig = configManager.getConfig()
      if (currentConfig && currentConfig.embeddingModels) {
        const embeddingModels = { ...currentConfig.embeddingModels }
        delete embeddingModels[id]
        await configManager.updateConfig({ embeddingModels })
      }

      logger.info('嵌入模型已删除', 'main', { id })
      return {
        success: true
      }
    } catch (error) {
      const errorMessage = `删除嵌入模型失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 测试嵌入模型的连接状态，验证配置是否可用
  ipcMain.handle('embeddingModels:test', async (_event, id: string) => {
    try {
      const model = getEmbeddingModelService().getModelById(id)
      if (!model) {
        return {
          success: false,
          error: '嵌入模型不存在'
        }
      }

      // 使用该模型进行连接测试
      const service = getEmbeddingService()
      service.setConfig(model)
      const result = await service.testConnection()

      if (result.success) {
        logger.info('嵌入模型连接测试成功', 'main', { id, model: result.model })
      } else {
        logger.warn('嵌入模型连接测试失败', 'main', { id, error: result.error })
      }

      return result
    } catch (error) {
      const errorMessage = `测试嵌入模型连接失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })
}
