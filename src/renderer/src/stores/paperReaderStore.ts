import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  OcrProgressInfo,
  PaperDocument,
  PaperFigureItem,
  PaperStatus,
  PaperTranslationCache,
  PaperTranslationEntry,
  PaperTranslationProgress
} from '@shared/types/paper'
import {
  buildBase64DataUrl,
  fileUrlToPath,
  getImageMimeTypeFromPath,
  isFileUrl
} from '@shared/utils'
import { usePdfPageRasterizer, type PageInfo } from '@renderer/composables/usePdfPageRasterizer'

/**
 * 渲染进度信息
 */
export interface RenderingProgress {
  /** 当前正在渲染的页索引（从 0 开始） */
  currentPage: number
  /** 总页数 */
  totalPages: number
  /** 已完成渲染的页数 */
  completedPages: number
  /** 当前阶段描述 */
  stage: 'idle' | 'selecting' | 'loading' | 'rendering' | 'completed' | 'failed'
  /** 错误信息 */
  error?: string
}

/**
 * 论文目录项
 * 仅在渲染进程内使用，用于工具栏目录浮层展示与跳转
 */
export interface PaperTocItem {
  /** 标题锚点 ID */
  id: string
  /** 标题文本 */
  text: string
  /** 标题层级，仅保留 H1-H3 */
  level: 1 | 2 | 3
}

interface RenderPipelineContext {
  paperId: string
  pageInfos: PageInfo[]
  rasterizer: ReturnType<typeof usePdfPageRasterizer>
}

interface PipelineControl {
  aborted: boolean
  deleted: boolean
}

interface PaperTranslationTaskState {
  isRunning: boolean
  completedSegments: number
  totalSegments: number
  lastError?: string
}

export interface PaperFigurePreviewRect {
  left: number
  top: number
  width: number
}

const READABLE_PAPER_STATUS: PaperStatus = 'completed'

function isPaperReadableStatus(status: PaperStatus): boolean {
  return status === READABLE_PAPER_STATUS
}

function createIdleOcrProgress(paperId: string, totalPages: number): OcrProgressInfo {
  return {
    paperId,
    currentPage: 0,
    totalPages,
    completedPages: 0,
    failedPages: [],
    status: 'idle'
  }
}

function createIdleTranslationTaskState(): PaperTranslationTaskState {
  return {
    isRunning: false,
    completedSegments: 0,
    totalSegments: 0
  }
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return bytes.buffer as ArrayBuffer
}

function createDefaultFigurePreviewRect(): PaperFigurePreviewRect {
  const width = 420
  const left = typeof window === 'undefined' ? 32 : Math.max(window.innerWidth - width - 32, 32)

  return {
    left,
    top: 88,
    width
  }
}

/**
 * 论文阅读器 Store
 * 管理 PDF 上传 → 逐页渲染 → OCR 识别 → Markdown 阅读的完整流程
 */
