import { ref, type Ref } from 'vue'
import type { OcrProgressInfo, PaperDocument, PaperStatus } from '@shared/types/paper'
import { usePdfPageRasterizer } from '@renderer/composables/usePdfPageRasterizer'
import {
  createIdleOcrProgress,
  decodeBase64ToArrayBuffer,
  type PipelineControl,
  type RenderPipelineContext,
  type RenderingProgress
} from '../shared'

interface PaperRenderPipelineOptions {
  papers: Ref<PaperDocument[]>
  upsertPaper: (paper: PaperDocument) => void
  updatePaperInList: (paperId: string, updates: Partial<PaperDocument>) => void
  updatePaperStatus: (paperId: string, status: PaperStatus, errorMessage?: string) => Promise<void>
  loadPapers: () => Promise<void>
}

export interface PaperRenderPipelineComposable {
  renderProgressByPaperId: Ref<Record<string, RenderingProgress>>
  ocrProgressByPaperId: Ref<Record<string, OcrProgressInfo>>
  ensurePaperProgressSnapshot: (paper: PaperDocument) => void
  ensureOcrProgressListener: () => void
  retryPaper: (paperId: string) => Promise<{ success: boolean; error?: string }>
  uploadAndRenderPdf: () => Promise<{ success: boolean; paperId?: string; error?: string }>
  clearRenderPipelineState: (paperId: string) => void
  markPipelineDeleted: (paperId: string) => void
}

export function usePaperRenderPipeline(
  options: PaperRenderPipelineOptions
): PaperRenderPipelineComposable {
  const { papers, upsertPaper, updatePaperInList, updatePaperStatus, loadPapers } = options

  const renderProgressByPaperId = ref<Record<string, RenderingProgress>>({})
  const ocrProgressByPaperId = ref<Record<string, OcrProgressInfo>>({})

  let ocrProgressCleanup: (() => void) | null = null

  const activePipelines = new Set<string>()
  const pipelineControls = new Map<string, PipelineControl>()

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

  function clearRenderPipelineState(paperId: string): void {
    const nextRenderProgress = { ...renderProgressByPaperId.value }
    delete nextRenderProgress[paperId]
    renderProgressByPaperId.value = nextRenderProgress

    const nextOcrProgress = { ...ocrProgressByPaperId.value }
    delete nextOcrProgress[paperId]
    ocrProgressByPaperId.value = nextOcrProgress
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

  async function retryPaper(paperId: string): Promise<{ success: boolean; error?: string }> {
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
      const savedCompletedCount = paper.completedPageCount

      await updatePaperStatus(paperId, 'ocr_processing')
      updatePaperInList(paperId, {
        completedPageCount: savedCompletedCount
      })

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
    renderProgressByPaperId,
    ocrProgressByPaperId,
    ensurePaperProgressSnapshot,
    ensureOcrProgressListener,
    retryPaper,
    uploadAndRenderPdf,
    clearRenderPipelineState,
    markPipelineDeleted
  }
}
