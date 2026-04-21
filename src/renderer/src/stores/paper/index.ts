import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { PaperDocument, PaperStatus } from '@shared/types/paper'
import { createIdleTranslationTaskState, isPaperReadableStatus } from './shared'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useConfigStore } from '@renderer/stores/configStore'
import { usePaperFigurePreview } from './composables/usePaperFigurePreview'
import { usePaperAnnotations } from './composables/usePaperAnnotations'
import { usePaperTranslation } from './composables/usePaperTranslation'
import { usePaperRenderPipeline } from './composables/usePaperRenderPipeline'

interface PaperViewScrollPosition {
  scrollTop: number
  scrollLeft: number
}

export const usePaperReaderStore = defineStore('paperReader', () => {
  const papers = ref<PaperDocument[]>([])
  const currentPaperId = ref<string | null>(null)
  const markdownContent = ref('')
  const markdownLoading = ref(false)
  const originalPdfVisible = ref(false)
  const markdownScrollPositionByPaperId = new Map<string, PaperViewScrollPosition>()
  const originalPdfScrollPositionByPaperId = new Map<string, PaperViewScrollPosition>()

  // 缩放状态
  const ZOOM_DEFAULT = 1.0
  const ZOOM_MIN = 0.5
  const ZOOM_MAX = 2.0
  const ZOOM_STEP = 0.1
  const markdownZoomLevel = ref(ZOOM_DEFAULT)
  const originalPdfZoomLevel = ref(ZOOM_DEFAULT)
  let zoomPersistenceReady = false
  let zoomSaveTimer: ReturnType<typeof setTimeout> | null = null

  const zoomLevel = computed(() =>
    originalPdfVisible.value ? originalPdfZoomLevel.value : markdownZoomLevel.value
  )
  const zoomPercent = computed(() => Math.round(zoomLevel.value * 100))
  const canZoomIn = computed(() => zoomLevel.value < ZOOM_MAX)
  const canZoomOut = computed(() => zoomLevel.value > ZOOM_MIN)

  function normalizeZoomLevel(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return ZOOM_DEFAULT
    }

    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +value.toFixed(2)))
  }

  function scheduleZoomPersistence(): void {
    if (!zoomPersistenceReady) {
      return
    }

    const configStore = useConfigStore()
    configStore.updatePaperReaderConfig(
      originalPdfVisible.value
        ? { originalPdfZoomLevel: originalPdfZoomLevel.value }
        : { zoomLevel: markdownZoomLevel.value }
    )

    if (zoomSaveTimer) {
      clearTimeout(zoomSaveTimer)
    }

    zoomSaveTimer = setTimeout(() => {
      zoomSaveTimer = null
      void configStore.saveConfig({ silent: true })
    }, 240)
  }

  function setZoomLevel(value: number, options: { persist?: boolean } = {}): void {
    const nextZoomLevel = normalizeZoomLevel(value)
    const targetZoomLevel = originalPdfVisible.value ? originalPdfZoomLevel : markdownZoomLevel
    if (targetZoomLevel.value === nextZoomLevel) {
      return
    }

    targetZoomLevel.value = nextZoomLevel

    if (options.persist !== false) {
      scheduleZoomPersistence()
    }
  }

  function loadPaperReaderPreferences(): void {
    const configStore = useConfigStore()
    markdownZoomLevel.value = normalizeZoomLevel(configStore.paperReaderConfig.zoomLevel)
    originalPdfZoomLevel.value = normalizeZoomLevel(
      configStore.paperReaderConfig.originalPdfZoomLevel
    )
    zoomPersistenceReady = true
  }

  function zoomIn(): void {
    setZoomLevel(+(zoomLevel.value + ZOOM_STEP).toFixed(1))
  }

  function zoomOut(): void {
    setZoomLevel(+(zoomLevel.value - ZOOM_STEP).toFixed(1))
  }

  function resetZoom(): void {
    setZoomLevel(ZOOM_DEFAULT)
  }

  function handleWheelZoom(event: WheelEvent): void {
    if (!event.ctrlKey) return
    event.preventDefault()
    // deltaY > 0 为缩小（pinch in），< 0 为放大（pinch out）
    const delta = -event.deltaY * 0.01
    setZoomLevel(zoomLevel.value + delta)
  }

  function normalizeScrollPosition(position: PaperViewScrollPosition): PaperViewScrollPosition {
    const scrollTop = Number.isFinite(position.scrollTop) ? Math.max(position.scrollTop, 0) : 0
    const scrollLeft = Number.isFinite(position.scrollLeft) ? Math.max(position.scrollLeft, 0) : 0

    return {
      scrollTop,
      scrollLeft
    }
  }

  function setMarkdownScrollPosition(paperId: string, position: PaperViewScrollPosition): void {
    if (!paperId) {
      return
    }

    markdownScrollPositionByPaperId.set(paperId, normalizeScrollPosition(position))
  }

  function getMarkdownScrollPosition(paperId: string): PaperViewScrollPosition | null {
    return markdownScrollPositionByPaperId.get(paperId) || null
  }

  function setOriginalPdfScrollPosition(paperId: string, position: PaperViewScrollPosition): void {
    if (!paperId) {
      return
    }

    originalPdfScrollPositionByPaperId.set(paperId, normalizeScrollPosition(position))
  }

  function getOriginalPdfScrollPosition(paperId: string): PaperViewScrollPosition | null {
    return originalPdfScrollPositionByPaperId.get(paperId) || null
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
    hideOriginalPdf()
  }

  function hideOriginalPdf(): void {
    originalPdfVisible.value = false
  }

  function toggleOriginalPdfVisible(): void {
    originalPdfVisible.value = !originalPdfVisible.value
    if (originalPdfVisible.value) {
      figurePreview.resetFigureUiState()
    }
  }

  function clearPaperState(paperId: string): void {
    renderPipeline.clearRenderPipelineState(paperId)
    figurePreview.clearPaperFigureState(paperId)
    translation.clearTranslationState(paperId)
    annotations.clearAnnotationState(paperId)
    markdownScrollPositionByPaperId.delete(paperId)
    originalPdfScrollPositionByPaperId.delete(paperId)
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
      hideOriginalPdf()
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
      hideOriginalPdf()
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
    originalPdfVisible,
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
    resizeFigurePreviewFromLeft: figurePreview.resizeFigurePreviewFromLeft,
    resetFigureUiState: figurePreview.resetFigureUiState,
    hideTranslation: translation.hideTranslation,
    hideOriginalPdf,
    toggleOriginalPdfVisible,
    loadPaperReaderPreferences,
    markdownZoomLevel,
    originalPdfZoomLevel,
    zoomLevel,
    zoomPercent,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    resetZoom,
    handleWheelZoom,
    setMarkdownScrollPosition,
    getMarkdownScrollPosition,
    setOriginalPdfScrollPosition,
    getOriginalPdfScrollPosition
  }
})
