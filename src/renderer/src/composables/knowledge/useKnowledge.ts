/**
 * 知识库管理 Composable
 * 作为 knowledgeStore 的包装层，保持向后兼容
 */

import { computed, type Ref, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import type { KnowledgeBase } from '@renderer/types'
import { useKnowledgeStore } from '@renderer/stores/knowledgeStore'

/**
 * useKnowledge 返回类型
 */
export interface UseKnowledgeReturn {
  knowledgeBases: Ref<KnowledgeBase[]>
  activeKbId: ComputedRef<string | undefined>
  showKnowledgeForm: Ref<boolean>
  loading: Ref<boolean>
  error: Ref<string | null>
  loadKnowledgeBases: () => Promise<void>
  handleSelectKB: (kbId: string) => void
  handleCreateKB: () => void
  handleDeleteKB: (kbId: string) => Promise<void>
  handleKnowledgeSubmit: (data: {
    name: string
    description: string
    embeddingConfig: {
      baseUrl: string
      apiKey?: string
      model: string
      dimensions: number
    }
    embeddingDimension: number
    chunkSize: number
    chunkOverlap: number
  }) => Promise<void>
  handleKnowledgeCancel: () => void
}

/**
 * 知识库管理 Composable
 * 负责知识库的加载、创建、删除、选择
 */
export function useKnowledge(): UseKnowledgeReturn {
  const knowledgeStore = useKnowledgeStore()

  // 从 Store 获取响应式引用
  const {
    knowledgeBases,
    activeKbId: storeActiveKbId,
    showForm,
    loading,
    error
  } = storeToRefs(knowledgeStore)

  // 兼容旧的命名和类型（将 null 转为 undefined）
  const showKnowledgeForm = showForm
  const activeKbId = computed(() => storeActiveKbId.value ?? undefined)

  /**
   * 加载知识库列表
   */
  async function loadKnowledgeBases(): Promise<void> {
    await knowledgeStore.loadKnowledgeBases()
  }

  /**
   * 选择知识库
   */
  function handleSelectKB(kbId: string): void {
    knowledgeStore.setActiveKb(kbId)
  }

  /**
   * 显示创建知识库表单
   */
  function handleCreateKB(): void {
    knowledgeStore.openCreateForm()
  }

  /**
   * 删除知识库
   */
  async function handleDeleteKB(kbId: string): Promise<void> {
    if (confirm('确定要删除这个知识库吗？此操作不可撤销。')) {
      const success = await knowledgeStore.deleteKnowledgeBase(kbId)
      if (!success) {
        alert('删除知识库失败: ' + (knowledgeStore.error || '未知错误'))
      }
    }
  }

  /**
   * 提交知识库表单
   */
  async function handleKnowledgeSubmit(data: {
    name: string
    description: string
    embeddingConfig: {
      baseUrl: string
      apiKey?: string
      model: string
      dimensions: number
    }
    embeddingDimension: number
    chunkSize: number
    chunkOverlap: number
  }): Promise<void> {
    const success = await knowledgeStore.handleFormSubmit(data)
    if (!success) {
      alert('创建知识库失败: ' + (knowledgeStore.error || '未知错误'))
    }
  }

  /**
   * 取消知识库表单
   */
  function handleKnowledgeCancel(): void {
    knowledgeStore.closeForm()
  }

  return {
    knowledgeBases,
    activeKbId,
    showKnowledgeForm,
    loading,
    error,
    loadKnowledgeBases,
    handleSelectKB,
    handleCreateKB,
    handleDeleteKB,
    handleKnowledgeSubmit,
    handleKnowledgeCancel
  }
}
