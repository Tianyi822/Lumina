import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { OcrProgressInfo, PaperDocument, PaperStatus } from '@shared/types/paper'
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

interface RenderPipelineContext {
  paperId: string
  pageInfos: PageInfo[]
  rasterizer: ReturnType<typeof usePdfPageRasterizer>
}

interface PipelineControl {
  aborted: boolean
  deleted: boolean
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

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return bytes.buffer as ArrayBuffer
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

  /** OCR 进度监听清理函数 */
  let ocrProgressCleanup: (() => void) | null = null

  /** 正在运行的论文任务 */
  const activePipelines = new Set<string>()

  /** 每篇论文的取消控制 */
  const pipelineControls = new Map<string, PipelineControl>()

  /** 获取当前论文 */
  const currentPaper = computed<PaperDocument | null>(
    () => papers.value.find((paper) => paper.id === currentPaperId.value) || null
  )

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
    }

    if (currentPaperId.value && !selectedPaper) {
      currentPaperId.value = null
      markdownContent.value = ''
    }
  }

  /** 选择当前论文，仅允许选中已完成 OCR 的论文 */
  function selectPaper(paperId: string | null): void {
    if (!paperId) {
      currentPaperId.value = null
      return
    }

    const paper = papers.value.find((item) => item.id === paperId)
    if (!paper || !isPaperReadableStatus(paper.status)) {
      return
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
      return
    }

    markdownLoading.value = true
    try {
      const result = await window.api.paper.getMergedMd(paperId)
      if (result.success && result.data !== undefined) {
        markdownContent.value = result.data
      } else {
        markdownContent.value = ''
      }
    } finally {
      markdownLoading.value = false
    }
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
    currentPaper,
    isOcrCompleted,
    paperBasePath,
    loadPapers,
    selectPaper,
    openPaper,
    deletePaper,
    updatePaperStatus,
    uploadAndRenderPdf,
    loadMarkdown,
    ensureOcrProgressListener,
    retryPaper
  }
})
