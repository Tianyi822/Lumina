import { ref } from 'vue'
import type { EmbeddingConfig } from '@shared/types/config'

/**
 * 嵌入模型管理 Composable
 */
export function useEmbeddingModels() {
  const embeddingModels = ref<Record<string, EmbeddingConfig>>({})
  const defaultModelId = ref<string | undefined>(undefined)
  const loading = ref(false)

  /**
   * 加载所有嵌入模型
   */
  async function loadModels(): Promise<void> {
    loading.value = true
    try {
      const result = await window.api.embeddingModels.getAll()
      if (result.success && result.data) {
        embeddingModels.value = result.data
      }
      // 同时加载默认模型ID
      const appConfig = (await window.api.config.getConfig()) as {
        defaultEmbeddingModel?: string
      } | null
      if (appConfig && typeof appConfig === 'object') {
        defaultModelId.value = appConfig.defaultEmbeddingModel
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * 根据ID获取模型
   */
  async function getModel(id: string): Promise<EmbeddingConfig | null> {
    const result = await window.api.embeddingModels.getById(id)
    if (result.success && result.data) {
      return result.data
    }
    return null
  }

  /**
   * 保存模型（新增或更新）
   */
  async function saveModel(id: string, config: EmbeddingConfig): Promise<boolean> {
    const result = await window.api.embeddingModels.save(id, config)
    if (result.success) {
      await loadModels()
      return true
    }
    return false
  }

  /**
   * 删除模型
   */
  async function deleteModel(id: string): Promise<boolean> {
    const result = await window.api.embeddingModels.delete(id)
    if (result.success) {
      await loadModels()
      return true
    }
    return false
  }

  /**
   * 测试模型连接
   */
  async function testModel(id: string): Promise<{ success: boolean; error?: string }> {
    return await window.api.embeddingModels.test(id)
  }

  /**
   * 设置默认模型
   */
  async function setDefaultModel(id: string): Promise<boolean> {
    const result = await window.api.embeddingModels.setDefault(id)
    if (result.success) {
      defaultModelId.value = id
      await loadModels()
      return true
    }
    return false
  }

  /**
   * 获取默认模型
   */
  function getDefaultModel(): EmbeddingConfig | null {
    if (defaultModelId.value && embeddingModels.value[defaultModelId.value]) {
      return embeddingModels.value[defaultModelId.value]
    }
    return null
  }

  /**
   * 检查模型是否为默认模型
   */
  function isDefaultModel(id: string): boolean {
    return defaultModelId.value === id
  }

  return {
    embeddingModels,
    defaultModelId,
    loading,
    loadModels,
    getModel,
    saveModel,
    deleteModel,
    testModel,
    setDefaultModel,
    getDefaultModel,
    isDefaultModel
  }
}
