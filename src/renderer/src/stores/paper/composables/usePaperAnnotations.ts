import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type {
  CreatePaperAnnotationPayload,
  PaperAnnotation,
  PaperReaderDocument,
  ReanchorPaperAnnotationPayload,
  UpdatePaperAnnotationPayload
} from '@shared/types/paper'
import { deepClone } from '@shared/utils'

export interface PaperAnnotationComposable {
  readerDocumentByPaperId: Ref<Record<string, PaperReaderDocument>>
  annotationsByPaperId: Ref<Record<string, PaperAnnotation[]>>
  currentReaderDocument: ComputedRef<PaperReaderDocument | null>
  currentAnnotations: ComputedRef<PaperAnnotation[]>
  loadReaderDocument: (paperId: string) => Promise<PaperReaderDocument | null>
  loadAnnotations: (paperId: string) => Promise<PaperAnnotation[]>
  createAnnotation: (
    params: CreatePaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  reanchorAnnotation: (
    params: ReanchorPaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  updateAnnotation: (
    params: UpdatePaperAnnotationPayload
  ) => Promise<{ success: boolean; data?: PaperAnnotation; error?: string }>
  deleteAnnotation: (
    paperId: string,
    annotationId: string
  ) => Promise<{ success: boolean; error?: string }>
  setReaderDocument: (paperId: string, document: PaperReaderDocument | null) => void
  setAnnotations: (paperId: string, annotations: PaperAnnotation[]) => void
  clearAnnotationState: (paperId: string) => void
}

export function usePaperAnnotations(currentPaperId: Ref<string | null>): PaperAnnotationComposable {
  const readerDocumentByPaperId = ref<Record<string, PaperReaderDocument>>({})
  const annotationsByPaperId = ref<Record<string, PaperAnnotation[]>>({})

  function toPlainPayload<T>(payload: T): T {
    return deepClone(payload)
  }

  const currentReaderDocument = computed<PaperReaderDocument | null>(() => {
    if (!currentPaperId.value) {
      return null
    }

    return readerDocumentByPaperId.value[currentPaperId.value] || null
  })

  const currentAnnotations = computed<PaperAnnotation[]>(() => {
    if (!currentPaperId.value) {
      return []
    }

    return annotationsByPaperId.value[currentPaperId.value] || []
  })

  function setReaderDocument(paperId: string, document: PaperReaderDocument | null): void {
    const nextMap = { ...readerDocumentByPaperId.value }
    if (document) {
      nextMap[paperId] = document
    } else {
      delete nextMap[paperId]
    }
    readerDocumentByPaperId.value = nextMap
  }

  function setAnnotations(paperId: string, annotations: PaperAnnotation[]): void {
    annotationsByPaperId.value = {
      ...annotationsByPaperId.value,
      [paperId]: annotations
    }
  }

  function clearAnnotationState(paperId: string): void {
    setReaderDocument(paperId, null)

    const nextAnnotations = { ...annotationsByPaperId.value }
    delete nextAnnotations[paperId]
    annotationsByPaperId.value = nextAnnotations
  }

  async function loadReaderDocument(paperId: string): Promise<PaperReaderDocument | null> {
    const result = await window.api.paper.getReaderDocument(paperId)
    if (!result.success || !result.data) {
      setReaderDocument(paperId, null)
      return null
    }

    setReaderDocument(paperId, result.data)
    return result.data
  }

  async function loadAnnotations(paperId: string): Promise<PaperAnnotation[]> {
    const result = await window.api.paper.listAnnotations(paperId)
    if (!result.success || !result.data) {
      setAnnotations(paperId, [])
      return []
    }

    setAnnotations(paperId, result.data)
    return result.data
  }

  async function createAnnotation(
    params: CreatePaperAnnotationPayload
  ): Promise<{ success: boolean; data?: PaperAnnotation; error?: string }> {
    const plainParams = toPlainPayload(params)
    const result = await window.api.paper.createAnnotation(plainParams)
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }

    const current = annotationsByPaperId.value[plainParams.paperId] || []
    setAnnotations(plainParams.paperId, [...current, result.data])
    return result
  }

  async function reanchorAnnotation(
    params: ReanchorPaperAnnotationPayload
  ): Promise<{ success: boolean; data?: PaperAnnotation; error?: string }> {
    const plainParams = toPlainPayload(params)
    const result = await window.api.paper.reanchorAnnotation(plainParams)
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }

    const current = annotationsByPaperId.value[plainParams.paperId] || []
    const nextAnnotations = current.map((annotation) => {
      return annotation.id === plainParams.annotationId ? result.data! : annotation
    })
    setAnnotations(plainParams.paperId, nextAnnotations)
    return result
  }

  async function updateAnnotation(
    params: UpdatePaperAnnotationPayload
  ): Promise<{ success: boolean; data?: PaperAnnotation; error?: string }> {
    const plainParams = toPlainPayload(params)
    const result = await window.api.paper.updateAnnotation(plainParams)
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }

    const current = annotationsByPaperId.value[plainParams.paperId] || []
    const nextAnnotations = current.map((annotation) => {
      return annotation.id === plainParams.annotationId ? result.data! : annotation
    })
    setAnnotations(plainParams.paperId, nextAnnotations)
    return result
  }

  async function deleteAnnotation(
    paperId: string,
    annotationId: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await window.api.paper.deleteAnnotation({
      paperId,
      annotationId
    })
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }

    setAnnotations(paperId, result.data)
    return { success: true }
  }

  return {
    readerDocumentByPaperId,
    annotationsByPaperId,
    currentReaderDocument,
    currentAnnotations,
    loadReaderDocument,
    loadAnnotations,
    createAnnotation,
    reanchorAnnotation,
    updateAnnotation,
    deleteAnnotation,
    setReaderDocument,
    setAnnotations,
    clearAnnotationState
  }
}
