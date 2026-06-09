import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { KnowledgeBase, KnowledgeBaseEmbeddingConfig } from '@renderer/types'
import type { EmbeddingConfig } from '@shared/types/config'

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

interface KnowledgeState {
  knowledgeBases: KnowledgeBase[]
  activeKbId: string | null
  embeddingModels: Record<string, EmbeddingConfig>
  showForm: boolean
  editingKb: KnowledgeBase | null
  loading: boolean
  embeddingLoading: boolean
  error: string | null

  activeKnowledgeBase: () => KnowledgeBase | null
  knowledgeBaseCount: () => number
  embeddingModelList: () => Array<EmbeddingConfig & { id: string }>
  isEditing: () => boolean

  loadKnowledgeBases: () => Promise<void>
  createKnowledgeBase: (data: CreateKnowledgeBaseInput) => Promise<string | null>
  updateKnowledgeBase: (id: string, data: Partial<KnowledgeBase>) => Promise<boolean>
  deleteKnowledgeBase: (id: string) => Promise<boolean>
  getKnowledgeBase: (id: string) => KnowledgeBase | undefined

  linkFilesToKB: (kbId: string, fileIds: string[]) => void
  unlinkFileFromKB: (kbId: string, fileId: string) => void

  setActiveKb: (kbId: string | null) => void
  switchToKb: (kbId: string) => Promise<void>

  loadEmbeddingModels: () => Promise<void>
  getEmbeddingModel: (id: string) => Promise<EmbeddingConfig | null>
  saveEmbeddingModel: (id: string, config: EmbeddingConfig) => Promise<boolean>
  deleteEmbeddingModel: (id: string) => Promise<boolean>
  testEmbeddingModel: (id: string) => Promise<{ success: boolean; error?: string }>

  openCreateForm: () => void
  openEditForm: (kb: KnowledgeBase) => void
  closeForm: () => void
  handleFormSubmit: (data: {
    name: string
    description: string
    embeddingConfig: KnowledgeBaseEmbeddingConfig
    embeddingDimension: number
    chunkSize: number
    chunkOverlap: number
  }) => Promise<boolean>
}

/**
 * 知识库 Store
 * 管理知识库的 CRUD、嵌入模型配置、知识库切换及表单状态
 */
