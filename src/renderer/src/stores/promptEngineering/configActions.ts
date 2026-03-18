import type { PromptConfig } from '@shared/types/config'
import type { PromptEngineeringStoreRefs } from './types'
import {
  createDefaultPromptConfig,
  getErrorMessage,
  normalizePromptConfig,
  startScopedLoading,
  stopScopedLoading
} from './utils'

/**
 * 创建配置管理 Actions
 */
export function createPromptEngineeringConfigActions(store: PromptEngineeringStoreRefs) {
  /**
   * 加载提示词配置
   */
  async function loadConfig(): Promise<void> {
    startScopedLoading(store.configLoadingCounter)
    store.error.value = null

    try {
      const config = await window.api.promptEngineering.getConfig()
      store.promptConfig.value = normalizePromptConfig(config)
    } catch (target) {
      store.error.value = getErrorMessage('加载配置失败', target)
      store.promptConfig.value = createDefaultPromptConfig()
    } finally {
      stopScopedLoading(store.configLoadingCounter)
    }
  }

  /**
   * 保存提示词配置
   */
  async function saveConfig(): Promise<boolean> {
    store.saving.value = true
    store.error.value = null

    try {
      const result = await window.api.promptEngineering.updateConfig(
        normalizePromptConfig(store.promptConfig.value)
      )

      if (!result.success) {
        store.error.value = result.error || '保存配置失败'
        return false
      }

      store.promptConfig.value = normalizePromptConfig(store.promptConfig.value)
      return true
    } catch (target) {
      store.error.value = getErrorMessage('保存配置失败', target)
      return false
    } finally {
      store.saving.value = false
    }
  }

  /**
   * 更新提示词配置（部分更新）
   */
  function updatePromptConfig(config: Partial<PromptConfig>): void {
    store.promptConfig.value = normalizePromptConfig({
      ...store.promptConfig.value,
      ...config
    })
  }

  /**
   * 重置提示词配置
   */
  async function resetPromptConfig(): Promise<{
    success: boolean
    config?: PromptConfig
    error?: string
  }> {
    startScopedLoading(store.configLoadingCounter)
    store.error.value = null

    try {
      const result = await window.api.promptEngineering.resetConfig()

      if (!result.success || !result.config) {
        const errorMessage = result.error || '重置提示词配置失败'
        store.error.value = errorMessage
        return { success: false, error: errorMessage }
      }

      const normalizedConfig = normalizePromptConfig(result.config)
      store.promptConfig.value = normalizedConfig

      return {
        success: true,
        config: normalizedConfig
      }
    } catch (target) {
      const errorMessage = getErrorMessage('重置提示词配置失败', target)
      store.error.value = errorMessage
      return { success: false, error: errorMessage }
    } finally {
      stopScopedLoading(store.configLoadingCounter)
    }
  }

  return {
    loadConfig,
    saveConfig,
    updatePromptConfig,
    resetPromptConfig
  }
}
