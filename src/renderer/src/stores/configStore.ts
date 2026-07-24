import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_OCR_PROVIDER,
  type AppConfig,
  type ThemeConfig,
  type ThemeMode,
  type LLMConfig,
  type PaperReaderConfig
} from '@shared/types/config'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import { deepClone } from '@shared/utils'

interface SaveConfigOptions {
  silent?: boolean
}

interface ConfigState {
  loading: boolean
  saving: boolean
  themeConfig: ThemeConfig
  llmConfigs: LLMConfig[]
  defaultModel: string
  paperReaderConfig: PaperReaderConfig

  hasModels: () => boolean
  defaultModelConfig: () => LLMConfig | undefined

  loadConfig: () => Promise<void>
  saveConfig: (options?: SaveConfigOptions) => Promise<boolean>
  updateThemeConfig: (config: ThemeConfig) => void
  updateLLMConfigs: (configs: LLMConfig[]) => void
  updateDefaultModel: (modelName: string) => void
  addModelConfig: (config: LLMConfig) => void
  deleteModelConfig: (modelName: string) => void
  updateModelConfigField: (modelName: string, field: keyof LLMConfig, value: string) => void
  updatePaperReaderConfig: (config: Partial<PaperReaderConfig>) => void
}

function notifyError(title: string, message: string): void {
  useNotificationCenterStore.getState().add('error', title, message, { source: 'config' })
}

function notifySuccess(title: string, message: string): void {
  useNotificationCenterStore.getState().add('success', title, message, { source: 'config' })
}

/**
 * 配置管理 Store
 * 管理应用全局配置的加载、保存和修改，包括主题、LLM 模型、论文阅读器等
 */
export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      loading: false,
      saving: false,
      themeConfig: { name: 'lumina-dark', mode: 'manual' },
      llmConfigs: [],
      defaultModel: '',
      paperReaderConfig: {
        ocr: { provider: DEFAULT_OCR_PROVIDER },
        zoomLevel: 1,
        originalPdfZoomLevel: 1
      },

      hasModels: () => get().llmConfigs.length > 0,
      defaultModelConfig: () => get().llmConfigs.find((m) => m.model_name === get().defaultModel),

      loadConfig: async () => {
        // 从主进程加载配置，合并到本地状态
        set({ loading: true })
        try {
          const config = (await window.api.config.getConfig()) as AppConfig | null
          if (config) {
            const patch: Partial<ConfigState> = {}
            if (config.theme) {
              patch.themeConfig = {
                name: config.theme.name || 'lumina-dark',
                mode: (config.theme.mode as ThemeMode | undefined) || 'manual'
              }
            }
            if (config.llm_config?.models) {
              patch.llmConfigs = config.llm_config.models
            }
            patch.defaultModel = config.llm_config?.default_model || ''
            if (config.paperReader) {
              patch.paperReaderConfig = { ...get().paperReaderConfig, ...config.paperReader }
            }
            set(patch)
          }
        } catch (error) {
          const msg = `加载配置失败: ${error instanceof Error ? error.message : String(error)}`
          notifyError('配置加载失败', msg)
        } finally {
          set({ loading: false })
        }
      },

      saveConfig: async (options) => {
        // 保存配置到主进程，失败时通知用户
        set({ saving: true })
        try {
          const currentConfig = (await window.api.config.getConfig()) as AppConfig | null
          const state = get()
          const plainThemeConfig = deepClone(state.themeConfig)
          const plainLlmConfigs = deepClone(state.llmConfigs)
          const plainPaperReaderConfig = deepClone(state.paperReaderConfig)
          const baseConfig = currentConfig
            ? deepClone(currentConfig)
            : ({
                theme: plainThemeConfig,
                llm_config: {
                  default_model: state.defaultModel,
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
              default_model: state.defaultModel,
              models: plainLlmConfigs
            },
            paperReader: plainPaperReaderConfig
          }

          const result = await window.api.config.saveConfig(nextConfig)
          if (result.success) {
            if (!options?.silent) {
              notifySuccess('配置保存成功', '')
            }
            return true
          } else {
            const msg = result.error || '保存失败'
            notifyError('配置保存失败', msg)
            return false
          }
        } catch (error) {
          const msg = `保存配置失败: ${error instanceof Error ? error.message : String(error)}`
          notifyError('配置保存失败', msg)
          return false
        } finally {
          set({ saving: false })
        }
      },

      updateThemeConfig: (config) => set({ themeConfig: { ...config } }),

      updateLLMConfigs: (configs) => set({ llmConfigs: configs }),

      updateDefaultModel: (modelName) => set({ defaultModel: modelName }),

      addModelConfig: (config) =>
        set((state) => {
          // 添加模型配置，如果是第一个模型则自动设为默认
          const next = [...state.llmConfigs, config]
          const defaultModel =
            state.llmConfigs.length === 0 ? config.model_name : state.defaultModel
          return { llmConfigs: next, defaultModel }
        }),

      deleteModelConfig: (modelName) =>
        set((state) => {
          // 删除模型配置，如果删除的是默认模型则自动选用下一个可用模型
          const next = state.llmConfigs.filter((m) => m.model_name !== modelName)
          const defaultModel =
            state.defaultModel === modelName
              ? next.length > 0
                ? next[0].model_name
                : ''
              : state.defaultModel
          return { llmConfigs: next, defaultModel }
        }),

      updateModelConfigField: (modelName, field, value) =>
        set((state) => ({
          llmConfigs: state.llmConfigs.map((m) =>
            m.model_name === modelName ? { ...m, [field]: value } : m
          )
        })),

      updatePaperReaderConfig: (config) =>
        set((state) => ({ paperReaderConfig: { ...state.paperReaderConfig, ...config } }))
    }),
    {
      name: 'lumina-config',
      partialize: (state) => ({
        themeConfig: state.themeConfig,
        defaultModel: state.defaultModel,
        paperReaderConfig: state.paperReaderConfig
      })
    }
  )
)
