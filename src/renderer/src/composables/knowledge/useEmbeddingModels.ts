/**
 * 嵌入模型管理 Composable
 * 作为 knowledgeStore 的包装层，保持向后兼容
 */

import { type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { EmbeddingConfig } from '@shared/types/config'
import { useKnowledgeStore } from '@renderer/stores/knowledgeStore'

/**
 * useEmbeddingModels 返回类型
 */
export interface UseEmbeddingModelsReturn {
  embeddingModels: Ref<Record<string, EmbeddingConfig>>
  loading: Ref<boolean>
  loadModels: () => Promise<void>
  getModel: (id: string) => Promise<EmbeddingConfig | null>
  saveModel: (id: string, config: EmbeddingConfig) => Promise<boolean>
  deleteModel: (id: string) => Promise<boolean>
  testModel: (id: string) => Promise<{ success: boolean; error?: string }>
}

/**
 * 嵌入模型管理 Composable
 */
export function useEmbeddingModels(): UseEmbeddingModelsReturn {
  const knowledgeStore = useKnowledgeStore()

  // 从 Store 获取响应式引用
  const { embeddingModels, embeddingLoading } = storeToRefs(knowledgeStore)

  // 兼容旧的命名
  const loading = embeddingLoading

  /**
   * 加载所有嵌入模型
   */
  async function loadModels(): Promise<void> {
    await knowledgeStore.loadEmbeddingModels()
  }

  /**
   * 根据ID获取模型
   */
  async function getModel(id: string): Promise<EmbeddingConfig | null> {
    return await knowledgeStore.getEmbeddingModel(id)
  }

  /**
   * 保存模型（新增或更新）
   */
  async function saveModel(id: string, config: EmbeddingConfig): Promise<boolean> {
    return await knowledgeStore.saveEmbeddingModel(id, config)
  }

  /**
   * 删除模型
   */
  async function deleteModel(id: string): Promise<boolean> {
    return await knowledgeStore.deleteEmbeddingModel(id)
  }

  /**
   * 测试模型连接
   */
  async function testModel(id: string): Promise<{ success: boolean; error?: string }> {
    return await knowledgeStore.testEmbeddingModel(id)
  }

  return {
    embeddingModels,
    loading,
    loadModels,
    getModel,
    saveModel,
    deleteModel,
    testModel
  }
}
