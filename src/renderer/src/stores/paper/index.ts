import { create } from 'zustand'
import type {
  PaperAnnotation,
  PaperAnnotationAffectedKnowledgeBase,
  PaperDocument,
  PaperFigureItem,
  PaperReaderDocument,
  PaperStatus,
  PaperTocEntry,
  PaperTocItem,
  PaperTocOutline,
  PaperTranslationCache,
  PaperTranslationEntry,
  PaperTranslationProgress,
  PaperTranslationStatus,
  CreatePaperAnnotationPayload,
  UpdatePaperAnnotationPayload
} from '@shared/types/paper'
import type { OcrProgressInfo } from '@shared/types/paper'
import {
  buildBase64DataUrl,
  deepClone,
  fileUrlToPath,
  getImageMimeTypeFromPath,
  isFileUrl
} from '@shared/utils'
import {
  buildFigureCaptionTranslationMap,
  hasPaperTranslationResult
} from '@shared/utils/paperTranslation'
import { usePdfPageRasterizer } from '@renderer/composables/usePdfPageRasterizer'
import { notifyWarning } from '@renderer/composables/notificationCore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useConfigStore } from '@renderer/stores/configStore'
import {
  PAPER_FIGURE_PREVIEW_MARGIN,
  PAPER_FIGURE_PREVIEW_MIN_HEIGHT,
  PAPER_FIGURE_PREVIEW_MIN_WIDTH,
  createDefaultFigurePreviewRect,
  createIdleOcrProgress,
  createIdleTranslationTaskState,
  decodeBase64ToArrayBuffer,
  isPaperReadableStatus,
  type PaperFigurePreviewRect,
  type PaperTranslationTaskState,
  type PipelineControl,
  type RenderPipelineContext,
  type RenderingProgress
} from './shared'

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

interface PaperViewScrollPosition {
  scrollTop: number
  scrollLeft: number
}

// ---------------------------------------------------------------------------
// 翻译状态优先级
// ---------------------------------------------------------------------------

const STATUS_PRIORITY: Record<PaperTranslationStatus, number> = {
  queued: 0,
  translating: 1,
  failed: 2,
  completed: 3,
  skipped: 4
}

// ---------------------------------------------------------------------------
// 缩放常量
// ---------------------------------------------------------------------------

const ZOOM_DEFAULT = 1.0
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1

// ---------------------------------------------------------------------------
// Figure preview 辅助函数
// ---------------------------------------------------------------------------

const PREVIEW_CHROME_HEIGHT_ESTIMATE = 128

function clampPreviewWidth(width: number): number {
  if (typeof window === 'undefined') {
    return Math.max(width, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
  }
  const maxWidth = Math.max(
    window.innerWidth - PAPER_FIGURE_PREVIEW_MARGIN * 2,
    PAPER_FIGURE_PREVIEW_MIN_WIDTH
  )
  return Math.min(Math.max(width, PAPER_FIGURE_PREVIEW_MIN_WIDTH), maxWidth)
}

function clampPreviewHeight(height: number): number {
  if (typeof window === 'undefined') {
    return Math.max(height, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
  }
  const maxHeight = Math.max(
    window.innerHeight - PAPER_FIGURE_PREVIEW_MARGIN * 2,
    PAPER_FIGURE_PREVIEW_MIN_HEIGHT
  )
  return Math.min(Math.max(height, PAPER_FIGURE_PREVIEW_MIN_HEIGHT), maxHeight)
}

function clampPreviewLeft(left: number, width: number): number {
  if (typeof window === 'undefined') {
    return Math.max(left, PAPER_FIGURE_PREVIEW_MARGIN)
  }
  return Math.min(
    Math.max(left, PAPER_FIGURE_PREVIEW_MARGIN),
    Math.max(window.innerWidth - width - PAPER_FIGURE_PREVIEW_MARGIN, PAPER_FIGURE_PREVIEW_MARGIN)
  )
}

function clampPreviewTop(top: number, height: number): number {
  if (typeof window === 'undefined') {
    return Math.max(top, PAPER_FIGURE_PREVIEW_MARGIN)
  }
  return Math.min(
    Math.max(top, PAPER_FIGURE_PREVIEW_MARGIN),
    Math.max(window.innerHeight - height - PAPER_FIGURE_PREVIEW_MARGIN, PAPER_FIGURE_PREVIEW_MARGIN)
  )
}

function getFigureRatio(item: PaperFigureItem): number {
  return item.bbox.width > 0 && item.bbox.height > 0 ? item.bbox.height / item.bbox.width : 0.75
}

function getFigurePreviewHeight(width: number, ratio: number): number {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0.75
  return width * safeRatio + PREVIEW_CHROME_HEIGHT_ESTIMATE
}

function normalizeZoomLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ZOOM_DEFAULT
  }
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +value.toFixed(2)))
}

function normalizeScrollPosition(position: PaperViewScrollPosition): PaperViewScrollPosition {
  const scrollTop = Number.isFinite(position.scrollTop) ? Math.max(position.scrollTop, 0) : 0
  const scrollLeft = Number.isFinite(position.scrollLeft) ? Math.max(position.scrollLeft, 0) : 0
  return { scrollTop, scrollLeft }
}

// ---------------------------------------------------------------------------
// 翻译辅助函数
// ---------------------------------------------------------------------------

function upsertTranslationEntry(
  cache: PaperTranslationCache,
  nextEntry: PaperTranslationEntry
): PaperTranslationCache {
  const entries = [...cache.entries]
  const existingIndex = entries.findIndex((entry) => entry.id === nextEntry.id)
  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry
  } else {
    entries.push(nextEntry)
  }
  entries.sort((left, right) => left.index - right.index)
  return {
    ...cache,
    completedSegments: cache.completedSegments,
    totalSegments: Math.max(cache.totalSegments, entries.length),
    entries
  }
}

function mergeTranslationEntries(
  snapshot: PaperTranslationCache,
  live: PaperTranslationCache
): PaperTranslationCache {
  const liveEntryMap = new Map(live.entries.map((entry) => [entry.id, entry]))
  const mergedEntries = snapshot.entries.map((snapshotEntry) => {
    const liveEntry = liveEntryMap.get(snapshotEntry.id)
    if (!liveEntry) {
      return snapshotEntry
    }
    const livePriority = STATUS_PRIORITY[liveEntry.status] ?? 0
    const snapshotPriority = STATUS_PRIORITY[snapshotEntry.status] ?? 0
    if (liveEntry.updatedAt && snapshotEntry.updatedAt) {
      const liveTime = Date.parse(liveEntry.updatedAt)
      const snapshotTime = Date.parse(snapshotEntry.updatedAt)
      if (liveTime > snapshotTime) {
        return liveEntry
      }
      if (liveTime < snapshotTime) {
        return snapshotEntry
      }
    }
    return livePriority >= snapshotPriority ? liveEntry : snapshotEntry
  })

  for (const [id, liveEntry] of liveEntryMap) {
    if (!mergedEntries.find((entry) => entry.id === id)) {
      mergedEntries.push(liveEntry)
    }
  }
  mergedEntries.sort((left, right) => left.index - right.index)

  return {
    ...snapshot,
    entries: mergedEntries,
    completedSegments: mergedEntries.filter(
      (entry) => entry.status === 'completed' || entry.status === 'skipped'
    ).length,
    totalSegments: Math.max(snapshot.totalSegments, mergedEntries.length),
    updatedAt: live.updatedAt > snapshot.updatedAt ? live.updatedAt : snapshot.updatedAt
  }
}

// ---------------------------------------------------------------------------
// 图片路径解析
// ---------------------------------------------------------------------------

async function resolveFigureImagePath(imagePath: string): Promise<string> {
  if (!imagePath || /^(data:|blob:|https?:\/\/)/i.test(imagePath)) {
    return imagePath
  }
  const localFilePath = isFileUrl(imagePath) ? fileUrlToPath(imagePath) || imagePath : imagePath
  const result = await window.api.paper.readFileAsBase64(localFilePath)
  if (!result.success || !result.data) {
    return imagePath
  }
  return buildBase64DataUrl(result.data, getImageMimeTypeFromPath(localFilePath))
}

