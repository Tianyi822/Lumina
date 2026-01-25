import { ipcMain } from 'electron'
import { configManager, DEFAULT_THEME_COLORS } from '@main/services/config'
import { logger } from '@main/services/logger'
import { AppConfig, ConfigLoadResult } from '@main/types/config'
import { updateThemeColors } from '@main/core'

/**
 * 配置加载结果缓存
 */
let configLoadResult: ConfigLoadResult

/**
 * 初始化配置
 * 即使配置加载失败也不会阻止应用启动
 */
/**
 * 应用主题颜色到窗口
 */
function applyThemeColors(config: AppConfig | null): void {
  const colors = config?.theme?.colors || DEFAULT_THEME_COLORS
  updateThemeColors(colors)
  logger.info('主题颜色已应用', 'main', { background: colors.background })
}

export function initializeConfig(): ConfigLoadResult {
  try {
    configLoadResult = configManager.initialize()
    if (configLoadResult.success) {
      logger.info('配置初始化成功')
      // 应用主题颜色
      applyThemeColors(configLoadResult.config)
    } else {
      logger.warn('配置初始化提示', 'main', { error: configLoadResult.error })
    }
    return configLoadResult
  } catch (error) {
    const errorMessage = `配置初始化时发生意外错误: ${error instanceof Error ? error.message : String(error)}`
    logger.error(errorMessage)
    configLoadResult = {
      success: false,
      config: null,
      error: errorMessage
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
      // 应用主题颜色
      applyThemeColors(configManager.getConfig())
    }
    return result
  })

  // 更新配置（部分更新）
  ipcMain.handle('config:update', (_event, partialConfig: Partial<AppConfig>) => {
    const result = configManager.updateConfig(partialConfig)
    if (result.success) {
      // 更新缓存的加载结果
      configLoadResult = {
        success: true,
        config: configManager.getConfig()
      }
      // 如果更新了主题，应用主题颜色
      if (partialConfig.theme) {
        applyThemeColors(configManager.getConfig())
      }
    }
    return result
  })

  // 检查配置是否存在
  ipcMain.handle('config:exists', () => {
    return configManager.configExists()
  })
}
