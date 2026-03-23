// 应用配置 Store
// 统一管理主题、模型、提示词等配置状态

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  createDefaultVideoGenerationConfig,
  type AppConfig,
  type ThemeConfig,
  type LLMConfig,
  type VoiceRecognitionConfig,
  type VideoGenerationConfig
} from '@shared/types/config'
import { deepClone } from '@shared/utils'

interface SaveConfigOptions {
  silent?: boolean
}

export const useConfigStore = defineStore('config', () => {
  // ==================== State ====================

  // 加载状态
  const loading = ref(false)
  const saving = ref(false)
  const errorMessage = ref('')
  const successMessage = ref('')

  // 主题配置
  const themeConfig = ref<ThemeConfig>({
    name: 'blooming-flowers'
  })

  // 模型配置
  const llmConfigs = ref<LLMConfig[]>([])
  const defaultModel = ref('')

  // 语音识别配置
  const voiceRecognitionConfig = ref<VoiceRecognitionConfig>({
    provider: 'aliyun',
    enabled: false
  })

  // 视频生成配置
  const videoGenerationConfig = ref<VideoGenerationConfig>(createDefaultVideoGenerationConfig())

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
    errorMessage.value = ''
    try {
      const config = (await window.api.config.getConfig()) as AppConfig | null
      if (config) {
        // 加载主题配置
        if (config.theme) {
          themeConfig.value.name = config.theme.name || 'blooming-flowers'
        }
        // 加载模型配置
        if (config.llm_config?.models) {
          llmConfigs.value = config.llm_config.models
        }
        defaultModel.value = config.llm_config?.default_model || ''
        // 加载语音识别配置
        if (config.voiceRecognition) {
          voiceRecognitionConfig.value = {
            ...voiceRecognitionConfig.value,
            ...config.voiceRecognition
          }
        }
        videoGenerationConfig.value = {
          ...createDefaultVideoGenerationConfig(),
          ...config.videoGeneration
        }
      }
    } catch (error) {
      errorMessage.value = `加载配置失败: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      loading.value = false
    }
  }

  // 保存配置
  async function saveConfig(options: SaveConfigOptions = {}): Promise<boolean> {
    saving.value = true
    errorMessage.value = ''
    if (!options.silent) {
      successMessage.value = ''
    }
    try {
      const plainThemeConfig = deepClone(themeConfig.value)
      const plainLlmConfigs = deepClone(llmConfigs.value)
      const plainVoiceRecognitionConfig = deepClone(voiceRecognitionConfig.value)
      const plainVideoGenerationConfig = deepClone(videoGenerationConfig.value)

      const result = await window.api.config.updateConfig({
        theme: plainThemeConfig,
        llm_config: {
          default_model: defaultModel.value,
          compression_threshold: 0,
          enable_auto_compression: false,
          models: plainLlmConfigs
        },
        voiceRecognition: plainVoiceRecognitionConfig,
        videoGeneration: plainVideoGenerationConfig
      })
      if (result.success) {
        if (!options.silent) {
          successMessage.value = '配置保存成功'
          setTimeout(() => {
            successMessage.value = ''
          }, 2000)
        }
        return true
      } else {
        errorMessage.value = result.error || '保存失败'
        return false
      }
    } catch (error) {
      errorMessage.value = `保存配置失败: ${error instanceof Error ? error.message : String(error)}`
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

  // 更新语音识别配置
  function updateVoiceRecognitionConfig(config: VoiceRecognitionConfig): void {
    voiceRecognitionConfig.value = { ...voiceRecognitionConfig.value, ...config }
  }

  // 更新视频生成配置
  function updateVideoGenerationConfig(config: VideoGenerationConfig): void {
    videoGenerationConfig.value = { ...config }
  }

  // 清除消息
  function clearMessages(): void {
    errorMessage.value = ''
    successMessage.value = ''
  }

  return {
    // State
    loading,
    saving,
    errorMessage,
    successMessage,
    themeConfig,
    llmConfigs,
    defaultModel,
    voiceRecognitionConfig,
    videoGenerationConfig,
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
    updateVoiceRecognitionConfig,
    updateVideoGenerationConfig,
    clearMessages
  }
})