async function normalizePaperFigures(figures: PaperFigureItem[]): Promise<PaperFigureItem[]> {
  return Promise.all(
    figures.map(async (figure) => {
      const imagePath = await resolveFigureImagePath(figure.imagePath)
      return { ...figure, imagePath }
    })
  )
}

// ---------------------------------------------------------------------------
// Zustand Store
// ---------------------------------------------------------------------------

interface PaperReaderState {
  // 核心论文状态
  papers: PaperDocument[]
  currentPaperId: string | null
  markdownContent: string
  markdownLoading: boolean
  originalPdfVisible: boolean

  // Figure preview 状态
  figuresByPaperId: Record<string, PaperFigureItem[]>
  figureLoadingByPaperId: Record<string, boolean>
  showFigurePanel: boolean
  activeFigure: PaperFigureItem | null
  figurePreviewPinned: boolean
  figurePreviewRect: PaperFigurePreviewRect
  figurePreviewImageRatio: number
  paperTocTitle: PaperTocEntry | null
  paperTocItems: PaperTocItem[]

  // Annotation 状态
  readerDocumentByPaperId: Record<string, PaperReaderDocument>
  annotationsByPaperId: Record<string, PaperAnnotation[]>

  // Translation 状态
  translationVisible: boolean
  translationByPaperId: Record<string, PaperTranslationCache>
  translationTaskByPaperId: Record<string, PaperTranslationTaskState>
  hasTranslationByPaperId: Record<string, boolean>

  // Render pipeline 状态
  renderProgressByPaperId: Record<string, RenderingProgress>
  ocrProgressByPaperId: Record<string, OcrProgressInfo>

  // 缩放状态
  markdownZoomLevel: number
  originalPdfZoomLevel: number
  zoomPercent: number

  // Getters
  currentPaper: () => PaperDocument | null
  currentPaperFigures: () => PaperFigureItem[]
  currentReaderDocument: () => PaperReaderDocument | null
  currentAnnotations: () => PaperAnnotation[]
  currentTranslationCache: () => PaperTranslationCache | null
  figureCaptionTranslationMap: () => Record<string, string>
  currentTranslationTask: () => PaperTranslationTaskState
  isCurrentPaperTranslating: () => boolean
  isOcrCompleted: () => boolean
  paperBasePath: () => string | null
  zoomLevel: () => number
  canZoomIn: () => boolean
  canZoomOut: () => boolean

  // Actions
  loadPapers: () => Promise<void>
  selectPaper: (paperId: string | null) => void
  openPaper: (paperId: string) => Promise<PaperDocument | null>
  deletePaper: (paperId: string) => Promise<boolean>
  updatePaperStatus: (paperId: string, status: PaperStatus, errorMessage?: string) => Promise<void>
  uploadAndRenderPdf: () => Promise<{ success: boolean; paperId?: string; error?: string }>
  loadMarkdown: (paperId: string) => Promise<void>
  loadAnnotations: (paperId: string) => Promise<PaperAnnotation[]>
  loadFigures: (paperId: string, force?: boolean) => Promise<PaperFigureItem[]>
  setPaperTocOutline: (outline: PaperTocOutline) => void
  clearPaperToc: () => void
  scrollToHeading: (headingId: string) => boolean
  ensureOcrProgressListener: () => void
  ensureTranslationProgressListener: () => void
  loadTranslationState: (paperId: string) => Promise<void>
  ensureTranslation: (paperId: string) => Promise<{ success: boolean; error?: string }>
  loadTranslationStatus: (paperIds: string[]) => Promise<void>
  deleteTranslation: (paperId: string) => Promise<{ success: boolean; error?: string }>
  retranslateSegment: (
    paperId: string,
    segmentId: string,
    segmentStableId: string
  ) => Promise<{ success: boolean; error?: string }>
  setPaperChatSession: (
    paperId: string,
    sessionId: string
  ) => Promise<{ success: boolean; data?: PaperDocument; error?: string }>
  ensurePaperChatSession: (
    paperId: string
  ) => Promise<{ success: boolean; data?: string; error?: string }>
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
  toggleTranslationVisible: () => Promise<{ success: boolean; error?: string }>
  retryPaper: (paperId: string) => Promise<{ success: boolean; error?: string }>
  setFigurePanelVisible: (value: boolean) => void
  closeFigurePanel: () => void
  toggleFigurePanel: () => Promise<void>
  openFigurePreview: (
    item: PaperFigureItem,
    options?: { initialRect?: Partial<PaperFigurePreviewRect> }
  ) => void
  closeFigurePreview: () => void
  setFigurePreviewPinned: (value: boolean) => void
  setFigurePreviewImageRatio: (ratio: number) => void
  setFigurePreviewRect: (nextRect: Partial<PaperFigurePreviewRect>) => void
  moveFigurePreview: (delta: { x: number; y: number }) => void
  resizeFigurePreview: (nextWidth: number) => void
  resizeFigurePreviewFromLeft: (nextWidth: number) => void
  resetFigureUiState: () => void
  hideTranslation: () => void
  hideOriginalPdf: () => void
  toggleOriginalPdfVisible: () => void
  loadPaperReaderPreferences: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setZoomLevel: (value: number, options?: { persist?: boolean }) => void
  handleWheelZoom: (event: WheelEvent) => void
  setMarkdownScrollPosition: (paperId: string, position: PaperViewScrollPosition) => void
  getMarkdownScrollPosition: (paperId: string) => PaperViewScrollPosition | null
  setOriginalPdfScrollPosition: (paperId: string, position: PaperViewScrollPosition) => void
  getOriginalPdfScrollPosition: (paperId: string) => PaperViewScrollPosition | null

  // 内部设置方法（公开供内部逻辑使用）
  setReaderDocument: (paperId: string, document: PaperReaderDocument | null) => void
  setAnnotations: (paperId: string, annotations: PaperAnnotation[]) => void
  clearAnnotationState: (paperId: string) => void
  clearPaperFigureState: (paperId: string) => void
  clearTranslationState: (paperId: string) => void
  clearRenderPipelineState: (paperId: string) => void
  markPipelineDeleted: (paperId: string) => void
  clearPaperState: (paperId: string) => void
  ensurePaperProgressSnapshot: (paper: PaperDocument) => void
}