export const usePaperReaderStore = defineStore('paperReader', () => {
  /** 论文列表 */
  const papers = ref<PaperDocument[]>([])

  /** 当前选中的论文 ID */
  const currentPaperId = ref<string | null>(null)

  /** 每篇论文的页图渲染进度 */
  const renderProgressByPaperId = ref<Record<string, RenderingProgress>>({})

  /** 每篇论文的 OCR 进度 */
  const ocrProgressByPaperId = ref<Record<string, OcrProgressInfo>>({})

  /** Markdown 内容 */
  const markdownContent = ref('')

  /** Markdown 加载状态 */
  const markdownLoading = ref(false)

  /** 各论文的图片列表 */
  const figuresByPaperId = ref<Record<string, PaperFigureItem[]>>({})

  /** 各论文图片列表加载状态 */
  const figureLoadingByPaperId = ref<Record<string, boolean>>({})

  /** 图片下拉面板是否展开 */
  const showFigurePanel = ref(false)

  /** 当前预览中的图片 */
  const activeFigure = ref<PaperFigureItem | null>(null)

  /** 图片预览是否置顶 */
  const figurePreviewPinned = ref(false)

  /** 图片预览窗口位置与宽度 */
  const figurePreviewRect = ref<PaperFigurePreviewRect>(createDefaultFigurePreviewRect())

  /** 图片预览的宽高比 */
  const figurePreviewImageRatio = ref(0.75)

  /** 当前论文目录 */
  const paperTocItems = ref<PaperTocItem[]>([])

  /** 是否显示译文 */
  const translationVisible = ref(false)

  /** 各论文的翻译缓存 */
  const translationByPaperId = ref<Record<string, PaperTranslationCache>>({})

  /** 各论文的翻译任务状态 */
  const translationTaskByPaperId = ref<Record<string, PaperTranslationTaskState>>({})

  /** OCR 进度监听清理函数 */
  let ocrProgressCleanup: (() => void) | null = null

  /** 翻译进度监听清理函数 */
  let translationProgressCleanup: (() => void) | null = null

  /** 正在运行的论文任务 */
  const activePipelines = new Set<string>()

  /** 每篇论文的取消控制 */
  const pipelineControls = new Map<string, PipelineControl>()

  /** 获取当前论文 */
  const currentPaper = computed<PaperDocument | null>(
    () => papers.value.find((paper) => paper.id === currentPaperId.value) || null
  )

  /** 当前论文图片列表 */
  const currentPaperFigures = computed<PaperFigureItem[]>(() => {
    if (!currentPaperId.value) {
      return []
    }

    return figuresByPaperId.value[currentPaperId.value] || []
  })

  /** 当前论文翻译缓存 */
  const currentTranslationCache = computed<PaperTranslationCache | null>(() => {
    if (!currentPaperId.value) {
      return null
    }

    return translationByPaperId.value[currentPaperId.value] || null
  })

  /** 当前论文翻译任务状态 */
  const currentTranslationTask = computed<PaperTranslationTaskState>(() => {
    if (!currentPaperId.value) {
      return createIdleTranslationTaskState()
    }

    return translationTaskByPaperId.value[currentPaperId.value] || createIdleTranslationTaskState()
  })

  /** 当前论文是否正在翻译 */
  const isCurrentPaperTranslating = computed(() => currentTranslationTask.value.isRunning)

  /** 当前论文是否可阅读 */
  const isOcrCompleted = computed(() => {
    return currentPaper.value?.status === READABLE_PAPER_STATUS
  })

  /** 当前论文的数据目录基础路径（用于 Markdown 中图片的 file:// URL 解析） */
  const paperBasePath = computed(() => {
    const paper = currentPaper.value
    if (!paper?.filePath) return null

    const lastSlash = paper.filePath.lastIndexOf('/')
    if (lastSlash < 0) return null

    return paper.filePath.substring(0, lastSlash)
  })

  function setRenderProgress(paperId: string, progress: RenderingProgress): void {
    renderProgressByPaperId.value = {
      ...renderProgressByPaperId.value,
      [paperId]: progress
    }
  }

  function setOcrProgress(progress: OcrProgressInfo): void {
    ocrProgressByPaperId.value = {
      ...ocrProgressByPaperId.value,
      [progress.paperId]: progress
    }
  }

  function removePaperProgress(paperId: string): void {
    const nextRenderProgress = { ...renderProgressByPaperId.value }
    delete nextRenderProgress[paperId]
    renderProgressByPaperId.value = nextRenderProgress

    const nextOcrProgress = { ...ocrProgressByPaperId.value }
    delete nextOcrProgress[paperId]
    ocrProgressByPaperId.value = nextOcrProgress

    const nextFigures = { ...figuresByPaperId.value }
    delete nextFigures[paperId]
    figuresByPaperId.value = nextFigures

    const nextFigureLoading = { ...figureLoadingByPaperId.value }
    delete nextFigureLoading[paperId]
    figureLoadingByPaperId.value = nextFigureLoading

    const nextTranslationCache = { ...translationByPaperId.value }
    delete nextTranslationCache[paperId]
    translationByPaperId.value = nextTranslationCache

    const nextTranslationTask = { ...translationTaskByPaperId.value }
    delete nextTranslationTask[paperId]
    translationTaskByPaperId.value = nextTranslationTask
  }

  function setPaperTocItems(items: PaperTocItem[]): void {
    paperTocItems.value = items
  }

  function clearPaperToc(): void {
    paperTocItems.value = []
  }

  function hideTranslation(): void {
    translationVisible.value = false
  }

  function resetFigurePreviewRect(): void {
    figurePreviewRect.value = createDefaultFigurePreviewRect()
  }

  function setFigurePanelVisible(value: boolean): void {
    showFigurePanel.value = value
  }

  function closeFigurePanel(): void {
    showFigurePanel.value = false
  }

  function closeFigurePreview(): void {
    activeFigure.value = null
    figurePreviewPinned.value = false
    figurePreviewImageRatio.value = 0.75
  }

  function resetFigureUiState(): void {
    closeFigurePanel()
    closeFigurePreview()
  }

  function setFigurePreviewPinned(value: boolean): void {
    figurePreviewPinned.value = value
  }

  function setFigurePreviewImageRatio(ratio: number): void {
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return
    }

    figurePreviewImageRatio.value = ratio
  }

  function clampPreviewLeft(left: number, width: number): number {
    if (typeof window === 'undefined') {
      return Math.max(left, 16)
    }

    return Math.min(Math.max(left, 16), Math.max(window.innerWidth - width - 16, 16))
  }

  function clampPreviewTop(top: number): number {
    if (typeof window === 'undefined') {
      return Math.max(top, 16)
    }

    return Math.min(Math.max(top, 16), Math.max(window.innerHeight - 120, 16))
  }

  function moveFigurePreview(delta: { x: number; y: number }): void {
    figurePreviewRect.value = {
      ...figurePreviewRect.value,
      left: clampPreviewLeft(figurePreviewRect.value.left + delta.x, figurePreviewRect.value.width),
      top: clampPreviewTop(figurePreviewRect.value.top + delta.y)
    }
  }

  function resizeFigurePreview(nextWidth: number): void {
    if (!Number.isFinite(nextWidth)) {
      return
    }

    const maxWidth =
      typeof window === 'undefined' ? 720 : Math.max(Math.min(window.innerWidth - 32, 720), 320)
    const width = Math.min(Math.max(nextWidth, 320), maxWidth)

    figurePreviewRect.value = {
      ...figurePreviewRect.value,
      width,
      left: clampPreviewLeft(figurePreviewRect.value.left, width)
    }
  }

  function setFigureLoading(paperId: string, loading: boolean): void {
    figureLoadingByPaperId.value = {
      ...figureLoadingByPaperId.value,
      [paperId]: loading
    }
  }

  function setPaperFigures(paperId: string, figures: PaperFigureItem[]): void {
    figuresByPaperId.value = {
      ...figuresByPaperId.value,
      [paperId]: figures
    }
  }

  function setTranslationCache(paperId: string, cache: PaperTranslationCache | null): void {
    const nextCacheMap = { ...translationByPaperId.value }
    if (cache) {
      nextCacheMap[paperId] = cache
    } else {
      delete nextCacheMap[paperId]
    }
    translationByPaperId.value = nextCacheMap
  }

  function setTranslationTaskState(
    paperId: string,
    taskState: PaperTranslationTaskState | null
  ): void {
    const nextTaskMap = { ...translationTaskByPaperId.value }
    if (taskState) {
      nextTaskMap[paperId] = taskState
    } else {
      delete nextTaskMap[paperId]
    }
    translationTaskByPaperId.value = nextTaskMap
  }

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
        return {
          ...figure,
          imagePath
        }
      })
    )
  }

  function scrollToHeading(headingId: string): boolean {
    if (typeof document === 'undefined') {
      return false
    }

    const heading = document.getElementById(headingId)
    if (!heading) {
      return false
    }

    heading.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })

    return true
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
    if (index < 0) return

    papers.value[index] = {
      ...papers.value[index],
      ...updates
    }
  }

  function ensurePaperProgressSnapshot(paper: PaperDocument): void {
    const totalPages = paper.pageCount
    const savedRenderedPages = Math.min(paper.pageAssets?.length || 0, totalPages)
    const hasActivePipeline = activePipelines.has(paper.id)

    if (!hasActivePipeline || !renderProgressByPaperId.value[paper.id]) {
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

    const currentOcrProgress = ocrProgressByPaperId.value[paper.id]
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
    if (ocrProgressCleanup) {
      return
    }

    ocrProgressCleanup = window.api.paper.onOcrProgress((progress) => {
      const paper = papers.value.find((item) => item.id === progress.paperId)
      if (!paper) {
        return
      }

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

  function ensureTranslationProgressListener(): void {
    if (translationProgressCleanup) {
      return
    }

    translationProgressCleanup = window.api.paper.onTranslationProgress(
      (progress: PaperTranslationProgress) => {
        const now = new Date().toISOString()
        const existingCache = translationByPaperId.value[progress.paperId]
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
          {
            ...progress.entry
          }
        )

        nextCache.completedSegments = progress.completedSegments
        nextCache.updatedAt = now

        setTranslationCache(progress.paperId, nextCache)
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

    setTranslationCache(paperId, result.data.cache)
    setTranslationTaskState(paperId, {
      isRunning: result.data.isRunning,
      completedSegments: result.data.cache?.completedSegments ?? 0,
      totalSegments: result.data.cache?.totalSegments ?? 0
    })

    if (result.data.isRunning) {
      await window.api.paper.startTranslation(paperId)
    }
  }

  async function ensureTranslation(paperId: string): Promise<{ success: boolean; error?: string }> {
    ensureTranslationProgressListener()

    const cachedTranslation = translationByPaperId.value[paperId]
    const taskState = translationTaskByPaperId.value[paperId] || createIdleTranslationTaskState()

    if (
      cachedTranslation &&
      cachedTranslation.totalSegments > 0 &&
      cachedTranslation.completedSegments >= cachedTranslation.totalSegments &&
      !taskState.isRunning
    ) {
      return { success: true }
    }

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
    if (!currentPaperId.value) {
      return { success: false, error: '当前没有打开论文' }
    }

    if (translationVisible.value) {
      hideTranslation()
      return { success: true }
    }

    translationVisible.value = true
    const result = await ensureTranslation(currentPaperId.value)
    if (!result.success) {
      hideTranslation()
      return result
    }

    return { success: true }
  }

  /** 加载论文列表，并为进行中的 OCR 回填进度 */
  async function loadPapers(): Promise<void> {
    ensureOcrProgressListener()

    const result = await window.api.paper.list()
    if (!result.success || !result.data) {
      return
    }

    papers.value = result.data
    for (const paper of result.data) {
      ensurePaperProgressSnapshot(paper)
    }

    const ocrProcessingPapers = result.data.filter((paper) => paper.status === 'ocr_processing')
    await Promise.all(
      ocrProcessingPapers.map(async (paper) => {
        const progressResult = await window.api.paper.getOcrProgress(paper.id)
        if (progressResult.success && progressResult.data) {
          setOcrProgress(progressResult.data)
        }
      })
    )

    const selectedPaper = currentPaperId.value
      ? result.data.find((paper) => paper.id === currentPaperId.value)
      : null

    if (selectedPaper && !isPaperReadableStatus(selectedPaper.status)) {
      currentPaperId.value = null
      markdownContent.value = ''
      clearPaperToc()
      hideTranslation()
      resetFigureUiState()
    }

    if (currentPaperId.value && !selectedPaper) {
      currentPaperId.value = null
      markdownContent.value = ''
      clearPaperToc()
      hideTranslation()
      resetFigureUiState()
    }
  }

  /** 选择当前论文，仅允许选中已完成 OCR 的论文 */
  function selectPaper(paperId: string | null): void {
    if (!paperId) {
      currentPaperId.value = null
      clearPaperToc()
      hideTranslation()
      resetFigureUiState()
      return
    }

    const paper = papers.value.find((item) => item.id === paperId)
    if (!paper || !isPaperReadableStatus(paper.status)) {
      return
    }

    if (currentPaperId.value !== paperId) {
      hideTranslation()
      resetFigureUiState()
    }

    currentPaperId.value = paperId
  }

  /**
   * 选中并打开论文（更新 lastOpenedAt）
   * 仅完成 OCR 的论文允许打开阅读
   */
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
    ensurePaperProgressSnapshot(result.data)

    if (!isPaperReadableStatus(result.data.status)) {
      return null
    }

    if (currentPaperId.value !== paperId) {
      hideTranslation()
      resetFigureUiState()
    }

    currentPaperId.value = paperId
    await loadMarkdown(paperId)

    return result.data
  }

  function markPipelineDeleted(paperId: string): void {
    const control = pipelineControls.get(paperId)
    if (control) {
      control.aborted = true
      control.deleted = true
      return
    }

    pipelineControls.set(paperId, {
      aborted: true,
      deleted: true
    })
  }

  /** 删除论文 */
  async function deletePaper(paperId: string): Promise<boolean> {
    markPipelineDeleted(paperId)
    await window.api.paper.cancelOcr(paperId)

    const result = await window.api.paper.delete(paperId)
    if (!result.success) {
      return false
    }

    papers.value = papers.value.filter((paper) => paper.id !== paperId)
    removePaperProgress(paperId)

    if (currentPaperId.value === paperId) {
      currentPaperId.value = null
      markdownContent.value = ''
      clearPaperToc()
      hideTranslation()
      resetFigureUiState()
    }

    return true
  }

  /** 同步论文状态到主进程 */
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

  /**
   * 加载合并后的 Markdown 内容
   * 仅完成 OCR 的论文允许读取
   */
  async function loadMarkdown(paperId: string): Promise<void> {
    const paper = papers.value.find((item) => item.id === paperId)
    if (!paper || !isPaperReadableStatus(paper.status)) {
      markdownContent.value = ''
      clearPaperToc()
      setTranslationCache(paperId, null)
      setTranslationTaskState(paperId, createIdleTranslationTaskState())
      return
    }

    markdownLoading.value = true
    clearPaperToc()
    try {
      const result = await window.api.paper.getReaderMarkdown(paperId)
      if (result.success && result.data !== undefined) {
        markdownContent.value = result.data
        await loadTranslationState(paperId)
      } else {
        markdownContent.value = ''
        clearPaperToc()
        setTranslationCache(paperId, null)
        setTranslationTaskState(paperId, createIdleTranslationTaskState())
      }
    } finally {
      markdownLoading.value = false
    }
  }

  async function loadFigures(paperId: string, force = false): Promise<PaperFigureItem[]> {
    const cachedFigures = figuresByPaperId.value[paperId]
    if (!force && cachedFigures) {
      return cachedFigures
    }

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
    if (!currentPaperId.value) {
      return
    }

    if (showFigurePanel.value) {
      closeFigurePanel()
      return
    }

    showFigurePanel.value = true
    await loadFigures(currentPaperId.value)
  }

  function openFigurePreview(item: PaperFigureItem): void {
    if (!activeFigure.value) {
      resetFigurePreviewRect()
      figurePreviewPinned.value = false
    }

    activeFigure.value = item
    figurePreviewImageRatio.value =
      item.bbox.width > 0 && item.bbox.height > 0 ? item.bbox.height / item.bbox.width : 0.75
    closeFigurePanel()
  }

  function getPipelineControl(paperId: string): PipelineControl {
    const control = pipelineControls.get(paperId)
    if (control) {
      return control
    }

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
      return {
        paperId: paper.id,
        pageInfos,
        rasterizer
      }
    } catch (error) {
      rasterizer.dispose()
      throw error
    }
  }

  function hasIncompleteRender(paper: PaperDocument): boolean {
    const savedRenderedPages = Math.min(paper.pageAssets?.length || 0, paper.pageCount)
    const renderProgress = renderProgressByPaperId.value[paper.id]

    if (renderProgress?.stage === 'failed') {
      return true
    }

    return savedRenderedPages < paper.pageCount
  }

  async function retryPaper(paperId: string): Promise<{
    success: boolean
    error?: string
  }> {
    ensureOcrProgressListener()

    if (activePipelines.has(paperId)) {
      return { success: false, error: '论文正在处理中，请稍后再试' }
    }

    const paper = papers.value.find((item) => item.id === paperId)
    if (!paper) {
      return { success: false, error: '论文不存在' }
    }

    const totalPages = paper.pageCount

    if (hasIncompleteRender(paper)) {
      try {
        const context = await loadPdfContextFromPaper(paper)

        await updatePaperStatus(paperId, 'rendering')
        updatePaperInList(paperId, {
          completedPageCount: 0
        })

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
      await updatePaperStatus(paperId, 'ocr_processing')
      updatePaperInList(paperId, {
        completedPageCount: 0
      })

      setRenderProgress(paperId, {
        currentPage: Math.max(totalPages - 1, 0),
        totalPages,
        completedPages: totalPages,
        stage: 'completed'
      })
      setOcrProgress(createIdleOcrProgress(paperId, totalPages))

      const result = await window.api.paper.startOcr(paperId)
      if (!result.success) {
        throw new Error(result.error || 'OCR 重试失败')
      }

      await loadPapers()
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      setOcrProgress({
        ...(ocrProgressByPaperId.value[paperId] || createIdleOcrProgress(paperId, totalPages)),
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
      for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        if (control.aborted) {
          return
        }

        setRenderProgress(paperId, {
          currentPage: pageIndex,
          totalPages,
          completedPages: pageIndex,
          stage: 'rendering'
        })

        const renderResult = await rasterizer.renderPage(pageIndex, 2.0)
        if (control.aborted) {
          return
        }

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

      if (control.aborted) {
        return
      }

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
      if (control.deleted) {
        return
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      const lastRenderProgress = renderProgressByPaperId.value[paperId]
      const renderCompleted = (lastRenderProgress?.completedPages || 0) >= totalPages

      setRenderProgress(paperId, {
        currentPage: lastRenderProgress?.currentPage || 0,
        totalPages,
        completedPages: lastRenderProgress?.completedPages || 0,
        stage: renderCompleted ? 'completed' : 'failed',
        error: errorMessage
      })

      setOcrProgress({
        ...(ocrProgressByPaperId.value[paperId] || createIdleOcrProgress(paperId, totalPages)),
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

  /**
   * 上传 PDF 并立即创建论文记录，后台自动执行渲染和 OCR
   */
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

      const paperId = createResult.data.id
      upsertPaper({
        ...createResult.data,
        status: 'rendering',
        errorMessage: undefined
      })

      setRenderProgress(paperId, {
        currentPage: 0,
        totalPages: totalPageCount,
        completedPages: 0,
        stage: 'rendering'
      })
      setOcrProgress(createIdleOcrProgress(paperId, totalPageCount))

      void runRenderAndOcrPipeline({
        paperId,
        pageInfos,
        rasterizer
      })
      rasterizer = null

      return { success: true, paperId }
    } catch (error) {
      rasterizer?.dispose()
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  return {
    papers,
    currentPaperId,
    renderProgressByPaperId,
    ocrProgressByPaperId,
    markdownContent,
    markdownLoading,
    figuresByPaperId,
    figureLoadingByPaperId,
    showFigurePanel,
    activeFigure,
    figurePreviewPinned,
    figurePreviewRect,
    figurePreviewImageRatio,
    paperTocItems,
    translationVisible,
    translationByPaperId,
    translationTaskByPaperId,
    currentPaper,
    currentPaperFigures,
    currentTranslationCache,
    currentTranslationTask,
    isOcrCompleted,
    isCurrentPaperTranslating,
    paperBasePath,
    loadPapers,
    selectPaper,
    openPaper,
    deletePaper,
    updatePaperStatus,
    uploadAndRenderPdf,
    loadMarkdown,
    loadFigures,
    setPaperTocItems,
    clearPaperToc,
    scrollToHeading,
    ensureOcrProgressListener,
    ensureTranslationProgressListener,
    loadTranslationState,
    ensureTranslation,
    toggleTranslationVisible,
    retryPaper,
    setFigurePanelVisible,
    closeFigurePanel,
    toggleFigurePanel,
    openFigurePreview,
    closeFigurePreview,
    setFigurePreviewPinned,
    setFigurePreviewImageRatio,
    moveFigurePreview,
    resizeFigurePreview,
    resetFigureUiState,
    hideTranslation
  }
})