export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set, get) => ({
      knowledgeBases: [],
      activeKbId: null,
      embeddingModels: {},
      showForm: false,
      editingKb: null,
      loading: false,
      embeddingLoading: false,
      error: null,

      activeKnowledgeBase: () => {
        const state = get()
        if (!state.activeKbId) return null
        return state.knowledgeBases.find((kb) => kb.id === state.activeKbId) || null
      },

      knowledgeBaseCount: () => get().knowledgeBases.length,

      embeddingModelList: () =>
        Object.entries(get().embeddingModels).map(([id, config]) => ({ id, ...config })),

      isEditing: () => get().editingKb !== null,

      /** 加载所有知识库列表 */
      loadKnowledgeBases: async () => {
        set({ loading: true, error: null })
        try {
          const result = await window.api.knowledge.getAll()
          if (result.success && result.data) {
            set({ knowledgeBases: result.data })
          }
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) })
        } finally {
          set({ loading: false })
        }
      },

      /** 创建知识库，成功后自动设为当前知识库 */
      createKnowledgeBase: async (data) => {
        set({ loading: true, error: null })
        try {
          const createResult = await window.api.knowledge.create(data)
          if (!createResult.success || !createResult.data) {
            set({ error: createResult.error || '创建失败' })
            return null
          }

          set((state) => ({
            knowledgeBases: [createResult.data!, ...state.knowledgeBases],
            activeKbId: createResult.data!.id
          }))

          return createResult.data.id
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) })
          return null
        } finally {
          set({ loading: false })
        }
      },

      /** 更新知识库信息 */
      updateKnowledgeBase: async (id, data) => {
        set({ loading: true, error: null })
        try {
          const result = await window.api.knowledge.update(id, data)
          if (result.success) {
            set((state) => {
              const index = state.knowledgeBases.findIndex((kb) => kb.id === id)
              if (index < 0) return {}
              const next = [...state.knowledgeBases]
              if (result.data) next[index] = result.data
              return { knowledgeBases: next }
            })
            return true
          } else {
            set({ error: result.error || '更新失败' })
            return false
          }
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) })
          return false
        } finally {
          set({ loading: false })
        }
      },

      /** 删除知识库（先停止索引，再删除） */
      deleteKnowledgeBase: async (id) => {
        set({ loading: true, error: null })
        try {
          await window.api.knowledge.stopIndexing(id)
          const result = await window.api.knowledge.delete(id)
          if (result.success) {
            set((state) => ({
              knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id),
              activeKbId: state.activeKbId === id ? null : state.activeKbId
            }))
            return true
          } else {
            set({ error: result.error || '删除失败' })
            return false
          }
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) })
          return false
        } finally {
          set({ loading: false })
        }
      },

      getKnowledgeBase: (id) => get().knowledgeBases.find((kb) => kb.id === id),

      /** 将文件关联到知识库 */
      linkFilesToKB: (kbId, fileIds) => {
        set((state) => ({
          knowledgeBases: state.knowledgeBases.map((kb) =>
            kb.id === kbId
              ? {
                  ...kb,
                  linkedFileIds: [...(kb.linkedFileIds || []), ...fileIds],
                  documentCount: (kb.linkedFileIds?.length || 0) + fileIds.length
                }
              : kb
          )
        }))
      },

      /** 取消文件与知识库的关联 */
      unlinkFileFromKB: (kbId, fileId) => {
        set((state) => ({
          knowledgeBases: state.knowledgeBases.map((kb) =>
            kb.id === kbId
              ? {
                  ...kb,
                  linkedFileIds: (kb.linkedFileIds || []).filter((id) => id !== fileId),
                  documentCount: Math.max(0, (kb.linkedFileIds?.length || 0) - 1)
                }
              : kb
          )
        }))
      },

      setActiveKb: (kbId) => set({ activeKbId: kbId }),

      /** 切换到指定知识库 */
      switchToKb: async (kbId) => {
        set({ activeKbId: kbId })
      },

      /** 加载所有嵌入模型配置 */
      loadEmbeddingModels: async () => {
        set({ embeddingLoading: true })
        try {
          const result = await window.api.embeddingModels.getAll()
          if (result.success && result.data) {
            set({ embeddingModels: result.data })
          }
        } catch {
          // silent
        } finally {
          set({ embeddingLoading: false })
        }
      },

      getEmbeddingModel: async (id) => {
        const result = await window.api.embeddingModels.getById(id)
        if (result.success && result.data) return result.data
        return null
      },

      saveEmbeddingModel: async (id, config) => {
        try {
          const result = await window.api.embeddingModels.save(id, config)
          if (result.success) {
            await get().loadEmbeddingModels()
            return true
          }
          return false
        } catch {
          return false
        }
      },

      deleteEmbeddingModel: async (id) => {
        try {
          const result = await window.api.embeddingModels.delete(id)
          if (result.success) {
            await get().loadEmbeddingModels()
            return true
          }
          return false
        } catch {
          return false
        }
      },

      testEmbeddingModel: async (id) => {
        return await window.api.embeddingModels.test(id)
      },

      openCreateForm: () => set({ editingKb: null, showForm: true }),

      openEditForm: (kb) => set({ editingKb: kb, showForm: true }),

      closeForm: () => set({ editingKb: null, showForm: false }),

      /** 提交创建/编辑知识库表单（根据 editingKb 判断是新增还是编辑） */
      handleFormSubmit: async (data) => {
        const state = get()
        if (state.editingKb) {
          const success = await state.updateKnowledgeBase(state.editingKb.id, {
            name: data.name,
            description: data.description
          })
          if (success) set({ editingKb: null, showForm: false })
          return success
        } else {
          const id = await state.createKnowledgeBase({
            ...data,
            documentCount: 0,
            linkedFileIds: []
          })
          if (id) {
            set({ editingKb: null, showForm: false })
            return true
          }
          return false
        }
      }
    }),
    {
      name: 'lumina-knowledge-state',
      partialize: (state) => ({ activeKbId: state.activeKbId })
    }
  )
)
