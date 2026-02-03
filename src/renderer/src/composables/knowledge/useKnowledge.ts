import { ref, onMounted } from 'vue'
import type { Ref } from 'vue'
import type { KnowledgeBase } from '@renderer/types'

/**
 * useKnowledge 返回类型
 */
export interface UseKnowledgeReturn {
  knowledgeBases: Ref<KnowledgeBase[]>
  activeKbId: Ref<string | undefined>
  showKnowledgeForm: Ref<boolean>
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
  // 知识库列表
  const knowledgeBases = ref<KnowledgeBase[]>([])

  // 当前激活的知识库 ID
  const activeKbId = ref<string>()

  // 显示知识库表单
  const showKnowledgeForm = ref(false)

  /**
   * 加载知识库列表
   */
  async function loadKnowledgeBases(): Promise<void> {
    try {
      const result = await window.api.knowledge.getAll()
      if (result.success && result.data) {
        knowledgeBases.value = result.data
      }
    } catch (error) {
      console.error('加载知识库列表失败:', error)
    }
  }

  /**
   * 选择知识库
   */
  function handleSelectKB(kbId: string): void {
    activeKbId.value = kbId
  }

  /**
   * 显示创建知识库表单
   */
  function handleCreateKB(): void {
    showKnowledgeForm.value = true
  }

  /**
   * 删除知识库
   */
  async function handleDeleteKB(kbId: string): Promise<void> {
    if (confirm('确定要删除这个知识库吗？此操作不可撤销。')) {
      const result = await window.api.knowledge.delete(kbId)
      if (result.success) {
        knowledgeBases.value = knowledgeBases.value.filter((kb) => kb.id !== kbId)
        if (activeKbId.value === kbId) {
          activeKbId.value = undefined
        }
      } else {
        alert('删除知识库失败: ' + (result.error || '未知错误'))
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
    try {
      // 直接创建知识库记录（使用已配置的嵌入模型）
      const createResult = await window.api.knowledge.create({
        name: data.name,
        description: data.description,
        embeddingConfig: data.embeddingConfig,
        embeddingDimension: data.embeddingDimension,
        chunkSize: data.chunkSize,
        chunkOverlap: data.chunkOverlap,
        documentCount: 0,
        linkedFileIds: []
      })

      if (!createResult.success || !createResult.data) {
        alert('创建知识库失败: ' + (createResult.error || '未知错误'))
        return
      }

      knowledgeBases.value.unshift(createResult.data)
      showKnowledgeForm.value = false
      activeKbId.value = createResult.data.id
    } catch (error) {
      console.error('创建知识库失败:', error)
      alert('创建知识库失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  /**
   * 取消知识库表单
   */
  function handleKnowledgeCancel(): void {
    showKnowledgeForm.value = false
  }

  // 组件挂载时加载知识库列表
  onMounted(async () => {
    await loadKnowledgeBases()
  })

  return {
    knowledgeBases,
    activeKbId,
    showKnowledgeForm,
    loadKnowledgeBases,
    handleSelectKB,
    handleCreateKB,
    handleDeleteKB,
    handleKnowledgeSubmit,
    handleKnowledgeCancel
  }
}
