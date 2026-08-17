import OpenAI from 'openai'
import { ipcMain } from 'electron'
import { configManager } from '@main/services/config'
import { logger } from '@main/services/logger'
import { t } from '@main/services/i18n'
import { AppConfig, ConfigLoadResult, LLMConfig } from '@main/types/config'
import { MODEL_CONNECT_TIMEOUT } from '@main/constants/timeouts'

/**
 * 缓存配置加载的结果
 */
let configLoadResult: ConfigLoadResult

interface ModelConnectionTestResult {
  success: boolean
  error?: string
}

function validateLLMConfig(config: LLMConfig): string | null {
  if (!config.base_url.trim()) {
    return t('notifications.config.validateApiBaseUrlRequired')
  }
  if (!config.api_key.trim()) {
    return t('notifications.config.validateApiKeyRequired')
  }
  if (!config.model_name.trim()) {
    return t('notifications.config.validateModelNameRequired')
  }
  return null
}

function normalizeModelConnectionError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

async function testModelConnection(config: LLMConfig): Promise<ModelConnectionTestResult> {
  const validationMessage = validateLLMConfig(config)
  if (validationMessage) {
    return { success: false, error: validationMessage }
  }

  const client = new OpenAI({
    apiKey: config.api_key,
    baseURL: config.base_url,
    timeout: MODEL_CONNECT_TIMEOUT
  })

  try {
    await client.chat.completions.create({
      model: config.model_name,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1
    })

    logger.info('对话模型连接测试成功', 'main', {
      model: config.model_name,
      baseUrl: config.base_url
    })
    return { success: true }
  } catch (error) {
    const errorMessage = normalizeModelConnectionError(error)
    logger.warn('对话模型连接测试失败', 'main', {
      model: config.model_name,
      baseUrl: config.base_url,
      error: errorMessage
    })
    return { success: false, error: errorMessage }
  }
}

/**
 * 初始化配置
 * 即使配置加载失败也不会阻止应用启动
 */
export function initializeConfig(): ConfigLoadResult {
  try {
    configLoadResult = configManager.initialize()
    if (configLoadResult.success) {
      logger.info('配置初始化成功')
    } else {
      logger.warn('配置初始化提示', 'main', { error: configLoadResult.error })
    }
    return configLoadResult
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    logger.error(`配置初始化时发生意外错误: ${detail}`)
    configLoadResult = {
      success: false,
      config: null,
      error: t('notifications.config.initUnexpectedErrorPrefix') + detail
    }
    return configLoadResult
  }
}

/**
 * 注册配置相关的 IPC 处理程序
 */
export function registerConfigHandlers(): void {
  // 获取配置加载状态
  ipcMain.handle('config:getStatus', () => {
    return configManager.getStatus()
  })

  // 获取配置
  ipcMain.handle('config:get', () => {
    return configManager.getConfig()
  })

  // 获取配置加载结果
  ipcMain.handle('config:getLoadResult', () => {
    return configLoadResult
  })

  // 保存配置
  ipcMain.handle('config:save', (_event, config: AppConfig) => {
    const result = configManager.saveConfig(config)
    if (result.success) {
      // 更新缓存的加载结果
      configLoadResult = {
        success: true,
        config: configManager.getConfig()
      }
    }
    return result
  })

  // 更新配置
  ipcMain.handle('config:update', (_event, partialConfig: Partial<AppConfig>) => {
    const result = configManager.updateConfig(partialConfig)
    if (result.success) {
      // 更新缓存的加载结果
      configLoadResult = {
        success: true,
        config: configManager.getConfig()
      }
    }
    return result
  })

  // 检查配置是否存在
  ipcMain.handle('config:exists', () => {
    return configManager.configExists()
  })

  // 测试对话模型连接
  ipcMain.handle('config:testModelConnection', (_event, config: LLMConfig) => {
    return testModelConnection(config)
  })
}
