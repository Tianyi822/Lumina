import { ipcMain } from 'electron'
import { getEmbeddingService, EmbeddingService, isEmbeddingFailure } from '@main/services/embedding'
import { logger } from '@main/services/logger'
import { t } from '@main/services/i18n'
import type { EmbeddingConfig } from '@main/types/config'

// 嵌入服务初始化，服务会在需要时按需加载配置
export function initializeEmbedding(): void {
  logger.info('嵌入服务已准备好，将按需加载配置', 'main')
}

// 注册嵌入模型相关的 IPC 处理程序，处理渲染进程发送的嵌入相关请求
export function registerEmbeddingHandlers(): void {
  // 获取预设的嵌入模型列表，包括支持的模型提供商和模型名称
  ipcMain.handle('embedding:getPresets', () => {
    try {
      const presets = EmbeddingService.getPresets()
      return {
        success: true,
        data: presets
      }
    } catch (error) {
      const errorMessage = t('notifications.embedding.getPresetsFailed', {
        reason: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 根据预设 ID 创建嵌入配置，可传入自定义配置覆盖默认值
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
        const errorMessage = t('notifications.embedding.createFromPresetFailed', {
          reason: error instanceof Error ? error.message : String(error)
        })
        logger.error(errorMessage)
        return {
          success: false,
          error: errorMessage
        }
      }
    }
  )

  // 获取当前正在使用的嵌入配置
  ipcMain.handle('embedding:getConfig', () => {
    try {
      const config = getEmbeddingService().getConfig()
      return {
        success: true,
        data: config
      }
    } catch (error) {
      const errorMessage = t('notifications.embedding.getConfigFailed', {
        reason: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 设置嵌入配置，这个处理器用于运行时临时配置
  // 注意：持久化配置应使用 embeddingModels:save 处理器
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
      const errorMessage = t('notifications.embedding.setConfigFailed', {
        reason: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 测试嵌入服务的连接状态和可用性
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
      const errorMessage = t('notifications.embedding.testConnectionFailed', {
        reason: error instanceof Error ? error.message : String(error)
      })
      logger.error(errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }
  })

  // 生成单个文本的嵌入向量，返回向量数组
  ipcMain.handle('embedding:embed', async (_event, text: string) => {
    const result = await getEmbeddingService().embed(text)
    if (isEmbeddingFailure(result)) {
      const errorMessage = t('notifications.embedding.embedHandlerFailed', {
        reason: result.error
      })
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
    return { success: true, data: result }
  })

  // 批量生成多个文本的嵌入向量，提高处理效率
  ipcMain.handle('embedding:embedBatch', async (_event, texts: string[]) => {
    const result = await getEmbeddingService().embedBatch(texts)
    if (isEmbeddingFailure(result)) {
      const errorMessage = t('notifications.embedding.embedBatchHandlerFailed', {
        reason: result.error
      })
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
    return { success: true, data: result }
  })
}
