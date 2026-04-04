// 论文阅读器 Store
// 管理 PDF 上传、逐页渲染、OCR 识别、Markdown 阅读的完整流程

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { PaperDocument, PaperStatus, OcrProgressInfo } from '@shared/types/paper'
import { usePdfPageRasterizer } from '@renderer/composables/usePdfPageRasterizer'

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
 * 论文阅读器 Store
 * 管理 PDF 上传 → 逐页渲染 → OCR 识别 → Markdown 阅读的完整流程
 */
export const usePaperReaderStore = defineStore('paperReader', () => {
  // ==================== State ====================

  /** 论文列表 */
  const papers = ref<PaperDocument[]>([])

  /** 当前选中的论文 ID */
  const currentPaperId = ref<string | null>(null)

  /** 渲染进度 */
  const renderingProgress = ref<RenderingProgress>({
    currentPage: 0,
    totalPages: 0,
    completedPages: 0,
    stage: 'idle'
  })

  /** 是否正在渲染 */
  const isRendering = computed(() => renderingProgress.value.stage === 'rendering')

  /** OCR 实时进度 */
  const ocrProgress = ref<OcrProgressInfo | null>(null)

  /** Markdown 内容 */
  const markdownContent = ref<string>('')

  /** Markdown 加载状态 */
  const markdownLoading = ref(false)

  /** OCR 进度监听清理函数 */
  let ocrProgressCleanup: (() => void) | null = null

  /** 取消标记 */
  let abortRendering = false

  // PDF 渲染器实例
  const rasterizer = usePdfPageRasterizer()

  // ==================== Getters ====================

  /** 获取当前论文 */
  const currentPaper = computed<PaperDocument | null>(
    () => papers.value.find((p) => p.id === currentPaperId.value) || null
  )

  /** 渲染进度百分比 */
  const progressPercent = computed(() => {
    const { totalPages, completedPages } = renderingProgress.value
    if (totalPages === 0) return 0
    return Math.round((completedPages / totalPages) * 100)
  })

  /** 当前论文是否已完成 OCR（可阅读） */
  const isOcrCompleted = computed(() => {
    const p = currentPaper.value
    return p?.status === 'completed' || p?.status === 'partial_failed'
  })

  /** 当前论文是否正在进行 OCR */
  const isOcrProcessing = computed(() => {
    return (
      currentPaper.value?.status === 'ocr_processing' ||
      currentPaper.value?.status === 'rendering' ||
      ocrProgress.value?.status === 'processing'
    )
  })

  /** OCR 进度百分比 */
  const ocrProgressPercent = computed(() => {
    if (!ocrProgress.value || ocrProgress.value.totalPages === 0) return 0
    return Math.round((ocrProgress.value.completedPages / ocrProgress.value.totalPages) * 100)
  })

  /** 当前论文的数据目录基础路径（用于 Markdown 中图片的 file:// URL 解析） */
  const paperBasePath = computed(() => {
    const paper = currentPaper.value
    if (!paper?.filePath) return null
    // filePath 指向 source.pdf，论文目录为其父目录
    const lastSlash = paper.filePath.lastIndexOf('/')
    if (lastSlash < 0) return null
    return paper.filePath.substring(0, lastSlash)
  })

  // ==================== Actions ====================

  /** 加载论文列表 */
  async function loadPapers(): Promise<void> {
    const result = await window.api.paper.list()
    if (result.success && result.data) {
      papers.value = result.data
    }
  }

  /** 选择当前论文 */
  function selectPaper(paperId: string | null): void {
    currentPaperId.value = paperId
  }

  /**
   * 选中并打开论文（更新 lastOpenedAt）
   * 如果论文已完成 OCR，自动加载 Markdown
   */
  async function openPaper(paperId: string): Promise<PaperDocument | null> {
    const result = await window.api.paper.get(paperId)
    if (result.success && result.data) {
      // 更新列表中的对应项
      const index = papers.value.findIndex((p) => p.id === paperId)
      if (index >= 0) {
        papers.value[index] = result.data
      }
      currentPaperId.value = paperId

      // 已完成 OCR 时自动加载 Markdown
      if (result.data.status === 'completed' || result.data.status === 'partial_failed') {
        await loadMarkdown(paperId)
      }

      return result.data
    }
    return null
  }

  /** 删除论文 */
  async function deletePaper(paperId: string): Promise<boolean> {
    const result = await window.api.paper.delete(paperId)
    if (result.success) {
      papers.value = papers.value.filter((p) => p.id !== paperId)
      if (currentPaperId.value === paperId) {
        currentPaperId.value = null
        markdownContent.value = ''
      }
      return true
    }
    return false
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
  }

  /**
   * 启动 OCR 并注册进度监听
   * 先清理旧监听器，再注册新的进度回调，完成后刷新论文列表
   */
  async function startOcrWithProgress(
    paperId: string
  ): Promise<{ success: boolean; error?: string }> {
    // 清理旧监听器
    cleanupOcrListener()

    // 注册 OCR 进度回调
    ocrProgressCleanup = window.api.paper.onOcrProgress((progress) => {
      ocrProgress.value = progress

      // 同步 papers 列表中的 status
      const idx = papers.value.findIndex((p) => p.id === progress.paperId)
      if (idx >= 0) {
        const statusMap: Record<OcrProgressInfo['status'], PaperStatus> = {
          idle: 'draft',
          processing: 'ocr_processing',
          completed: 'completed',
          partial_failed: 'partial_failed',
          failed: 'failed',
          cancelled: 'draft'
        }
        papers.value[idx] = {
          ...papers.value[idx],
          status: statusMap[progress.status]
        }
      }
    })

    // 调用主进程启动 OCR
    const result = await window.api.paper.startOcr(paperId)
    if (result.success) {
      await loadPapers()
    }
    return result
  }

  /**
   * 加载合并后的 Markdown 内容
   */
  async function loadMarkdown(paperId: string): Promise<void> {
    markdownLoading.value = true
    try {
      const result = await window.api.paper.getMergedMd(paperId)
      if (result.success && result.data !== undefined) {
        markdownContent.value = result.data
      }
    } finally {
      markdownLoading.value = false
    }
  }

  /** 取消 OCR 任务 */
  async function cancelOcr(paperId: string): Promise<{ success: boolean }> {
    return window.api.paper.cancelOcr(paperId)
  }

  /** 重试失败的页面 */
  async function retryFailedPage(
    paperId: string,
    pageIndex: number
  ): Promise<{ success: boolean; error?: string }> {
    return window.api.paper.retryPage({ paperId, pageIndex })
  }

  /** 清理 OCR 进度监听器 */
  function cleanupOcrListener(): void {
    if (ocrProgressCleanup) {
      ocrProgressCleanup()
      ocrProgressCleanup = null
    }
    ocrProgress.value = null
  }

  /**
   * 上传 PDF 并逐页渲染保存
   * 完整流程：选择文件 → 加载 PDF → 逐页渲染 → 保存页图 → 更新 meta
   */
  async function uploadAndRenderPdf(): Promise<{
    success: boolean
    paperId?: string
    error?: string
  }> {
    window.api.logger.info('[PaperReaderStore] uploadAndRenderPdf 开始')
    if (renderingProgress.value.stage !== 'idle') {
      window.api.logger.warn('[PaperReaderStore] 当前已有渲染任务在进行中，拒绝重复调用')
      return { success: false, error: '当前正在进行渲染任务' }
    }

    abortRendering = false
    let paperId: string | undefined

    try {
      // 1. 选择 PDF 文件
      renderingProgress.value = {
        currentPage: 0,
        totalPages: 0,
        completedPages: 0,
        stage: 'selecting'
      }
      window.api.logger.info('[PaperReaderStore] 步骤1: 调用 selectPdfFile 打开文件选择器')
      const fileInfo = await window.api.paper.selectPdfFile()
      window.api.logger.info('[PaperReaderStore] selectPdfFile 返回', { fileInfo })
      if (!fileInfo) {
        resetProgress()
        return { success: false, error: '未选择文件' }
      }

      // 2. 读取 PDF 文件为 ArrayBuffer
      renderingProgress.value.stage = 'loading'
      window.api.logger.info('[PaperReaderStore] 步骤2: 读取 PDF 文件', { path: fileInfo.path })
      const fileResult = await window.api.paper.readFileAsBase64(fileInfo.path)
      if (!fileResult.success || !fileResult.data) {
        throw new Error(fileResult.error || '读取 PDF 文件失败')
      }
      // base64 → Uint8Array → ArrayBuffer（pdf.js 兼容格式）
      const binaryString = atob(fileResult.data)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const arrayBuffer = bytes.buffer as ArrayBuffer
      window.api.logger.info('[PaperReaderStore] PDF 文件读取完成', { size: arrayBuffer.byteLength })

      // 3. 加载 PDF 获取页数
      window.api.logger.info('[PaperReaderStore] 步骤3: 加载 PDF 解析页数')
      const pageInfos = await rasterizer.loadPdf(arrayBuffer)
      const totalPageCount = pageInfos.length
      window.api.logger.info('[PaperReaderStore] PDF 加载完成', { totalPageCount })

      // 4. 创建论文记录
      window.api.logger.info('[PaperReaderStore] 步骤4: 创建论文记录', { path: fileInfo.path, totalPageCount })
      const createResult = await window.api.paper.uploadPdf({
        sourcePdfPath: fileInfo.path,
        pageCount: totalPageCount
      })
      window.api.logger.info('[PaperReaderStore] uploadPdf 返回', { result: createResult })

      if (!createResult.success || !createResult.data) {
        rasterizer.dispose()
        throw new Error(createResult.error || '创建论文记录失败')
      }

      paperId = createResult.data.id
      window.api.logger.info('[PaperReaderStore] 论文记录已创建', { paperId })

      // 5. 逐页渲染并保存
      renderingProgress.value = {
        currentPage: 0,
        totalPages: totalPageCount,
        completedPages: 0,
        stage: 'rendering'
      }
      window.api.logger.info('[PaperReaderStore] 步骤5: 开始逐页渲染', { totalPageCount })

      for (let i = 0; i < totalPageCount; i++) {
        if (abortRendering) {
          throw new Error('渲染已取消')
        }

        renderingProgress.value.currentPage = i

        // 渲染单页
        const renderResult = await rasterizer.renderPage(i, 2.0)

        // 保存页图到主进程
        const saveResult = await window.api.paper.savePageImage({
          paperId,
          pageIndex: i,
          base64Data: renderResult.base64,
          imageWidth: renderResult.width,
          imageHeight: renderResult.height,
          sourceWidth: pageInfos[i]?.width,
          sourceHeight: pageInfos[i]?.height,
          renderScale: 2.0
        })

        if (!saveResult.success) {
          throw new Error(`保存第 ${i + 1} 页图片失败: ${saveResult.error}`)
        }

        renderingProgress.value.completedPages = i + 1
        window.api.logger.debug('[PaperReaderStore] 页面渲染完成', { pageIndex: i, total: totalPageCount })
      }

      // 6. 恢复论文状态，等待后续 OCR 阶段继续推进
      window.api.logger.info('[PaperReaderStore] 步骤6: 更新论文状态为 draft')
      await updatePaperStatus(paperId, 'draft')

      // 7. 清理资源并更新前端进度
      rasterizer.dispose()
      renderingProgress.value.stage = 'completed'

      // 刷新论文列表并选中新论文
      await loadPapers()
      currentPaperId.value = paperId

      window.api.logger.info('[PaperReaderStore] uploadAndRenderPdf 完成', { paperId })
      return { success: true, paperId }
    } catch (error) {
      rasterizer.dispose()
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('[PaperReaderStore] uploadAndRenderPdf 失败', { error: errorMessage })

      if (paperId) {
        try {
          await updatePaperStatus(paperId, 'failed', errorMessage)
        } catch {
          // 状态同步失败时保留原始渲染错误，避免覆盖首个失败原因
        }
      }

      renderingProgress.value.stage = 'failed'
      renderingProgress.value.error = errorMessage
      return { success: false, error: errorMessage, paperId }
    }
  }

  /** 取消当前渲染任务 */
  function cancelRendering(): void {
    abortRendering = true
  }

  /** 重置渲染进度 */
  function resetProgress(): void {
    renderingProgress.value = {
      currentPage: 0,
      totalPages: 0,
      completedPages: 0,
      stage: 'idle'
    }
    abortRendering = false
  }

  return {
    // State
    papers,
    currentPaperId,
    renderingProgress,
    isRendering,
    ocrProgress,
    markdownContent,
    markdownLoading,
    // Getters
    currentPaper,
    progressPercent,
    isOcrCompleted,
    isOcrProcessing,
    ocrProgressPercent,
    paperBasePath,
    // Actions
    loadPapers,
    selectPaper,
    openPaper,
    deletePaper,
    uploadAndRenderPdf,
    cancelRendering,
    resetProgress,
    startOcrWithProgress,
    loadMarkdown,
    cancelOcr,
    retryFailedPage,
    cleanupOcrListener
  }
})
