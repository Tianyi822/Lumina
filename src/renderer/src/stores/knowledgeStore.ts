// Knowledge Store
// 管理知识库列表、嵌入模型配置和表单状态

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { KnowledgeBase, KnowledgeBaseEmbeddingConfig } from '@renderer/types'
import type { EmbeddingConfig } from '@shared/types/config'

// 知识库创建输入
export interface CreateKnowledgeBaseInput {
  name: string
  description: string
  embeddingConfig: KnowledgeBaseEmbeddingConfig
  embeddingDimension: number
  chunkSize: number
  chunkOverlap: number
  documentCount: number
  linkedFileIds: string[]
}

export const useKnowledgeStore = defineStore(
  'knowledge',
  () => {
    // ==================== State ====================
    
    // 知识库列表
    const knowledgeBases = ref<KnowledgeBase[]>([])

    // 当前激活的知识库 ID（持久化）
    const activeKbId = ref<string | null>(null)

    // 嵌入模型配置
    const embeddingModels = ref<Record<string, EmbeddingConfig>>({})

    // 显示知识库表单
    const showForm = ref(false)

    // 正在编辑的知识库（null 表示新建）
    const editingKb = ref<KnowledgeBase | null>(null)

    // 加载状态
    const loading = ref(false)

    // 嵌入模型加载状态
    const embeddingLoading = ref(false)

    // 错误信息
    const error = ref<string | null>(null)

    // ==================== Getters ====================
    
    // 获取当前激活的知识库
    const activeKnowledgeBase = computed(() => {
      if (!activeKbId.value) return null
      return knowledgeBases.value.find((kb) => kb.id === activeKbId.value) || null
    })

    // 知识库数量
    const knowledgeBaseCount = computed(() => knowledgeBases.value.length)

    // 嵌入模型列表（数组形式）
    const embeddingModelList = computed(() => {
      return Object.entries(embeddingModels.value).map(([id, config]) => ({
        id,
        ...config
      }))
    })

    // 是否正在编辑（而非创建）
    const isEditing = computed(() => editingKb.value !== null)

    // ==================== Actions: 知识库管理 ====================
    
    // 加载知识库列表
    async function loadKnowledgeBases(): Promise<void> {
      loading.value = true
      error.value = null
      try {
        const result = await window.api.knowledge.getAll()
        if (result.success && result.data) {
          knowledgeBases.value = result.data
          window.api.logger?.debug('[KnowledgeStore] 加载知识库完成', {
            count: knowledgeBases.value.length
          })
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        window.api.logger?.error('[KnowledgeStore] 加载知识库失败', { error: error.value })
      } finally {
        loading.value = false
      }
    }

    // 创建知识库
    async function createKnowledgeBase(data: CreateKnowledgeBaseInput): Promise<string | null> {
      loading.value = true
      error.value = null
      try {
        const createResult = await window.api.knowledge.create(data)

        if (!createResult.success || !createResult.data) {
          error.value = createResult.error || '创建失败'
          return null
        }

        knowledgeBases.value.unshift(createResult.data)
        activeKbId.value = createResult.data.id

        window.api.logger?.info('[KnowledgeStore] 创建知识库成功', {
          id: createResult.data.id,
          name: data.name
        })

        return createResult.data.id
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        window.api.logger?.error('[KnowledgeStore] 创建知识库失败', { error: error.value })
        return null
      } finally {
        loading.value = false
      }
    }

    // 更新知识库
    async function updateKnowledgeBase(id: string, data: Partial<KnowledgeBase>): Promise<boolean> {
      loading.value = true
      error.value = null
      try {
        const result = await window.api.knowledge.update(id, data)
        if (result.success) {
          // 更新本地数据
          const index = knowledgeBases.value.findIndex((kb) => kb.id === id)
          if (index >= 0 && result.data) {
            knowledgeBases.value[index] = result.data
          }
          window.api.logger?.info('[KnowledgeStore] 更新知识库成功', { id })
          return true
        } else {
          error.value = result.error || '更新失败'
          return false
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        window.api.logger?.error('[KnowledgeStore] 更新知识库失败', { error: error.value })
        return false
      } finally {
        loading.value = false
      }
    }

    // 删除知识库
    // 如果知识库正在索引，会先停止索引操作并清理状态
    async function deleteKnowledgeBase(id: string): Promise<boolean> {
      loading.value = true
      error.value = null
      try {
        // 1. 先停止知识库的索引操作（如果正在进行）
        // 这会取消队列中的任务并停止当前的索引
        const stopResult = await window.api.knowledge.stopIndexing(id)
        if (stopResult.success && stopResult.data?.stopped) {
          window.api.logger?.info('[KnowledgeStore] 已停止知识库索引', { id })
        }

        // 2. 调用后端删除知识库
        const result = await window.api.knowledge.delete(id)
        if (result.success) {
          // 3. 更新本地知识库列表
          knowledgeBases.value = knowledgeBases.value.filter((kb) => kb.id !== id)
          if (activeKbId.value === id) {
            activeKbId.value = null
          }
          window.api.logger?.info('[KnowledgeStore] 删除知识库成功', { id })
          return true
        } else {
          error.value = result.error || '删除失败'
          window.api.logger?.error('[KnowledgeStore] 删除知识库失败', {
            id,
            error: result.error
          })
          return false
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e)
        window.api.logger?.error('[KnowledgeStore] 删除知识库失败', { id, error: error.value })
        return false
      } finally {
        loading.value = false
      }
    }

    // 获取知识库详情
    function getKnowledgeBase(id: string): KnowledgeBase | undefined {
      return knowledgeBases.value.find((kb) => kb.id === id)
    }

    // ==================== Actions: 选择管理 ====================
    
    // 设置当前激活的知识库
    function setActiveKb(kbId: string | null): void {
      activeKbId.value = kbId
      window.api.logger?.debug('[KnowledgeStore] 设置激活知识库', { kbId })
    }

    // 切换到指定知识库
    async function switchToKb(kbId: string): Promise<void> {
      setActiveKb(kbId)
      // 可以在这里添加额外的初始化逻辑
    }

    // ==================== Actions: 嵌入模型管理 ====================
    
    // 加载所有嵌入模型
    async function loadEmbeddingModels(): Promise<void> {
      embeddingLoading.value = true
      try {
        const result = await window.api.embeddingModels.getAll()
        if (result.success && result.data) {
          embeddingModels.value = result.data
          window.api.logger?.debug('[KnowledgeStore] 加载嵌入模型完成', {
            count: Object.keys(embeddingModels.value).length
          })
        }
      } catch (e) {
        window.api.logger?.error('[KnowledgeStore] 加载嵌入模型失败', { error: e })
      } finally {
        embeddingLoading.value = false
      }
    }

    // 根据 ID 获取嵌入模型
    async function getEmbeddingModel(id: string): Promise<EmbeddingConfig | null> {
      const result = await window.api.embeddingModels.getById(id)
      if (result.success && result.data) {
        return result.data
      }
      return null
    }

    // 保存嵌入模型
    async function saveEmbeddingModel(id: string, config: EmbeddingConfig): Promise<boolean> {
      try {
        const result = await window.api.embeddingModels.save(id, config)
        if (result.success) {
          await loadEmbeddingModels()
          window.api.logger?.info('[KnowledgeStore] 保存嵌入模型成功', { id })
          return true
        }
        return false
      } catch (e) {
        window.api.logger?.error('[KnowledgeStore] 保存嵌入模型失败', { error: e })
        return false
      }
    }

    // 删除嵌入模型
    async function deleteEmbeddingModel(id: string): Promise<boolean> {
      try {
        const result = await window.api.embeddingModels.delete(id)
        if (result.success) {
          await loadEmbeddingModels()
          window.api.logger?.info('[KnowledgeStore] 删除嵌入模型成功', { id })
          return true
        }
        return false
      } catch (e) {
        window.api.logger?.error('[KnowledgeStore] 删除嵌入模型失败', { error: e })
        return false
      }
    }

    // 测试嵌入模型连接
    async function testEmbeddingModel(id: string): Promise<{ success: boolean; error?: string }> {
      return await window.api.embeddingModels.test(id)
    }

    // ==================== Actions: 表单管理 ====================
    
    // 打开创建表单
    function openCreateForm(): void {
      editingKb.value = null
      showForm.value = true
    }

    // 打开编辑表单
    function openEditForm(kb: KnowledgeBase): void {
      editingKb.value = kb
      showForm.value = true
    }

    // 关闭表单
    function closeForm(): void {
      editingKb.value = null
      showForm.value = false
    }

    // 处理表单提交
    async function handleFormSubmit(data: {
      name: string
      description: string
      embeddingConfig: KnowledgeBaseEmbeddingConfig
      embeddingDimension: number
      chunkSize: number
      chunkOverlap: number
    }): Promise<boolean> {
      if (editingKb.value) {
        // 编辑模式
        const success = await updateKnowledgeBase(editingKb.value.id, {
          name: data.name,
          description: data.description
        })
        if (success) {
          closeForm()
        }
        return success
      } else {
        // 创建模式
        const id = await createKnowledgeBase({
          ...data,
          documentCount: 0,
          linkedFileIds: []
        })
        if (id) {
          closeForm()
          return true
        }
        return false
      }
    }

    return {
      // State
      knowledgeBases,
      activeKbId,
      embeddingModels,
      showForm,
      editingKb,
      loading,
      embeddingLoading,
      error,

      // Getters
      activeKnowledgeBase,
      knowledgeBaseCount,
      embeddingModelList,
      isEditing,

      // Actions: 知识库管理
      loadKnowledgeBases,
      createKnowledgeBase,
      updateKnowledgeBase,
      deleteKnowledgeBase,
      getKnowledgeBase,

      // Actions: 选择管理
      setActiveKb,
      switchToKb,

      // Actions: 嵌入模型管理
      loadEmbeddingModels,
      getEmbeddingModel,
      saveEmbeddingModel,
      deleteEmbeddingModel,
      testEmbeddingModel,

      // Actions: 表单管理
      openCreateForm,
      openEditForm,
      closeForm,
      handleFormSubmit
    }
  },
  {
    // 持久化配置
    persist: {
      key: 'sparrow-knowledge-state',
      pick: ['activeKbId']
    }
  }
)
