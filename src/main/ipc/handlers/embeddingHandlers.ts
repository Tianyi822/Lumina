import { ipcMain } from 'electron'
import { configManager } from '@main/services/config'
import { getEmbeddingService, EmbeddingService } from '@main/services/embedding'
import { logger } from '@main/services/logger'
import type { EmbeddingConfig } from '@main/types/config'

/**
 * 初始化嵌入服务
 * 从配置中加载默认嵌入模型配置
 */
export function initializeEmbedding(): void {
  try {
    const config = configManager.getConfig()
    const defaultModelId = config?.defaultEmbeddingModel
    const embeddingModels = config?.embeddingModels

    if (defaultModelId && embeddingModels && embeddingModels[defaultModelId]) {
      const modelConfig = embeddingModels[defaultModelId]
      getEmbeddingService().setConfig(modelConfig)
      logger.info('嵌入服务已初始化', 'main', {
        component: 'embedding',
        model: modelConfig.model
      })
    } else {
      logger.info('未配置默认嵌入模型，将在首次使用时初始化', 'main')
    }
  } catch (error) {
    const errorMessage = `嵌入服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
    logger.error(errorMessage, 'main')
  }
}

/**
 * 注册嵌入模型相关的 IPC 处理程序
 */
export function registerEmbeddingHandlers(): void {
  // 获取预设嵌入模型列表
  ipcMain.handle('embedding:getPresets', () => {
    try {
      const presets = EmbeddingService.getPresets()
      return {
        success: true,
        data: presets
      }
    } catch (error) {
      const errorMessage = `获取预设模型失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 从预设ID创建嵌入配置
  ipcMain.handle(
    'embedding:createFromPreset',
    (_event, presetId: string, customConfig?: Partial<EmbeddingConfig>) => {
      try {
        const config = EmbeddingService.getPresetConfig(presetId, customConfig)
        return {
          success: true,
          data: config
        }
      } catch (error) {
        const errorMessage = `创建嵌入配置失败: ${error instanceof Error ? error.message : String(error)}`
        logger.error(errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  // 获取当前嵌入配置
  ipcMain.handle('embedding:getConfig', () => {
    try {
      const config = getEmbeddingService().getConfig()
      return {
        success: true,
        data: config
      }
    } catch (error) {
      const errorMessage = `获取嵌入配置失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 设置嵌入配置
  ipcMain.handle('embedding:setConfig', async (_event, config: EmbeddingConfig) => {
    try {
      getEmbeddingService().setConfig(config)

      // 同时更新到应用配置（临时设置，不保存到 embeddingModels）
      // 注意：这个处理器用于运行时临时配置，持久化配置应使用 embeddingModels:save
      logger.info('嵌入配置已更新（临时）', 'main', {
        component: 'embedding',
        model: config.model
      })

      return {
        success: true
      }
    } catch (error) {
      const errorMessage = `设置嵌入配置失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 测试嵌入连接
  ipcMain.handle('embedding:testConnection', async () => {
    try {
      const result = await getEmbeddingService().testConnection()

      if (result.success) {
        logger.info('嵌入连接测试成功', 'main', {
          component: 'embedding',
          model: result.model,
          dimensions: result.dimensions
        })
      } else {
        logger.warn('嵌入连接测试失败', 'main', {
          component: 'embedding',
          error: result.error
        })
      }

      return result
    } catch (error) {
      const errorMessage = `测试嵌入连接失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 生成单个文本的嵌入向量
  ipcMain.handle('embedding:embed', async (_event, text: string) => {
    try {
      const result = await getEmbeddingService().embed(text)
      return {
        success: true,
        data: result
      }
    } catch (error) {
      const errorMessage = `生成嵌入向量失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 批量生成嵌入向量
  ipcMain.handle('embedding:embedBatch', async (_event, texts: string[]) => {
    try {
      const result = await getEmbeddingService().embedBatch(texts)
      return {
        success: true,
        data: result
      }
    } catch (error) {
      const errorMessage = `批量生成嵌入向量失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })
}
