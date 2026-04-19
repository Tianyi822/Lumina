// 应用配置 Store
// 统一管理主题、模型、提示词等配置状态

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_OCR_PROVIDER,
  type AppConfig,
  type ThemeConfig,
  type ThemeMode,
  type LLMConfig,
  type PaperReaderConfig
} from '@shared/types/config'
import { useNotification } from '@renderer/composables/useNotification'
import { deepClone } from '@shared/utils'

interface SaveConfigOptions {
  silent?: boolean
}

export const useConfigStore = defineStore('config', () => {
  // ==================== State ====================

  // 加载状态
  const loading = ref(false)
  const saving = ref(false)

  // 主题配置
  const themeConfig = ref<ThemeConfig>({
    name: 'sparrow-dark',
    mode: 'manual'
  })

  // 模型配置
  const llmConfigs = ref<LLMConfig[]>([])
  const defaultModel = ref('')

  // 论文阅读配置
  const paperReaderConfig = ref<PaperReaderConfig>({
    ocr: { provider: DEFAULT_OCR_PROVIDER }
  })

  // ==================== Getters ====================

  // 是否有模型配置
  const hasModels = computed(() => llmConfigs.value.length > 0)

  // 获取默认模型配置
  const defaultModelConfig = computed(() => {
    return llmConfigs.value.find((m) => m.model_name === defaultModel.value)
  })

  // ==================== Actions ====================

  // 加载配置
  async function loadConfig(): Promise<void> {
    loading.value = true
    try {
      const config = (await window.api.config.getConfig()) as AppConfig | null
      if (config) {
        // 加载主题配置
        if (config.theme) {
          themeConfig.value.name = config.theme.name || 'sparrow-dark'
          themeConfig.value.mode = (config.theme.mode as ThemeMode | undefined) || 'manual'
        }
        // 加载模型配置
        if (config.llm_config?.models) {
          llmConfigs.value = config.llm_config.models
        }
        defaultModel.value = config.llm_config?.default_model || ''
        // 加载论文阅读配置
        if (config.paperReader) {
          paperReaderConfig.value = {
            ...paperReaderConfig.value,
            ...config.paperReader
          }
        }
      }
    } catch (error) {
      const msg = `加载配置失败: ${error instanceof Error ? error.message : String(error)}`
      const notify = useNotification()
      notify.error('配置加载失败', msg, { source: 'config' })
    } finally {
      loading.value = false
    }
  }

  // 保存配置
  async function saveConfig(options: SaveConfigOptions = {}): Promise<boolean> {
    saving.value = true
    try {
      const currentConfig = (await window.api.config.getConfig()) as AppConfig | null
      const plainThemeConfig = deepClone(themeConfig.value)
      const plainLlmConfigs = deepClone(llmConfigs.value)
      const plainPaperReaderConfig = deepClone(paperReaderConfig.value)
      const baseConfig = currentConfig
        ? deepClone(currentConfig)
        : ({
            theme: plainThemeConfig,
            llm_config: {
              default_model: defaultModel.value,
              compression_threshold: 0,
              enable_auto_compression: false,
              models: []
            },
            mcpServers: {},
            paperReader: plainPaperReaderConfig
          } satisfies AppConfig)

      const nextConfig: AppConfig = {
        ...baseConfig,
        theme: plainThemeConfig,
        llm_config: {
          ...baseConfig.llm_config,
          default_model: defaultModel.value,
          models: plainLlmConfigs
        },
        paperReader: plainPaperReaderConfig
      }

      const result = await window.api.config.saveConfig(nextConfig)
      if (result.success) {
        if (!options.silent) {
          const notify = useNotification()
          notify.success('配置保存成功', '', { source: 'config' })
        }
        return true
      } else {
        const msg = result.error || '保存失败'
        const notify = useNotification()
        notify.error('配置保存失败', msg, { source: 'config' })
        return false
      }
    } catch (error) {
      const msg = `保存配置失败: ${error instanceof Error ? error.message : String(error)}`
      const notify = useNotification()
      notify.error('配置保存失败', msg, { source: 'config' })
      return false
    } finally {
      saving.value = false
    }
  }

  // 更新主题配置
  function updateThemeConfig(config: ThemeConfig): void {
    themeConfig.value = { ...config }
  }

  // 更新模型配置列表
  function updateLLMConfigs(configs: LLMConfig[]): void {
    llmConfigs.value = configs
  }

  // 更新默认模型
  function updateDefaultModel(modelName: string): void {
    defaultModel.value = modelName
  }

  // 添加模型配置
  function addModelConfig(config: LLMConfig): void {
    llmConfigs.value.push(config)
    // 如果是第一个模型，设为默认
    if (llmConfigs.value.length === 1) {
      defaultModel.value = config.model_name
    }
  }

  // 删除模型配置
  function deleteModelConfig(modelName: string): void {
    const index = llmConfigs.value.findIndex((m) => m.model_name === modelName)
    if (index !== -1) {
      llmConfigs.value.splice(index, 1)
      // 如果删除的是默认模型，重新设置默认
      if (defaultModel.value === modelName) {
        defaultModel.value = llmConfigs.value.length > 0 ? llmConfigs.value[0].model_name : ''
      }
    }
  }

  // 更新指定模型的配置
  function updateModelConfigField(
    modelName: string,
    field: keyof LLMConfig,
    value: string | number
  ): void {
    const config = llmConfigs.value.find((m) => m.model_name === modelName)
    if (config) {
      ;(config as Record<string, string | number>)[field] = value
    }
  }

  // 更新论文阅读配置
  function updatePaperReaderConfig(config: Partial<PaperReaderConfig>): void {
    paperReaderConfig.value = { ...paperReaderConfig.value, ...config }
  }

  return {
    // State
    loading,
    saving,
    themeConfig,
    llmConfigs,
    defaultModel,
    paperReaderConfig,
    // Getters
    hasModels,
    defaultModelConfig,
    // Actions
    loadConfig,
    saveConfig,
    updateThemeConfig,
    updateLLMConfigs,
    updateDefaultModel,
    addModelConfig,
    deleteModelConfig,
    updateModelConfigField,
    updatePaperReaderConfig
  }
})
