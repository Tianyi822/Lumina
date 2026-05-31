import { create } from 'zustand'
import type { PaperDocument, PaperStatus, OcrProgressInfo } from '@shared/types/paper'
import {
  createIdleOcrProgress,
  isPaperReadableStatus,
  type PipelineControl,
  type RenderPipelineContext,
  type RenderingProgress
} from './shared'

// ---------------------------------------------------------------------------
// State 类型
// ---------------------------------------------------------------------------

interface PaperListState {
  papers: PaperDocument[]
  currentPaperId: string | null
  markdownContent: string
  markdownPaperId: string | null
  markdownLoading: boolean
  renderProgressByPaperId: Record<string, RenderingProgress>
  ocrProgressByPaperId: Record<string, OcrProgressInfo>

  // Getters
  currentPaper: () => PaperDocument | null
  isOcrCompleted: () => boolean
  paperBasePath: () => string | null

  // Actions
  selectPaper: (paperId: string | null) => void
  loadMarkdown: (paperId: string) => Promise<void>
  updatePaperStatus: (paperId: string, status: PaperStatus, errorMessage?: string) => Promise<void>
  ensureOcrProgressListener: () => void
  ensurePaperProgressSnapshot: (paper: PaperDocument) => void
  markPipelineDeleted: (paperId: string) => void
  clearRenderPipelineState: (paperId: string) => void
  runRenderAndOcrPipeline: (context: RenderPipelineContext) => Promise<void>

  // 公开内部方法（供协调函数使用）
  upsertPaper: (paper: PaperDocument) => void
  updatePaperInList: (paperId: string, updates: Partial<PaperDocument>) => void
  loadPapersList: () => Promise<PaperDocument[]>
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePaperListStore = create<PaperListState>()((set, get) => {
  // 非响应式闭包状态
  const activePipelines = new Set<string>()
  const pipelineControls = new Map<string, PipelineControl>()
  let ocrProgressCleanup: (() => void) | null = null

  // -------------------------------------------------------------------------
  // 内部辅助
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

  return {
    papers: [] as PaperDocument[],
    currentPaperId: null as string | null,
    markdownContent: '',
    markdownPaperId: null as string | null,
    markdownLoading: false,
    renderProgressByPaperId: {} as Record<string, RenderingProgress>,
    ocrProgressByPaperId: {} as Record<string, OcrProgressInfo>,

    // -----------------------------------------------------------------------
    // Getters
    // -----------------------------------------------------------------------

    currentPaper: () => {
      const s = get()
      return s.papers.find((paper) => paper.id === s.currentPaperId) || null
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

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    selectPaper: (paperId: string | null) => {
      set({ currentPaperId: paperId })
    },

    loadMarkdown: async (paperId: string): Promise<void> => {
      const paper = get().papers.find((item) => item.id === paperId)
      if (!paper || !isPaperReadableStatus(paper.status)) {
        set({ markdownContent: '', markdownPaperId: null, markdownLoading: false })
        return
      }

      set({ markdownLoading: true })
      try {
        const result = await window.api.paper.getReaderDocument(paperId)
        if (result.success && result.data) {
          set({ markdownContent: result.data.markdown, markdownPaperId: paperId })
        } else {
          set({ markdownContent: '', markdownPaperId: paperId })
        }
      } finally {
        set({ markdownLoading: false })
      }
    },

    updatePaperStatus: async (
      paperId: string,
      status: PaperStatus,
      errorMessage?: string
    ): Promise<void> => {
      const result = await window.api.paper.updateStatus({ paperId, status, errorMessage })
      if (!result.success) {
        throw new Error(result.error || '更新论文状态失败')
      }
      get().updatePaperInList(paperId, { status, errorMessage })
    },

    ensureOcrProgressListener: () => {
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

        get().updatePaperInList(progress.paperId, {
          status: statusMap[progress.status],
          completedPageCount: progress.completedPages,
          errorMessage: progress.errorMessage
        })
      })
    },

    ensurePaperProgressSnapshot: (paper: PaperDocument) => {
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
    },

    markPipelineDeleted: (paperId: string) => {
      const control = pipelineControls.get(paperId)
      if (control) {
        control.aborted = true
        control.deleted = true
        return
      }
      pipelineControls.set(paperId, { aborted: true, deleted: true })
    },

    clearRenderPipelineState: (paperId: string) => {
      const s = get()
      const nextRenderProgress = { ...s.renderProgressByPaperId }
      delete nextRenderProgress[paperId]

      const nextOcrProgress = { ...s.ocrProgressByPaperId }
      delete nextOcrProgress[paperId]

      set({
        renderProgressByPaperId: nextRenderProgress,
        ocrProgressByPaperId: nextOcrProgress
      })
    },

    runRenderAndOcrPipeline: async (context: RenderPipelineContext) => {
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

        get().updatePaperInList(paperId, {
          status: 'ocr_processing',
          errorMessage: undefined
        })

        setOcrProgress(createIdleOcrProgress(paperId, totalPages))

        const result = await window.api.paper.startOcr(paperId)
        if (!result.success) {
          throw new Error(result.error || 'OCR 启动失败')
        }

        if (!control.deleted) {
          await get().loadPapersList()
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
          await get().updatePaperStatus(paperId, 'failed', errorMessage)
        } catch {
          // 论文已删除或状态同步失败时，不覆盖首个渲染错误
        }
      } finally {
        rasterizer.dispose()
        activePipelines.delete(paperId)
        pipelineControls.delete(paperId)
      }
    },

    // -----------------------------------------------------------------------
    // 公开内部方法
    // -----------------------------------------------------------------------

    upsertPaper: (paper: PaperDocument) => {
      const s = get()
      const index = s.papers.findIndex((item) => item.id === paper.id)
      if (index >= 0) {
        const nextPapers = [...s.papers]
        nextPapers[index] = paper
        set({ papers: nextPapers })
        return
      }
      set({ papers: [paper, ...s.papers] })
    },

    updatePaperInList: (paperId: string, updates: Partial<PaperDocument>) => {
      const s = get()
      const index = s.papers.findIndex((paper) => paper.id === paperId)
      if (index < 0) return
      const nextPapers = [...s.papers]
      nextPapers[index] = { ...nextPapers[index], ...updates }
      set({ papers: nextPapers })
    },

    loadPapersList: async (): Promise<PaperDocument[]> => {
      get().ensureOcrProgressListener()

      const result = await window.api.paper.list()
      if (!result.success || !result.data) return []

      const papers = result.data
      set({ papers })

      for (const paper of papers) {
        get().ensurePaperProgressSnapshot(paper)
      }

      // 加载 OCR 处理中论文的进度
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

      return papers
    }
  }
})
