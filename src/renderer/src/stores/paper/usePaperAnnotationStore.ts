import { create } from 'zustand'
import type {
  PaperAnnotation,
  PaperAnnotationAffectedKnowledgeBase,
  PaperReaderDocument,
  CreatePaperAnnotationPayload,
  UpdatePaperAnnotationPayload
} from '@shared/types/paper'
import { deepClone } from '@shared/utils'
import { notifyWarning } from '@renderer/composables/notificationCore'
import { usePaperListStore } from './usePaperListStore'

// ---------------------------------------------------------------------------
// State 类型
// ---------------------------------------------------------------------------

interface PaperAnnotationState {
  readerDocumentByPaperId: Record<string, PaperReaderDocument>
  annotationsByPaperId: Record<string, PaperAnnotation[]>

  // Getters
  currentReaderDocument: () => PaperReaderDocument | null
  currentAnnotations: () => PaperAnnotation[]

  // Actions
  loadReaderDocument: (paperId: string) => Promise<PaperReaderDocument | null>
  loadAnnotations: (paperId: string) => Promise<PaperAnnotation[]>
  createAnnotation: (
    params: CreatePaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  updateAnnotation: (params: UpdatePaperAnnotationPayload) => Promise<{
    success: boolean
    data?: PaperAnnotation
    affectedKnowledgeBases?: PaperAnnotationAffectedKnowledgeBase[]
    error?: string
  }>
  deleteAnnotation: (
    paperId: string,
    annotationId: string
  ) => Promise<{ success: boolean; error?: string }>
  setReaderDocument: (paperId: string, document: PaperReaderDocument | null) => void
  setAnnotations: (paperId: string, annotations: PaperAnnotation[]) => void
  clearAnnotationState: (paperId: string) => void
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePaperAnnotationStore = create<PaperAnnotationState>()((set, get) => ({
  readerDocumentByPaperId: {} as Record<string, PaperReaderDocument>,
  annotationsByPaperId: {} as Record<string, PaperAnnotation[]>,

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  currentReaderDocument: () => {
    const currentPaperId = usePaperListStore.getState().currentPaperId
    if (!currentPaperId) return null
    return get().readerDocumentByPaperId[currentPaperId] || null
  },

  currentAnnotations: () => {
    const currentPaperId = usePaperListStore.getState().currentPaperId
    if (!currentPaperId) return []
    return get().annotationsByPaperId[currentPaperId] || []
  },

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  loadReaderDocument: async (paperId: string): Promise<PaperReaderDocument | null> => {
    const result = await window.api.paper.getReaderDocument(paperId)
    if (!result.success || !result.data) {
      get().setReaderDocument(paperId, null)
      return null
    }
    get().setReaderDocument(paperId, result.data)
    return result.data
  },

  loadAnnotations: async (paperId: string): Promise<PaperAnnotation[]> => {
    const result = await window.api.paper.listAnnotations(paperId)
    if (!result.success || !result.data) {
      get().setAnnotations(paperId, [])
      return []
    }
    get().setAnnotations(paperId, result.data)
    return result.data
  },

  createAnnotation: async (
    params: CreatePaperAnnotationPayload
  ): Promise<{ success: boolean; data?: PaperAnnotation; error?: string }> => {
    const plainParams = deepClone(params)
    const result = await window.api.paper.createAnnotation(plainParams)
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }
    const current = get().annotationsByPaperId[plainParams.paperId] || []
    get().setAnnotations(plainParams.paperId, [...current, result.data])
    return result
  },

  updateAnnotation: async (
    params: UpdatePaperAnnotationPayload
  ): Promise<{
    success: boolean
    data?: PaperAnnotation
    affectedKnowledgeBases?: PaperAnnotationAffectedKnowledgeBase[]
    error?: string
  }> => {
    const plainParams = deepClone(params)
    const result = await window.api.paper.updateAnnotation(plainParams)
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }

    const current = get().annotationsByPaperId[plainParams.paperId] || []
    const nextAnnotations = current.map((annotation) =>
      annotation.id === plainParams.annotationId ? result.data! : annotation
    )
    get().setAnnotations(plainParams.paperId, nextAnnotations)

    if (result.affectedKnowledgeBases?.length) {
      const affectedList = result.affectedKnowledgeBases.map((kb) => `- ${kb.name}`).join('\n')
      notifyWarning(
        '论文笔记已更新',
        [
          '以下知识库需要重新索引以确保检索结果使用最新笔记内容：',
          affectedList,
          '请前往知识库页面点击"重新索引"。'
        ].join('\n'),
        {
          source: 'paper',
          sticky: true,
          dedupeKey: `paper-note-index-invalidation:${plainParams.paperId}:${plainParams.annotationId}`
        }
      )
    }

    return result
  },

  deleteAnnotation: async (
    paperId: string,
    annotationId: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await window.api.paper.deleteAnnotation({ paperId, annotationId })
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }
    get().setAnnotations(paperId, result.data)
    return { success: true }
  },

  setReaderDocument: (paperId: string, document: PaperReaderDocument | null) => {
    const s = get()
    const nextMap = { ...s.readerDocumentByPaperId }
    if (document) {
      nextMap[paperId] = document
    } else {
      delete nextMap[paperId]
    }
    set({ readerDocumentByPaperId: nextMap })
  },

  setAnnotations: (paperId: string, annotations: PaperAnnotation[]) => {
    const s = get()
    set({
      annotationsByPaperId: {
        ...s.annotationsByPaperId,
        [paperId]: annotations
      }
    })
  },

  clearAnnotationState: (paperId: string) => {
    get().setReaderDocument(paperId, null)
    const s = get()
    const nextAnnotations = { ...s.annotationsByPaperId }
    delete nextAnnotations[paperId]
    set({ annotationsByPaperId: nextAnnotations })
  }
}))
