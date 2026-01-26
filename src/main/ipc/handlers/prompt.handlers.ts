import { ipcMain } from 'electron'
import { configManager } from '../../services/config'
import { logger } from '../../services/logger'
import type { PromptConfig } from '@main/types/config'

/**
 * 获取提示词配置
 */
export async function handleGetPromptConfig(): Promise<PromptConfig | undefined> {
  try {
    const config = configManager.getConfig()
    if (!config) {
      logger.error('无法获取提示词配置：配置未加载')
      return undefined
    }

    return config.promptConfig
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('获取提示词配置失败', 'main', { error: errorMessage })
    throw error
  }
}

/**
 * 更新提示词配置
 */
export async function handleUpdatePromptConfig(
  _event: Electron.IpcMainInvokeEvent,
  promptConfig: PromptConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const config = configManager.getConfig()
    if (!config) {
      const error = '无法更新提示词配置：配置未加载'
      logger.error(error)
      return { success: false, error }
    }

    // 更新配置
    const result = configManager.updateConfig({ promptConfig })

    if (result.success) {
      logger.info('提示词配置已更新', 'main', { promptConfig })
    }

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('更新提示词配置失败', 'main', { error: errorMessage })
    return { success: false, error: errorMessage }
  }
}

/**
 * 注册提示词配置相关的 IPC 处理器
 */
export function registerPromptHandlers(): void {
  ipcMain.handle('prompt:getConfig', handleGetPromptConfig)
  ipcMain.handle('prompt:updateConfig', handleUpdatePromptConfig)

  logger.debug('提示词配置 IPC 处理器已注册', 'main')
}