export const usePaperReaderStore = create<PaperReaderState>()((set, get) => {
  // -------------------------------------------------------------------------
  // 非响应式闭包状态（等价于原来的模块级 let / Map / Set）
  // -------------------------------------------------------------------------

  const markdownScrollPositionByPaperId = new Map<string, PaperViewScrollPosition>()
  const originalPdfScrollPositionByPaperId = new Map<string, PaperViewScrollPosition>()
  const pendingPaperChatSessionByPaperId = new Map<
    string,
    Promise<{ success: boolean; data?: string; error?: string }>
  >()

  // 缩放持久化
  let zoomPersistenceReady = false
  let zoomSaveTimer: ReturnType<typeof setTimeout> | null = null
  let wheelZoomRafId: number | null = null
  let pendingWheelDelta = 0
  let zoomEndTimer: ReturnType<typeof setTimeout> | null = null
  let zoomPercentRafId: number | null = null

  // Render pipeline 闭包
  let ocrProgressCleanup: (() => void) | null = null
  const activePipelines = new Set<string>()
  const pipelineControls = new Map<string, PipelineControl>()

  // Translation 进度监听
  let translationProgressCleanup: (() => void) | null = null

  // -------------------------------------------------------------------------
  // 缩放辅助
  // -------------------------------------------------------------------------

  function scheduleZoomPercentSync(): void {
    if (zoomPercentRafId !== null) return
    zoomPercentRafId = requestAnimationFrame(() => {
      zoomPercentRafId = null
      const s = get()
      const level = s.originalPdfVisible ? s.originalPdfZoomLevel : s.markdownZoomLevel
      set({ zoomPercent: Math.round(level * 100) })
    })
  }

  function scheduleZoomPersistence(): void {
    if (!zoomPersistenceReady) return
    const s = get()
    const configStore = useConfigStore.getState()
    configStore.updatePaperReaderConfig(
      s.originalPdfVisible
        ? { originalPdfZoomLevel: s.originalPdfZoomLevel }
        : { zoomLevel: s.markdownZoomLevel }
    )
    if (zoomSaveTimer) clearTimeout(zoomSaveTimer)
    zoomSaveTimer = setTimeout(() => {
      zoomSaveTimer = null
      void configStore.saveConfig({ silent: true })
    }, 800)
  }

  // -------------------------------------------------------------------------
  // Render pipeline 辅助
  // -------------------------------------------------------------------------

  function setRenderProgress(paperId: string, progress: RenderingProgress): void {
    const s = get()
    set({
      renderProgressByPaperId: {
        ...s.renderProgressByPaperId,
        [paperId]: progress
      }
    })
  }

  function setOcrProgress(progress: OcrProgressInfo): void {
    const s = get()
    set({
      ocrProgressByPaperId: {
        ...s.ocrProgressByPaperId,
        [progress.paperId]: progress
      }
    })
  }

  function getPipelineControl(paperId: string): PipelineControl {
    const control = pipelineControls.get(paperId)
    if (control) return control
    const nextControl = { aborted: false, deleted: false }
    pipelineControls.set(paperId, nextControl)
    return nextControl
  }

  async function loadPdfContextFromPaper(paper: PaperDocument): Promise<RenderPipelineContext> {
    const fileResult = await window.api.paper.readFileAsBase64(paper.filePath)
    if (!fileResult.success || !fileResult.data) {
      throw new Error(fileResult.error || '读取本地论文文件失败')
    }
    const rasterizer = usePdfPageRasterizer()
    try {
      const pageInfos = await rasterizer.loadPdf(decodeBase64ToArrayBuffer(fileResult.data))
      return { paperId: paper.id, pageInfos, rasterizer }
    } catch (error) {
      rasterizer.dispose()
      throw error
    }
  }

  function hasIncompleteRender(paper: PaperDocument): boolean {
    const savedRenderedPages = Math.min(paper.pageAssets?.length || 0, paper.pageCount)
    const renderProgress = get().renderProgressByPaperId[paper.id]
    if (renderProgress?.stage === 'failed') return true
    return savedRenderedPages < paper.pageCount
  }

  async function runRenderAndOcrPipeline(context: RenderPipelineContext): Promise<void> {
    const { paperId, pageInfos, rasterizer } = context
    if (activePipelines.has(paperId)) {
      rasterizer.dispose()
      return
    }
    activePipelines.add(paperId)
    const control = getPipelineControl(paperId)
    const totalPages = pageInfos.length

    try {
      for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
        if (control.aborted) return

        setRenderProgress(paperId, {
          currentPage: pageIndex,
          totalPages,
          completedPages: pageIndex,
          stage: 'rendering'
        })

        const renderResult = await rasterizer.renderPage(pageIndex, 2.0)
        if (control.aborted) return

        const saveResult = await window.api.paper.savePageImage({
          paperId,
          pageIndex,
          base64Data: renderResult.base64,
          imageWidth: renderResult.width,
          imageHeight: renderResult.height,
          sourceWidth: pageInfos[pageIndex]?.width,
          sourceHeight: pageInfos[pageIndex]?.height,
          renderScale: 2.0
        })

        if (!saveResult.success) {
          throw new Error(`保存第 ${pageIndex + 1} 页图片失败: ${saveResult.error || '未知错误'}`)
        }

        setRenderProgress(paperId, {
          currentPage: pageIndex,
          totalPages,
          completedPages: pageIndex + 1,
          stage: pageIndex === totalPages - 1 ? 'completed' : 'rendering'
        })
      }

      if (control.aborted) return

      setRenderProgress(paperId, {
        currentPage: Math.max(totalPages - 1, 0),
        totalPages,
        completedPages: totalPages,
        stage: 'completed'
      })

      updatePaperInList(paperId, {
        status: 'ocr_processing',
        errorMessage: undefined
      })

      setOcrProgress(createIdleOcrProgress(paperId, totalPages))

      const result = await window.api.paper.startOcr(paperId)
      if (!result.success) {
        throw new Error(result.error || 'OCR 启动失败')
      }

      if (!control.deleted) {
        await loadPapers()
      }
    } catch (error) {
      if (control.deleted) return

      const errorMessage = error instanceof Error ? error.message : String(error)
      const lastRenderProgress = get().renderProgressByPaperId[paperId]
      const renderCompleted = (lastRenderProgress?.completedPages || 0) >= totalPages

      setRenderProgress(paperId, {
        currentPage: lastRenderProgress?.currentPage || 0,
        totalPages,
        completedPages: lastRenderProgress?.completedPages || 0,
        stage: renderCompleted ? 'completed' : 'failed',
        error: errorMessage
      })

      setOcrProgress({
        ...(get().ocrProgressByPaperId[paperId] || createIdleOcrProgress(paperId, totalPages)),
        status: 'failed',
        errorMessage
      })

      try {
        await updatePaperStatus(paperId, 'failed', errorMessage)
      } catch {
        // 论文已删除或状态同步失败时，不覆盖首个渲染错误
      }
    } finally {
      rasterizer.dispose()
      activePipelines.delete(paperId)
      pipelineControls.delete(paperId)
    }
  }

  // -------------------------------------------------------------------------
  // 翻译状态辅助
  // -------------------------------------------------------------------------

  function setTranslationCache(paperId: string, cache: PaperTranslationCache | null): void {
    const s = get()
    const nextCacheMap = { ...s.translationByPaperId }
    if (cache) {
      nextCacheMap[paperId] = cache
    } else {
      delete nextCacheMap[paperId]
    }
    set({ translationByPaperId: nextCacheMap })
  }

  function setTranslationTaskState(
    paperId: string,
    taskState: PaperTranslationTaskState | null
  ): void {
    const s = get()
    const nextTaskMap = { ...s.translationTaskByPaperId }
    if (taskState) {
      nextTaskMap[paperId] = taskState
    } else {
      delete nextTaskMap[paperId]
    }
    set({ translationTaskByPaperId: nextTaskMap })
  }

  function setHasTranslationState(paperId: string, hasTranslation: boolean): void {
    const s = get()
    set({
      hasTranslationByPaperId: {
        ...s.hasTranslationByPaperId,
        [paperId]: hasTranslation
      }
    })
  }

  // -------------------------------------------------------------------------
  // 论文列表辅助
  // -------------------------------------------------------------------------

  function upsertPaper(paper: PaperDocument): void {
    const s = get()
    const index = s.papers.findIndex((item) => item.id === paper.id)
    if (index >= 0) {
      const nextPapers = [...s.papers]
      nextPapers[index] = paper
      set({ papers: nextPapers })
      return
    }
    set({ papers: [paper, ...s.papers] })
  }

  function updatePaperInList(paperId: string, updates: Partial<PaperDocument>): void {
    const s = get()
    const index = s.papers.findIndex((paper) => paper.id === paperId)
    if (index < 0) return
    const nextPapers = [...s.papers]
    nextPapers[index] = { ...nextPapers[index], ...updates }
    set({ papers: nextPapers })
  }

  async function updatePaperStatus(
    paperId: string,
    status: PaperStatus,
    errorMessage?: string
  ): Promise<void> {
    const result = await window.api.paper.updateStatus({ paperId, status, errorMessage })
    if (!result.success) {
      throw new Error(result.error || '更新论文状态失败')
    }
    updatePaperInList(paperId, { status, errorMessage })
  }

  // -------------------------------------------------------------------------
  // 重置辅助
  // -------------------------------------------------------------------------

  function resetReaderViewState(): void {
    set({
      paperTocTitle: null,
      paperTocItems: [],
      translationVisible: false,
      showFigurePanel: false,
      activeFigure: null,
      figurePreviewPinned: false,
      figurePreviewImageRatio: 0.75,
      originalPdfVisible: false
    })
  }

  // -------------------------------------------------------------------------
  // 主要 actions
  // -------------------------------------------------------------------------

  async function loadPapers(): Promise<void> {
    ensureOcrProgressListener()

    const result = await window.api.paper.list()
    if (!result.success || !result.data) return

    const papers = result.data
    set({ papers })

    await loadTranslationStatus(papers.map((paper) => paper.id))
    for (const paper of papers) {
      ensurePaperProgressSnapshot(paper)
    }

    const ocrProcessingPapers = papers.filter((paper) => paper.status === 'ocr_processing')
    await Promise.all(
      ocrProcessingPapers.map(async (paper) => {
        const progressResult = await window.api.paper.getOcrProgress(paper.id)
        if (progressResult.success && progressResult.data) {
          const s = get()
          set({
            ocrProgressByPaperId: {
              ...s.ocrProgressByPaperId,
              [progressResult.data.paperId]: progressResult.data
            }
          })
        }
      })
    )

    const currentId = get().currentPaperId
    const selectedPaper = currentId ? papers.find((paper) => paper.id === currentId) : null

    if (selectedPaper && !isPaperReadableStatus(selectedPaper.status)) {
      set({ currentPaperId: null, markdownContent: '' })
      resetReaderViewState()
    }

    if (currentId && !selectedPaper) {
      set({ currentPaperId: null, markdownContent: '' })
      resetReaderViewState()
    }
  }

  function selectPaper(paperId: string | null): void {
    const uiStateStore = useUIStateStore.getState()
    const s = get()

    if (!paperId) {
      set({ currentPaperId: null })
      uiStateStore.setLastPaperId(null)
      resetReaderViewState()
      return
    }

    const paper = s.papers.find((item) => item.id === paperId)
    if (!paper || !isPaperReadableStatus(paper.status)) return

    if (s.currentPaperId !== paperId) {
      set({
        translationVisible: false,
        showFigurePanel: false,
        activeFigure: null,
        figurePreviewPinned: false,
        figurePreviewImageRatio: 0.75,
        originalPdfVisible: false
      })
    }

    // 恢复该论文的缩放级别
    const savedZoom = paper.readingProgress?.zoomLevel
    const nextZoom = savedZoom ? normalizeZoomLevel(savedZoom) : s.markdownZoomLevel

    set({ currentPaperId: paperId, markdownZoomLevel: nextZoom })
    scheduleZoomPercentSync()
    uiStateStore.setLastPaperId(paperId)
  }

  async function openPaper(paperId: string): Promise<PaperDocument | null> {
    const s = get()
    const localPaper = s.papers.find((paper) => paper.id === paperId)
    if (localPaper && !isPaperReadableStatus(localPaper.status)) return null

    const result = await window.api.paper.get(paperId)
    if (!result.success || !result.data) return null

    upsertPaper(result.data)
    ensurePaperProgressSnapshot(result.data)

    if (!isPaperReadableStatus(result.data.status)) return null

    const prevId = get().currentPaperId
    if (prevId !== paperId) {
      set({
        translationVisible: false,
        showFigurePanel: false,
        activeFigure: null,
        figurePreviewPinned: false,
        figurePreviewImageRatio: 0.75,
        originalPdfVisible: false
      })
    }

    set({ currentPaperId: paperId })
    useUIStateStore.getState().setLastPaperId(paperId)
    await loadMarkdown(paperId)

    return result.data
  }

  async function deletePaper(paperId: string): Promise<boolean> {
    const s = get()
    const targetPaper = s.papers.find((paper) => paper.id === paperId)
    markPipelineDeleted(paperId)
    await window.api.paper.cancelOcr(paperId)

    const result = await window.api.paper.delete(paperId)
    if (!result.success) return false

    if (targetPaper?.chatSessionId) {
      void window.api.session.delete(targetPaper.chatSessionId)
    }

    set({ papers: s.papers.filter((paper) => paper.id !== paperId) })
    clearPaperState(paperId)

    if (s.currentPaperId === paperId) {
      set({ currentPaperId: null, markdownContent: '' })
      useUIStateStore.getState().setLastPaperId(null)
      resetReaderViewState()
    }

    return true
  }

  async function loadMarkdown(paperId: string): Promise<void> {
    const s = get()
    const paper = s.papers.find((item) => item.id === paperId)
    if (!paper || !isPaperReadableStatus(paper.status)) {
      set({
        markdownContent: '',
        paperTocTitle: null,
        paperTocItems: []
      })
      setTranslationCache(paperId, null)
      setTranslationTaskState(paperId, createIdleTranslationTaskState())
      setHasTranslationState(paperId, false)
      setReaderDocument(paperId, null)
      setAnnotations(paperId, [])
      return
    }

    set({ markdownLoading: true, paperTocTitle: null, paperTocItems: [] })
    try {
      const readerDocument = await loadReaderDocument(paperId)
      if (readerDocument) {
        set({ markdownContent: readerDocument.markdown })
        await loadTranslationState(paperId)
        await loadAnnotations(paperId)
      } else {
        set({ markdownContent: '', paperTocTitle: null, paperTocItems: [] })
        setTranslationCache(paperId, null)
        setTranslationTaskState(paperId, createIdleTranslationTaskState())
        setHasTranslationState(paperId, false)
        setAnnotations(paperId, [])
      }
    } finally {
      set({ markdownLoading: false })
    }
  }

  // -------------------------------------------------------------------------
  // Render pipeline actions
  // -------------------------------------------------------------------------

  function ensurePaperProgressSnapshot(paper: PaperDocument): void {
    const s = get()
    const totalPages = paper.pageCount
    const savedRenderedPages = Math.min(paper.pageAssets?.length || 0, totalPages)
    const hasActivePipeline = activePipelines.has(paper.id)

    if (!hasActivePipeline || !s.renderProgressByPaperId[paper.id]) {
      if (paper.status === 'rendering') {
        setRenderProgress(paper.id, {
          currentPage: Math.min(savedRenderedPages, Math.max(totalPages - 1, 0)),
          totalPages,
          completedPages: savedRenderedPages,
          stage: 'rendering'
        })
      } else if (savedRenderedPages > 0 || paper.status !== 'draft') {
        const completedPages =
          paper.status === 'failed' && savedRenderedPages < totalPages
            ? savedRenderedPages
            : Math.max(savedRenderedPages, totalPages)

        setRenderProgress(paper.id, {
          currentPage: Math.max(totalPages - 1, 0),
          totalPages,
          completedPages,
          stage:
            paper.status === 'failed' && savedRenderedPages < totalPages ? 'failed' : 'completed'
        })
      }
    }

    const currentOcrProgress = s.ocrProgressByPaperId[paper.id]
    if (
      paper.status === 'ocr_processing' &&
      (!currentOcrProgress || currentOcrProgress.status !== 'processing')
    ) {
      setOcrProgress({
        paperId: paper.id,
        currentPage: Math.min(paper.completedPageCount, Math.max(totalPages - 1, 0)),
        totalPages,
        completedPages: paper.completedPageCount,
        failedPages: [],
        status: 'processing'
      })
      return
    }

    if (
      (paper.status === 'completed' ||
        paper.status === 'partial_failed' ||
        paper.status === 'failed') &&
      (!currentOcrProgress || currentOcrProgress.status !== 'processing')
    ) {
      const statusMap: Record<
        'completed' | 'partial_failed' | 'failed',
        OcrProgressInfo['status']
      > = {
        completed: 'completed',
        partial_failed: 'partial_failed',
        failed: 'failed'
      }

      setOcrProgress({
        paperId: paper.id,
        currentPage: Math.min(paper.completedPageCount, Math.max(totalPages - 1, 0)),
        totalPages,
        completedPages: paper.completedPageCount,
        failedPages: [],
        status: statusMap[paper.status]
      })
    }
  }

  function ensureOcrProgressListener(): void {
    if (ocrProgressCleanup) return

    ocrProgressCleanup = window.api.paper.onOcrProgress((progress) => {
      const paper = get().papers.find((item) => item.id === progress.paperId)
      if (!paper) return

      setOcrProgress(progress)

      if (
        progress.status === 'processing' ||
        progress.status === 'completed' ||
        progress.status === 'partial_failed' ||
        progress.status === 'failed'
      ) {
        setRenderProgress(progress.paperId, {
          currentPage: Math.max(progress.totalPages - 1, 0),
          totalPages: progress.totalPages,
          completedPages: progress.totalPages,
          stage: 'completed'
        })
      }

      const statusMap: Record<OcrProgressInfo['status'], PaperStatus> = {
        idle: 'draft',
        processing: 'ocr_processing',
        completed: 'completed',
        partial_failed: 'partial_failed',
        failed: 'failed',
        cancelled: 'draft'
      }

      updatePaperInList(progress.paperId, {
        status: statusMap[progress.status],
        completedPageCount: progress.completedPages,
        errorMessage: progress.errorMessage
      })
    })
  }

  function markPipelineDeleted(paperId: string): void {
    const control = pipelineControls.get(paperId)
    if (control) {
      control.aborted = true
      control.deleted = true
      return
    }
    pipelineControls.set(paperId, { aborted: true, deleted: true })
  }

  function clearRenderPipelineState(paperId: string): void {
    const s = get()
    const nextRenderProgress = { ...s.renderProgressByPaperId }
    delete nextRenderProgress[paperId]

    const nextOcrProgress = { ...s.ocrProgressByPaperId }
    delete nextOcrProgress[paperId]

    set({
      renderProgressByPaperId: nextRenderProgress,
      ocrProgressByPaperId: nextOcrProgress
    })
  }

  async function retryPaper(paperId: string): Promise<{ success: boolean; error?: string }> {
    ensureOcrProgressListener()

    if (activePipelines.has(paperId)) {
      return { success: false, error: '论文正在处理中，请稍后再试' }
    }

    const paper = get().papers.find((item) => item.id === paperId)
    if (!paper) {
      return { success: false, error: '论文不存在' }
    }

    const totalPages = paper.pageCount

    if (hasIncompleteRender(paper)) {
      try {
        const context = await loadPdfContextFromPaper(paper)

        await updatePaperStatus(paperId, 'rendering')
        updatePaperInList(paperId, { completedPageCount: 0 })

        setRenderProgress(paperId, {
          currentPage: 0,
          totalPages: context.pageInfos.length,
          completedPages: 0,
          stage: 'rendering'
        })
        setOcrProgress(createIdleOcrProgress(paperId, context.pageInfos.length))

        void runRenderAndOcrPipeline(context)
        return { success: true }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return { success: false, error: errorMessage }
      }
    }

    activePipelines.add(paperId)

    try {
      const savedCompletedCount = paper.completedPageCount

      await updatePaperStatus(paperId, 'ocr_processing')
      updatePaperInList(paperId, { completedPageCount: savedCompletedCount })

      setRenderProgress(paperId, {
        currentPage: Math.max(totalPages - 1, 0),
        totalPages,
        completedPages: totalPages,
        stage: 'completed'
      })
      setOcrProgress({
        paperId,
        currentPage: 0,
        totalPages,
        completedPages: savedCompletedCount,
        failedPages: [],
        status: 'processing'
      })

      const result = await window.api.paper.startOcr(paperId)
      if (!result.success) {
        throw new Error(result.error || 'OCR 重试失败')
      }

      await loadPapers()
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setOcrProgress({
        ...(get().ocrProgressByPaperId[paperId] || createIdleOcrProgress(paperId, totalPages)),
        status: 'failed',
        errorMessage
      })

      try {
        await updatePaperStatus(paperId, 'failed', errorMessage)
      } catch {
        // 保留首次失败原因
      }

      return { success: false, error: errorMessage }
    } finally {
      activePipelines.delete(paperId)
    }
  }

  async function uploadAndRenderPdf(): Promise<{
    success: boolean
    paperId?: string
    error?: string
  }> {
    ensureOcrProgressListener()

    let rasterizer: ReturnType<typeof usePdfPageRasterizer> | null = null

    try {
      const fileInfo = await window.api.paper.selectPdfFile()
      if (!fileInfo) {
        return { success: false, error: '未选择文件' }
      }

      const fileResult = await window.api.paper.readFileAsBase64(fileInfo.path)
      if (!fileResult.success || !fileResult.data) {
        throw new Error(fileResult.error || '读取 PDF 文件失败')
      }

      rasterizer = usePdfPageRasterizer()
      const pageInfos = await rasterizer.loadPdf(decodeBase64ToArrayBuffer(fileResult.data))
      const totalPageCount = pageInfos.length

      const createResult = await window.api.paper.uploadPdf({
        sourcePdfPath: fileInfo.path,
        pageCount: totalPageCount
      })
      if (!createResult.success || !createResult.data) {
        throw new Error(createResult.error || '创建论文记录失败')
      }

      const newPaperId = createResult.data.id
      upsertPaper({
        ...createResult.data,
        status: 'rendering',
        errorMessage: undefined
      })

      setRenderProgress(newPaperId, {
        currentPage: 0,
        totalPages: totalPageCount,
        completedPages: 0,
        stage: 'rendering'
      })
      setOcrProgress(createIdleOcrProgress(newPaperId, totalPageCount))

      void runRenderAndOcrPipeline({
        paperId: newPaperId,
        pageInfos,
        rasterizer
      })
      rasterizer = null

      return { success: true, paperId: newPaperId }
    } catch (error) {
      rasterizer?.dispose()
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  // -------------------------------------------------------------------------
  // Annotation actions
  // -------------------------------------------------------------------------

  function setReaderDocument(paperId: string, document: PaperReaderDocument | null): void {
    const s = get()
    const nextMap = { ...s.readerDocumentByPaperId }
    if (document) {
      nextMap[paperId] = document
    } else {
      delete nextMap[paperId]
    }
    set({ readerDocumentByPaperId: nextMap })
  }

  function setAnnotations(paperId: string, annotations: PaperAnnotation[]): void {
    const s = get()
    set({
      annotationsByPaperId: {
        ...s.annotationsByPaperId,
        [paperId]: annotations
      }
    })
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
    const plainParams = deepClone(params)
    const result = await window.api.paper.createAnnotation(plainParams)
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }
    const current = get().annotationsByPaperId[plainParams.paperId] || []
    setAnnotations(plainParams.paperId, [...current, result.data])
    return result
  }

  async function updateAnnotation(params: UpdatePaperAnnotationPayload): Promise<{
    success: boolean
    data?: PaperAnnotation
    affectedKnowledgeBases?: PaperAnnotationAffectedKnowledgeBase[]
    error?: string
  }> {
    const plainParams = deepClone(params)
    const result = await window.api.paper.updateAnnotation(plainParams)
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }

    const current = get().annotationsByPaperId[plainParams.paperId] || []
    const nextAnnotations = current.map((annotation) =>
      annotation.id === plainParams.annotationId ? result.data! : annotation
    )
    setAnnotations(plainParams.paperId, nextAnnotations)

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
  }

  async function deleteAnnotation(
    paperId: string,
    annotationId: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await window.api.paper.deleteAnnotation({ paperId, annotationId })
    if (!result.success || !result.data) {
      return { success: false, error: result.error }
    }
    setAnnotations(paperId, result.data)
    return { success: true }
  }

  function clearAnnotationState(paperId: string): void {
    setReaderDocument(paperId, null)
    const s = get()
    const nextAnnotations = { ...s.annotationsByPaperId }
    delete nextAnnotations[paperId]
    set({ annotationsByPaperId: nextAnnotations })
  }

  // -------------------------------------------------------------------------
  // Figure preview actions
  // -------------------------------------------------------------------------

  function setFigureLoading(paperId: string, loading: boolean): void {
    const s = get()
    set({
      figureLoadingByPaperId: {
        ...s.figureLoadingByPaperId,
        [paperId]: loading
      }
    })
  }

  function setPaperFigures(paperId: string, figures: PaperFigureItem[]): void {
    const s = get()
    set({
      figuresByPaperId: {
        ...s.figuresByPaperId,
        [paperId]: figures
      }
    })
  }

  function clearPaperFigureState(paperId: string): void {
    const s = get()
    const nextFigures = { ...s.figuresByPaperId }
    delete nextFigures[paperId]

    const nextFigureLoading = { ...s.figureLoadingByPaperId }
    delete nextFigureLoading[paperId]

    set({
      figuresByPaperId: nextFigures,
      figureLoadingByPaperId: nextFigureLoading
    })
  }

  async function loadFigures(paperId: string, force = false): Promise<PaperFigureItem[]> {
    const s = get()
    const cachedFigures = s.figuresByPaperId[paperId]
    if (!force && cachedFigures) return cachedFigures

    setFigureLoading(paperId, true)
    try {
      const result = await window.api.paper.listFigures(paperId)
      if (!result.success || !result.data) {
        setPaperFigures(paperId, [])
        return []
      }
      const normalizedFigures = await normalizePaperFigures(result.data)
      setPaperFigures(paperId, normalizedFigures)
      return normalizedFigures
    } finally {
      setFigureLoading(paperId, false)
    }
  }

  async function toggleFigurePanel(): Promise<void> {
    const s = get()
    if (!s.currentPaperId) return

    if (s.showFigurePanel) {
      set({ showFigurePanel: false })
      return
    }

    set({ showFigurePanel: true })
    await loadFigures(s.currentPaperId)
  }

  function openFigurePreview(
    item: PaperFigureItem,
    options?: { initialRect?: Partial<PaperFigurePreviewRect> }
  ): void {
    const s = get()
    const ratio = getFigureRatio(item)

    if (!s.activeFigure) {
      const defaultRect = createDefaultFigurePreviewRect()
      const initialRect = options?.initialRect
      const width = clampPreviewWidth(initialRect?.width ?? defaultRect.width)
      const height =
        typeof initialRect?.height === 'number' && Number.isFinite(initialRect.height)
          ? initialRect.height
          : getFigurePreviewHeight(width, ratio)

      const nextRect: PaperFigurePreviewRect = {
        left: clampPreviewLeft(initialRect?.left ?? defaultRect.left, width),
        top: clampPreviewTop(initialRect?.top ?? defaultRect.top, height),
        width,
        height: clampPreviewHeight(height)
      }
      set({
        figurePreviewRect: nextRect,
        figurePreviewPinned: false,
        activeFigure: item,
        figurePreviewImageRatio: ratio,
        showFigurePanel: false
      })
      return
    }

    set({
      activeFigure: item,
      figurePreviewImageRatio: ratio,
      showFigurePanel: false
    })
  }

  function closeFigurePreview(): void {
    set({
      activeFigure: null,
      figurePreviewPinned: false,
      figurePreviewImageRatio: 0.75
    })
  }

  function resetFigureUiState(): void {
    set({
      showFigurePanel: false,
      activeFigure: null,
      figurePreviewPinned: false,
      figurePreviewImageRatio: 0.75
    })
  }

  function setFigurePreviewRect(nextRect: Partial<PaperFigurePreviewRect>): void {
    const s = get()
    const nextWidth =
      typeof nextRect.width === 'number' && Number.isFinite(nextRect.width)
        ? nextRect.width
        : s.figurePreviewRect.width
    const width = clampPreviewWidth(nextWidth)
    const currentHeight = s.figurePreviewRect.height
    const fallbackHeight =
      typeof currentHeight === 'number' && Number.isFinite(currentHeight)
        ? currentHeight
        : getFigurePreviewHeight(width, s.figurePreviewImageRatio)
    const nextHeight =
      typeof nextRect.height === 'number' && Number.isFinite(nextRect.height)
        ? nextRect.height
        : fallbackHeight
    const height = clampPreviewHeight(nextHeight)

    set({
      figurePreviewRect: {
        left: clampPreviewLeft(nextRect.left ?? s.figurePreviewRect.left, width),
        top: clampPreviewTop(nextRect.top ?? s.figurePreviewRect.top, height),
        width,
        height
      }
    })
  }

  function moveFigurePreview(delta: { x: number; y: number }): void {
    const s = get()
    set({
      figurePreviewRect: {
        ...s.figurePreviewRect,
        left: clampPreviewLeft(s.figurePreviewRect.left + delta.x, s.figurePreviewRect.width),
        top: clampPreviewTop(s.figurePreviewRect.top + delta.y, s.figurePreviewRect.height)
      }
    })
  }

  function resizeFigurePreview(nextWidth: number): void {
    if (!Number.isFinite(nextWidth)) return
    const s = get()
    const width = clampPreviewWidth(nextWidth)
    set({
      figurePreviewRect: {
        ...s.figurePreviewRect,
        width,
        left: clampPreviewLeft(s.figurePreviewRect.left, width)
      }
    })
  }

  function resizeFigurePreviewFromLeft(nextWidth: number): void {
    if (!Number.isFinite(nextWidth)) return
    const s = get()
    const right = s.figurePreviewRect.left + s.figurePreviewRect.width
    const width = clampPreviewWidth(nextWidth)
    set({
      figurePreviewRect: {
        ...s.figurePreviewRect,
        width,
        left: clampPreviewLeft(right - width, width)
      }
    })
  }

  function scrollToHeading(headingId: string): boolean {
    if (typeof document === 'undefined') return false
    const heading = document.getElementById(headingId)
    if (!heading) return false
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return true
  }

  function setPaperTocOutline(outline: PaperTocOutline): void {
    set({
      paperTocTitle: outline.documentTitle || null,
      paperTocItems: outline.items
    })
  }

  function clearPaperToc(): void {
    set({ paperTocTitle: null, paperTocItems: [] })
  }

  // -------------------------------------------------------------------------
  // Translation actions
  // -------------------------------------------------------------------------

  function ensureTranslationProgressListener(): void {
    if (translationProgressCleanup) return

    translationProgressCleanup = window.api.paper.onTranslationProgress(
      (progress: PaperTranslationProgress) => {
        const now = new Date().toISOString()
        const s = get()
        const existingCache = s.translationByPaperId[progress.paperId]
        const baseCache: PaperTranslationCache =
          existingCache && existingCache.sourceHash === progress.sourceHash
            ? existingCache
            : {
                paperId: progress.paperId,
                sourceHash: progress.sourceHash,
                totalSegments: progress.totalSegments,
                completedSegments: progress.completedSegments,
                entries: [],
                updatedAt: now
              }

        const nextCache = upsertTranslationEntry(
          {
            ...baseCache,
            sourceHash: progress.sourceHash,
            totalSegments: progress.totalSegments,
            completedSegments: progress.completedSegments,
            updatedAt: now
          },
          { ...progress.entry }
        )

        nextCache.completedSegments = progress.completedSegments
        nextCache.updatedAt = now

        if (progress.translationRevisionId) {
          nextCache.translationRevisionId = progress.translationRevisionId
        }

        setTranslationCache(progress.paperId, nextCache)
        setHasTranslationState(progress.paperId, hasPaperTranslationResult(nextCache))
        setTranslationTaskState(progress.paperId, {
          isRunning: progress.isRunning,
          completedSegments: progress.completedSegments,
          totalSegments: progress.totalSegments,
          lastError: progress.status === 'failed' ? progress.errorMessage : undefined
        })
      }
    )
  }

  async function loadTranslationState(paperId: string): Promise<void> {
    ensureTranslationProgressListener()

    const result = await window.api.paper.getTranslationState(paperId)
    if (!result.success || !result.data) {
      setTranslationCache(paperId, null)
      setTranslationTaskState(paperId, createIdleTranslationTaskState())
      return
    }

    const snapshot = result.data.cache
    const existingCache = get().translationByPaperId[paperId]

    if (
      existingCache &&
      snapshot &&
      existingCache.sourceHash === snapshot.sourceHash &&
      existingCache.entries.length > 0
    ) {
      const merged = mergeTranslationEntries(snapshot, existingCache)
      setTranslationCache(paperId, merged)
      setHasTranslationState(paperId, hasPaperTranslationResult(merged))
    } else {
      setTranslationCache(paperId, snapshot)
      setHasTranslationState(paperId, hasPaperTranslationResult(snapshot))
    }

    setTranslationTaskState(paperId, {
      isRunning: result.data.isRunning,
      completedSegments: (snapshot ?? existingCache)?.completedSegments ?? 0,
      totalSegments: (snapshot ?? existingCache)?.totalSegments ?? 0
    })

    if (result.data.isRunning) {
      await window.api.paper.startTranslation(paperId)
    }
  }

  async function ensureTranslation(paperId: string): Promise<{ success: boolean; error?: string }> {
    ensureTranslationProgressListener()

    const taskState = get().translationTaskByPaperId[paperId] || createIdleTranslationTaskState()

    const result = await window.api.paper.startTranslation(paperId)
    if (!result.success) {
      setTranslationTaskState(paperId, {
        ...taskState,
        lastError: result.error
      })
      return { success: false, error: result.error }
    }

    await loadTranslationState(paperId)
    return { success: true }
  }

  async function toggleTranslationVisible(): Promise<{ success: boolean; error?: string }> {
    const s = get()
    if (!s.currentPaperId) {
      return { success: false, error: '当前没有打开论文' }
    }

    if (s.translationVisible) {
      set({ translationVisible: false })
      return { success: true }
    }

    set({ translationVisible: true })
    const result = await ensureTranslation(s.currentPaperId)
    if (!result.success) {
      set({ translationVisible: false })
      return result
    }

    return { success: true }
  }

  async function loadTranslationStatus(paperIds: string[]): Promise<void> {
    if (paperIds.length === 0) {
      set({ hasTranslationByPaperId: {} })
      return
    }

    const result = await window.api.paper.listTranslationStatus(paperIds)
    if (!result.success || !result.data) return

    set({ hasTranslationByPaperId: result.data })
  }

  async function deleteTranslation(paperId: string): Promise<{ success: boolean; error?: string }> {
    const result = await window.api.paper.deleteTranslation(paperId)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    setTranslationCache(paperId, null)
    setTranslationTaskState(paperId, createIdleTranslationTaskState())
    setHasTranslationState(paperId, false)

    if (get().currentPaperId === paperId) {
      set({ translationVisible: false })
    }

    return { success: true }
  }

  async function retranslateSegment(
    paperId: string,
    segmentId: string
  ): Promise<{ success: boolean; error?: string }> {
    ensureTranslationProgressListener()

    const result = await window.api.paper.retranslateSegment({ paperId, segmentId })
    if (!result.success) {
      return { success: false, error: result.error }
    }

    return { success: true }
  }

  function clearTranslationState(paperId: string): void {
    setTranslationCache(paperId, null)
    setTranslationTaskState(paperId, null)

    const s = get()
    const nextTranslationState = { ...s.hasTranslationByPaperId }
    delete nextTranslationState[paperId]
    set({ hasTranslationByPaperId: nextTranslationState })
  }

  // -------------------------------------------------------------------------
  // Chat session actions
  // -------------------------------------------------------------------------

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

  async function ensurePaperChatSession(
    paperId: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const pendingSession = pendingPaperChatSessionByPaperId.get(paperId)
    if (pendingSession) return await pendingSession

    const ensurePromise = (async (): Promise<{
      success: boolean
      data?: string
      error?: string
    }> => {
      try {
        let paper = get().papers.find((item) => item.id === paperId) || null

        if (!paper) {
          const paperResult = await window.api.paper.get(paperId)
          if (!paperResult.success || !paperResult.data) {
            return { success: false, error: paperResult.error || '论文不存在' }
          }
          paper = paperResult.data
          upsertPaper(paper)
        }

        if (!isPaperReadableStatus(paper.status)) {
          return { success: false, error: '论文尚未完成 OCR，无法创建对话' }
        }

        if (paper.chatSessionId) {
          const existingSession = await window.api.session.load(paper.chatSessionId)
          if (existingSession) {
            return { success: true, data: existingSession.sessionId }
          }
        }

        const title = `论文对话：${paper.fileName}`
        const createdSession = await window.api.session.create(title, 'paper')
        const bindResult = await setPaperChatSession(paper.id, createdSession.sessionId)
        if (!bindResult.success) {
          return {
            success: false,
            error: bindResult.error || '绑定论文聊天会话失败'
          }
        }

        return { success: true, data: createdSession.sessionId }
      } catch (caught) {
        const error = caught instanceof Error ? caught.message : String(caught)
        return { success: false, error }
      }
    })()

    pendingPaperChatSessionByPaperId.set(paperId, ensurePromise)

    try {
      return await ensurePromise
    } finally {
      pendingPaperChatSessionByPaperId.delete(paperId)
    }
  }

  // -------------------------------------------------------------------------
  // 清理
  // -------------------------------------------------------------------------

  function clearPaperState(paperId: string): void {
    clearRenderPipelineState(paperId)
    clearPaperFigureState(paperId)
    clearTranslationState(paperId)
    clearAnnotationState(paperId)
    markdownScrollPositionByPaperId.delete(paperId)
    originalPdfScrollPositionByPaperId.delete(paperId)
  }

  // -------------------------------------------------------------------------
  // Scroll position actions
  // -------------------------------------------------------------------------

  function setMarkdownScrollPosition(paperId: string, position: PaperViewScrollPosition): void {
    if (!paperId) return
    markdownScrollPositionByPaperId.set(paperId, normalizeScrollPosition(position))
  }

  function getMarkdownScrollPosition(paperId: string): PaperViewScrollPosition | null {
    return markdownScrollPositionByPaperId.get(paperId) || null
  }

  function setOriginalPdfScrollPosition(paperId: string, position: PaperViewScrollPosition): void {
    if (!paperId) return
    originalPdfScrollPositionByPaperId.set(paperId, normalizeScrollPosition(position))
  }

  function getOriginalPdfScrollPosition(paperId: string): PaperViewScrollPosition | null {
    return originalPdfScrollPositionByPaperId.get(paperId) || null
  }

  // -------------------------------------------------------------------------
  // Zoom actions
  // -------------------------------------------------------------------------

  function setZoomLevel(value: number, options: { persist?: boolean } = {}): void {
    const nextZoomLevel = normalizeZoomLevel(value)
    const s = get()
    const isOriginalPdf = s.originalPdfVisible
    const currentLevel = isOriginalPdf ? s.originalPdfZoomLevel : s.markdownZoomLevel
    if (currentLevel === nextZoomLevel) return

    if (isOriginalPdf) {
      set({ originalPdfZoomLevel: nextZoomLevel })
    } else {
      set({ markdownZoomLevel: nextZoomLevel })
    }
    scheduleZoomPercentSync()

    if (options.persist !== false) {
      scheduleZoomPersistence()
    }
  }

  function loadPaperReaderPreferences(): void {
    const configStore = useConfigStore.getState()
    const mz = normalizeZoomLevel(configStore.paperReaderConfig.zoomLevel)
    const oz = normalizeZoomLevel(configStore.paperReaderConfig.originalPdfZoomLevel)
    const s = get()
    const level = s.originalPdfVisible ? oz : mz
    const zoomPercent = Math.round(level * 100)
    zoomPersistenceReady = true
    if (
      s.markdownZoomLevel === mz &&
      s.originalPdfZoomLevel === oz &&
      s.zoomPercent === zoomPercent
    ) {
      return
    }
    set({
      markdownZoomLevel: mz,
      originalPdfZoomLevel: oz,
      zoomPercent
    })
  }

  function zoomIn(): void {
    const s = get()
    const level = s.originalPdfVisible ? s.originalPdfZoomLevel : s.markdownZoomLevel
    setZoomLevel(+(level + ZOOM_STEP).toFixed(1))
  }

  function zoomOut(): void {
    const s = get()
    const level = s.originalPdfVisible ? s.originalPdfZoomLevel : s.markdownZoomLevel
    setZoomLevel(+(level - ZOOM_STEP).toFixed(1))
  }

  function resetZoom(): void {
    setZoomLevel(ZOOM_DEFAULT)
  }

  function handleWheelZoom(event: WheelEvent): void {
    if (!event.ctrlKey) return
    event.preventDefault()
    pendingWheelDelta += -event.deltaY * 0.01
    if (wheelZoomRafId === null) {
      wheelZoomRafId = requestAnimationFrame(() => {
        wheelZoomRafId = null
        if (pendingWheelDelta === 0) return
        const s = get()
        const level = s.originalPdfVisible ? s.originalPdfZoomLevel : s.markdownZoomLevel
        const nextZoomLevel = normalizeZoomLevel(level + pendingWheelDelta)
        pendingWheelDelta = 0
        const isOriginalPdf = s.originalPdfVisible
        const currentLevel = isOriginalPdf ? s.originalPdfZoomLevel : s.markdownZoomLevel
        if (currentLevel === nextZoomLevel) return
        if (isOriginalPdf) {
          set({ originalPdfZoomLevel: nextZoomLevel })
        } else {
          set({ markdownZoomLevel: nextZoomLevel })
        }
        scheduleZoomPercentSync()
      })
    }
    if (zoomEndTimer) clearTimeout(zoomEndTimer)
    zoomEndTimer = setTimeout(() => {
      zoomEndTimer = null
      scheduleZoomPersistence()
    }, 500)
  }

  function hideOriginalPdf(): void {
    set({ originalPdfVisible: false })
  }

  function toggleOriginalPdfVisible(): void {
    const s = get()
    const nextVisible = !s.originalPdfVisible
    if (nextVisible) {
      set({
        originalPdfVisible: true,
        showFigurePanel: false,
        activeFigure: null,
        figurePreviewPinned: false,
        figurePreviewImageRatio: 0.75
      })
    } else {
      set({ originalPdfVisible: false })
    }
  }

  // -------------------------------------------------------------------------
  // Retranslate segment（组合翻译 + 注释）
  // -------------------------------------------------------------------------

  async function retranslateSegmentWithAnnotation(
    paperId: string,
    segmentId: string,
    segmentStableId: string
  ): Promise<{ success: boolean; error?: string }> {
    const result = await retranslateSegment(paperId, segmentId)
    if (!result.success) return result

    const s = get()
    const paperAnnotations = s.annotationsByPaperId[paperId] || []
    const annotationIdsToDelete = paperAnnotations
      .filter((ann) => ann.semanticAnchor.segmentStableId === segmentStableId)
      .map((ann) => ann.id)

    for (const id of annotationIdsToDelete) {
      await deleteAnnotation(paperId, id)
    }

    return result
  }

  // -------------------------------------------------------------------------
  // Store 返回值
  // -------------------------------------------------------------------------

  return {
    // 核心状态
    papers: [] as PaperDocument[],
    currentPaperId: null as string | null,
    markdownContent: '',
    markdownLoading: false,
    originalPdfVisible: false,

    // Figure preview 状态
    figuresByPaperId: {} as Record<string, PaperFigureItem[]>,
    figureLoadingByPaperId: {} as Record<string, boolean>,
    showFigurePanel: false,
    activeFigure: null as PaperFigureItem | null,
    figurePreviewPinned: false,
    figurePreviewRect: createDefaultFigurePreviewRect(),
    figurePreviewImageRatio: 0.75,
    paperTocTitle: null as PaperTocEntry | null,
    paperTocItems: [] as PaperTocItem[],

    // Annotation 状态
    readerDocumentByPaperId: {} as Record<string, PaperReaderDocument>,
    annotationsByPaperId: {} as Record<string, PaperAnnotation[]>,

    // Translation 状态
    translationVisible: false,
    translationByPaperId: {} as Record<string, PaperTranslationCache>,
    translationTaskByPaperId: {} as Record<string, PaperTranslationTaskState>,
    hasTranslationByPaperId: {} as Record<string, boolean>,

    // Render pipeline 状态
    renderProgressByPaperId: {} as Record<string, RenderingProgress>,
    ocrProgressByPaperId: {} as Record<string, OcrProgressInfo>,

    // 缩放状态
    markdownZoomLevel: ZOOM_DEFAULT,
    originalPdfZoomLevel: ZOOM_DEFAULT,
    zoomPercent: 100,

    // -------------------------------------------------------------------------
    // Getters（以函数形式暴露，读取 get() 最新状态）
    // -------------------------------------------------------------------------

    currentPaper: () => {
      const s = get()
      return s.papers.find((paper) => paper.id === s.currentPaperId) || null
    },

    currentPaperFigures: () => {
      const s = get()
      if (!s.currentPaperId) return []
      return s.figuresByPaperId[s.currentPaperId] || []
    },

    currentReaderDocument: () => {
      const s = get()
      if (!s.currentPaperId) return null
      return s.readerDocumentByPaperId[s.currentPaperId] || null
    },

    currentAnnotations: () => {
      const s = get()
      if (!s.currentPaperId) return []
      return s.annotationsByPaperId[s.currentPaperId] || []
    },

    currentTranslationCache: () => {
      const s = get()
      if (!s.currentPaperId) return null
      return s.translationByPaperId[s.currentPaperId] || null
    },

    figureCaptionTranslationMap: () => {
      const s = get()
      const cache = s.currentPaperId ? s.translationByPaperId[s.currentPaperId] || null : null
      return buildFigureCaptionTranslationMap(cache)
    },

    currentTranslationTask: () => {
      const s = get()
      if (!s.currentPaperId) return createIdleTranslationTaskState()
      return s.translationTaskByPaperId[s.currentPaperId] || createIdleTranslationTaskState()
    },

    isCurrentPaperTranslating: () => {
      const s = get()
      if (!s.currentPaperId) return false
      const task = s.translationTaskByPaperId[s.currentPaperId]
      return task?.isRunning ?? false
    },

    isOcrCompleted: () => {
      const s = get()
      const paper = s.papers.find((p) => p.id === s.currentPaperId)
      return paper?.status === 'completed'
    },

    paperBasePath: () => {
      const s = get()
      const paper = s.papers.find((p) => p.id === s.currentPaperId)
      if (!paper?.filePath) return null
      const lastSlash = paper.filePath.lastIndexOf('/')
      if (lastSlash < 0) return null
      return paper.filePath.substring(0, lastSlash)
    },

    zoomLevel: () => {
      const s = get()
      return s.originalPdfVisible ? s.originalPdfZoomLevel : s.markdownZoomLevel
    },

    canZoomIn: () => {
      const s = get()
      const level = s.originalPdfVisible ? s.originalPdfZoomLevel : s.markdownZoomLevel
      return level < ZOOM_MAX
    },

    canZoomOut: () => {
      const s = get()
      const level = s.originalPdfVisible ? s.originalPdfZoomLevel : s.markdownZoomLevel
      return level > ZOOM_MIN
    },

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    loadPapers,
    selectPaper,
    openPaper,
    deletePaper,
    updatePaperStatus,
    uploadAndRenderPdf,
    loadMarkdown,
    loadAnnotations,
    loadFigures,
    setPaperTocOutline,
    clearPaperToc,
    scrollToHeading,
    ensureOcrProgressListener,
    ensureTranslationProgressListener,
    loadTranslationState,
    ensureTranslation,
    loadTranslationStatus,
    deleteTranslation,
    retranslateSegment: retranslateSegmentWithAnnotation,
    setPaperChatSession,
    ensurePaperChatSession,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
    toggleTranslationVisible,
    retryPaper,
    setFigurePanelVisible: (value: boolean) => {
      if (get().showFigurePanel === value) return
      set({ showFigurePanel: value })
    },
    closeFigurePanel: () => {
      if (!get().showFigurePanel) return
      set({ showFigurePanel: false })
    },
    toggleFigurePanel,
    openFigurePreview,
    closeFigurePreview,
    setFigurePreviewPinned: (value: boolean) => set({ figurePreviewPinned: value }),
    setFigurePreviewImageRatio: (ratio: number) => {
      if (!Number.isFinite(ratio) || ratio <= 0) return
      set({ figurePreviewImageRatio: ratio })
    },
    setFigurePreviewRect,
    moveFigurePreview,
    resizeFigurePreview,
    resizeFigurePreviewFromLeft,
    resetFigureUiState,
    hideTranslation: () => set({ translationVisible: false }),
    hideOriginalPdf,
    toggleOriginalPdfVisible,
    loadPaperReaderPreferences,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoomLevel,
    handleWheelZoom,
    setMarkdownScrollPosition,
    getMarkdownScrollPosition,
    setOriginalPdfScrollPosition,
    getOriginalPdfScrollPosition,

    // 公开内部设置方法（供 loadMarkdown 等使用）
    setReaderDocument,
    setAnnotations,
    setTranslationCache,
    setTranslationTaskState,
    setHasTranslationState,
    clearAnnotationState,
    clearPaperFigureState,
    clearTranslationState,
    clearRenderPipelineState,
    markPipelineDeleted,
    clearPaperState,
    ensurePaperProgressSnapshot
  }
})
