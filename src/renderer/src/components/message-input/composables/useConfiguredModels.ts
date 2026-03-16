import { ref, watch, onMounted, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { AppConfig } from '@renderer/types'
import { useUIStateStore } from '@renderer/stores'

interface UseConfiguredModelsReturn {
  modelOptions: Ref<string[]>
  loadConfiguredModels: () => Promise<void>
}

/**
 * 已配置模型加载逻辑
 */
export function useConfiguredModels(
  selectedModel: Ref<string>,
  updateSelectedModel: (value: string) => void
): UseConfiguredModelsReturn {
  const modelOptions = ref<string[]>([])
  const uiStateStore = useUIStateStore()
  const { configUpdateKey } = storeToRefs(uiStateStore)

  async function loadConfiguredModels(): Promise<void> {
    try {
      const config = (await window.api.config.getConfig()) as AppConfig | null

      if (!config?.llm_config?.models) {
        modelOptions.value = []
        if (selectedModel.value) {
          updateSelectedModel('')
        }
        return
      }

      modelOptions.value = config.llm_config.models.map((model) => model.model_name)

      if (selectedModel.value && modelOptions.value.includes(selectedModel.value)) {
        return
      }

      const defaultModel = config.llm_config.default_model
      if (defaultModel && modelOptions.value.includes(defaultModel)) {
        updateSelectedModel(defaultModel)
      } else {
        updateSelectedModel(modelOptions.value[0] || '')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[MessageInput] 加载模型配置失败', { error: errorMessage })
      modelOptions.value = []

      if (selectedModel.value) {
        updateSelectedModel('')
      }
    }
  }

  watch(configUpdateKey, () => {
    void loadConfiguredModels()
  })

  onMounted(() => {
    void loadConfiguredModels()
  })

  return {
    modelOptions,
    loadConfiguredModels
  }
}
