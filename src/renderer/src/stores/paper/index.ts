import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { PaperDocument, PaperStatus } from '@shared/types/paper'
import { createIdleTranslationTaskState, isPaperReadableStatus } from './shared'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperFigurePreview } from './composables/usePaperFigurePreview'
import { usePaperAnnotations } from './composables/usePaperAnnotations'
import { usePaperTranslation } from './composables/usePaperTranslation'
import { usePaperRenderPipeline } from './composables/usePaperRenderPipeline'

export const usePaperReaderStore = defineStore('paperReader', () => {
  const papers = ref<PaperDocument[]>([])
  const currentPaperId = ref<string | null>(null)
  const markdownContent = ref('')
  const markdownLoading = ref(false)

  // 缩放状态
  const ZOOM_MIN = 0.5
  const ZOOM_MAX = 2.0
  const ZOOM_STEP = 0.1
  const zoomLevel = ref(1.0)

  const zoomPercent = computed(() => Math.round(zoomLevel.value * 100))
  const canZoomIn = computed(() => zoomLevel.value < ZOOM_MAX)
  const canZoomOut = computed(() => zoomLevel.value > ZOOM_MIN)

  function zoomIn(): void {
    zoomLevel.value = Math.min(ZOOM_MAX, +(zoomLevel.value + ZOOM_STEP).toFixed(1))
  }

  function zoomOut(): void {
    zoomLevel.value = Math.max(ZOOM_MIN, +(zoomLevel.value - ZOOM_STEP).toFixed(1))
  }

  function resetZoom(): void {
    zoomLevel.value = 1.0
  }

  function handleWheelZoom(event: WheelEvent): void {
    if (!event.ctrlKey) return
    event.preventDefault()
    // deltaY > 0 为缩小（pinch in），< 0 为放大（pinch out）
    const delta = -event.deltaY * 0.01
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel.value + delta))
    zoomLevel.value = +next.toFixed(2)
  }

  function upsertPaper(paper: PaperDocument): void {
    const index = papers.value.findIndex((item) => item.id === paper.id)
    if (index >= 0) {
      papers.value[index] = paper
      return
    }

    papers.value = [paper, ...papers.value]
  }

  function updatePaperInList(paperId: string, updates: Partial<PaperDocument>): void {
    const index = papers.value.findIndex((paper) => paper.id === paperId)
    if (index < 0) {
      return
    }

    papers.value[index] = {
      ...papers.value[index],
      ...updates
    }
  }

  async function updatePaperStatus(
    paperId: string,
    status: PaperStatus,
    errorMessage?: string
  ): Promise<void> {
    const result = await window.api.paper.updateStatus({
      paperId,
      status,
      errorMessage
    })

    if (!result.success) {
      throw new Error(result.error || '更新论文状态失败')
    }

    updatePaperInList(paperId, {
      status,
      errorMessage
    })
  }

  const figurePreview = usePaperFigurePreview(currentPaperId)
  const annotations = usePaperAnnotations(currentPaperId)
  const translation = usePaperTranslation(currentPaperId)
  const renderPipeline = usePaperRenderPipeline({
    papers,
    upsertPaper,
    updatePaperInList,
    updatePaperStatus,
    loadPapers
  })

  const currentPaper = computed<PaperDocument | null>(
    () => papers.value.find((paper) => paper.id === currentPaperId.value) || null
  )

  const isOcrCompleted = computed(() => currentPaper.value?.status === 'completed')

  const paperBasePath = computed(() => {
    const paper = currentPaper.value
    if (!paper?.filePath) {
      return null
    }

    const lastSlash = paper.filePath.lastIndexOf('/')
    if (lastSlash < 0) {
      return null
    }

    return paper.filePath.substring(0, lastSlash)
  })

  function resetReaderViewState(): void {
    figurePreview.clearPaperToc()
    translation.hideTranslation()
    figurePreview.resetFigureUiState()
    resetZoom()
  }

  function clearPaperState(paperId: string): void {
    renderPipeline.clearRenderPipelineState(paperId)
    figurePreview.clearPaperFigureState(paperId)
    translation.clearTranslationState(paperId)
    annotations.clearAnnotationState(paperId)
  }

  async function loadPapers(): Promise<void> {
    renderPipeline.ensureOcrProgressListener()

    const result = await window.api.paper.list()
    if (!result.success || !result.data) {
      return
    }

    papers.value = result.data
    await translation.loadTranslationStatus(result.data.map((paper) => paper.id))
    for (const paper of result.data) {
      renderPipeline.ensurePaperProgressSnapshot(paper)
    }

    const ocrProcessingPapers = result.data.filter((paper) => paper.status === 'ocr_processing')
    await Promise.all(
      ocrProcessingPapers.map(async (paper) => {
        const progressResult = await window.api.paper.getOcrProgress(paper.id)
        if (progressResult.success && progressResult.data) {
          renderPipeline.ocrProgressByPaperId.value = {
            ...renderPipeline.ocrProgressByPaperId.value,
            [progressResult.data.paperId]: progressResult.data
          }
        }
      })
    )

    const selectedPaper = currentPaperId.value
      ? result.data.find((paper) => paper.id === currentPaperId.value)
      : null

    if (selectedPaper && !isPaperReadableStatus(selectedPaper.status)) {
      currentPaperId.value = null
      markdownContent.value = ''
      resetReaderViewState()
    }

    if (currentPaperId.value && !selectedPaper) {
      currentPaperId.value = null
      markdownContent.value = ''
      resetReaderViewState()
    }
  }

  function selectPaper(paperId: string | null): void {
    const uiStateStore = useUIStateStore()

    if (!paperId) {
      currentPaperId.value = null
      uiStateStore.setLastPaperId(null)
      resetReaderViewState()
      return
    }

    const paper = papers.value.find((item) => item.id === paperId)
    if (!paper || !isPaperReadableStatus(paper.status)) {
      return
    }

    if (currentPaperId.value !== paperId) {
      translation.hideTranslation()
      figurePreview.resetFigureUiState()
    }

    currentPaperId.value = paperId
    uiStateStore.setLastPaperId(paperId)
  }

  async function openPaper(paperId: string): Promise<PaperDocument | null> {
    const localPaper = papers.value.find((paper) => paper.id === paperId)
    if (localPaper && !isPaperReadableStatus(localPaper.status)) {
      return null
    }

    const result = await window.api.paper.get(paperId)
    if (!result.success || !result.data) {
      return null
    }

    upsertPaper(result.data)
    renderPipeline.ensurePaperProgressSnapshot(result.data)

    if (!isPaperReadableStatus(result.data.status)) {
      return null
    }

    if (currentPaperId.value !== paperId) {
      translation.hideTranslation()
      figurePreview.resetFigureUiState()
    }

    currentPaperId.value = paperId
    useUIStateStore().setLastPaperId(paperId)
    await loadMarkdown(paperId)

    return result.data
  }

  async function deletePaper(paperId: string): Promise<boolean> {
    const targetPaper = papers.value.find((paper) => paper.id === paperId)
    renderPipeline.markPipelineDeleted(paperId)
    await window.api.paper.cancelOcr(paperId)

    const result = await window.api.paper.delete(paperId)
    if (!result.success) {
      return false
    }

    if (targetPaper?.chatSessionId) {
      void window.api.session.delete(targetPaper.chatSessionId)
    }

    papers.value = papers.value.filter((paper) => paper.id !== paperId)
    clearPaperState(paperId)

    if (currentPaperId.value === paperId) {
      currentPaperId.value = null
      useUIStateStore().setLastPaperId(null)
      markdownContent.value = ''
      resetReaderViewState()
    }

    return true
  }

  async function loadMarkdown(paperId: string): Promise<void> {
    const paper = papers.value.find((item) => item.id === paperId)
    if (!paper || !isPaperReadableStatus(paper.status)) {
      markdownContent.value = ''
      figurePreview.clearPaperToc()
      translation.setTranslationCache(paperId, null)
      translation.setTranslationTaskState(paperId, createIdleTranslationTaskState())
      translation.setHasTranslationState(paperId, false)
      annotations.setReaderDocument(paperId, null)
      annotations.setAnnotations(paperId, [])
      return
    }

    markdownLoading.value = true
    figurePreview.clearPaperToc()
    try {
      const readerDocument = await annotations.loadReaderDocument(paperId)
      if (readerDocument) {
        markdownContent.value = readerDocument.markdown
        await translation.loadTranslationState(paperId)
        await annotations.loadAnnotations(paperId)
      } else {
        markdownContent.value = ''
        figurePreview.clearPaperToc()
        translation.setTranslationCache(paperId, null)
        translation.setTranslationTaskState(paperId, createIdleTranslationTaskState())
        translation.setHasTranslationState(paperId, false)
        annotations.setAnnotations(paperId, [])
      }
    } finally {
      markdownLoading.value = false
    }
  }

  async function deleteTranslation(paperId: string): Promise<{ success: boolean; error?: string }> {
    const result = await translation.deleteTranslation(paperId)
    if (!result.success) {
      return result
    }

    await annotations.loadAnnotations(paperId)
    return result
  }

  async function setPaperChatSession(
    paperId: string,
    sessionId: string
  ): Promise<{ success: boolean; data?: PaperDocument; error?: string }> {
    const result = await window.api.paper.setChatSession({ paperId, sessionId })
    if (result.success && result.data) {
      updatePaperInList(paperId, result.data)
    }
    return result
  }

  return {
    papers,
    currentPaperId,
    renderProgressByPaperId: renderPipeline.renderProgressByPaperId,
    ocrProgressByPaperId: renderPipeline.ocrProgressByPaperId,
    markdownContent,
    markdownLoading,
    figuresByPaperId: figurePreview.figuresByPaperId,
    readerDocumentByPaperId: annotations.readerDocumentByPaperId,
    annotationsByPaperId: annotations.annotationsByPaperId,
    figureLoadingByPaperId: figurePreview.figureLoadingByPaperId,
    showFigurePanel: figurePreview.showFigurePanel,
    activeFigure: figurePreview.activeFigure,
    figurePreviewPinned: figurePreview.figurePreviewPinned,
    figurePreviewRect: figurePreview.figurePreviewRect,
    figurePreviewImageRatio: figurePreview.figurePreviewImageRatio,
    paperTocTitle: figurePreview.paperTocTitle,
    paperTocItems: figurePreview.paperTocItems,
    translationVisible: translation.translationVisible,
    translationByPaperId: translation.translationByPaperId,
    translationTaskByPaperId: translation.translationTaskByPaperId,
    hasTranslationByPaperId: translation.hasTranslationByPaperId,
    currentPaper,
    currentPaperFigures: figurePreview.currentPaperFigures,
    currentReaderDocument: annotations.currentReaderDocument,
    currentAnnotations: annotations.currentAnnotations,
    currentTranslationCache: translation.currentTranslationCache,
    figureCaptionTranslationMap: translation.figureCaptionTranslationMap,
    currentTranslationTask: translation.currentTranslationTask,
    isOcrCompleted,
    isCurrentPaperTranslating: translation.isCurrentPaperTranslating,
    paperBasePath,
    loadPapers,
    selectPaper,
    openPaper,
    deletePaper,
    updatePaperStatus,
    uploadAndRenderPdf: renderPipeline.uploadAndRenderPdf,
    loadMarkdown,
    loadAnnotations: annotations.loadAnnotations,
    loadFigures: figurePreview.loadFigures,
    setPaperTocOutline: figurePreview.setPaperTocOutline,
    clearPaperToc: figurePreview.clearPaperToc,
    scrollToHeading: figurePreview.scrollToHeading,
    ensureOcrProgressListener: renderPipeline.ensureOcrProgressListener,
    ensureTranslationProgressListener: translation.ensureTranslationProgressListener,
    loadTranslationState: translation.loadTranslationState,
    ensureTranslation: translation.ensureTranslation,
    loadTranslationStatus: translation.loadTranslationStatus,
    deleteTranslation,
    setPaperChatSession,
    createAnnotation: annotations.createAnnotation,
    reanchorAnnotation: annotations.reanchorAnnotation,
    updateAnnotation: annotations.updateAnnotation,
    deleteAnnotation: annotations.deleteAnnotation,
    toggleTranslationVisible: translation.toggleTranslationVisible,
    retryPaper: renderPipeline.retryPaper,
    setFigurePanelVisible: figurePreview.setFigurePanelVisible,
    closeFigurePanel: figurePreview.closeFigurePanel,
    toggleFigurePanel: figurePreview.toggleFigurePanel,
    openFigurePreview: figurePreview.openFigurePreview,
    closeFigurePreview: figurePreview.closeFigurePreview,
    setFigurePreviewPinned: figurePreview.setFigurePreviewPinned,
    setFigurePreviewImageRatio: figurePreview.setFigurePreviewImageRatio,
    moveFigurePreview: figurePreview.moveFigurePreview,
    resizeFigurePreview: figurePreview.resizeFigurePreview,
    resetFigureUiState: figurePreview.resetFigureUiState,
    hideTranslation: translation.hideTranslation,
    zoomLevel,
    zoomPercent,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    resetZoom,
    handleWheelZoom
  }
})
