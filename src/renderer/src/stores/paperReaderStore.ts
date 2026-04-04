// 论文阅读器 Store
// 管理 PDF 上传、逐页渲染、页图保存流程

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { PaperDocument, PaperStatus } from '@shared/types/paper'
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
 * 管理 PDF 上传 → 逐页渲染 → 页图落盘的完整流程
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

  /** 选中并打开论文（更新 lastOpenedAt） */
  async function openPaper(paperId: string): Promise<PaperDocument | null> {
    const result = await window.api.paper.get(paperId)
    if (result.success && result.data) {
      // 更新列表中的对应项
      const index = papers.value.findIndex((p) => p.id === paperId)
      if (index >= 0) {
        papers.value[index] = result.data
      }
      currentPaperId.value = paperId
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
   * 上传 PDF 并逐页渲染保存
   * 完整流程：选择文件 → 加载 PDF → 逐页渲染 → 保存页图 → 更新 meta
   */
  async function uploadAndRenderPdf(): Promise<{
    success: boolean
    paperId?: string
    error?: string
  }> {
    if (renderingProgress.value.stage !== 'idle') {
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
      const fileInfo = await window.api.paper.selectPdfFile()
      if (!fileInfo) {
        resetProgress()
        return { success: false, error: '未选择文件' }
      }

      // 2. 读取 PDF 文件为 ArrayBuffer
      renderingProgress.value.stage = 'loading'
      const response = await fetch(`file://${fileInfo.path}`)
      if (!response.ok) {
        throw new Error(`读取 PDF 文件失败: ${response.statusText}`)
      }
      const arrayBuffer = await response.arrayBuffer()

      // 3. 加载 PDF 获取页数
      const pageInfos = await rasterizer.loadPdf(arrayBuffer)
      const totalPageCount = pageInfos.length

      // 4. 创建论文记录
      const createResult = await window.api.paper.uploadPdf({
        sourcePdfPath: fileInfo.path,
        pageCount: totalPageCount
      })

      if (!createResult.success || !createResult.data) {
        rasterizer.dispose()
        throw new Error(createResult.error || '创建论文记录失败')
      }

      paperId = createResult.data.id

      // 5. 逐页渲染并保存
      renderingProgress.value = {
        currentPage: 0,
        totalPages: totalPageCount,
        completedPages: 0,
        stage: 'rendering'
      }

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
      }

      // 6. 恢复论文状态，等待后续 OCR 阶段继续推进
      await updatePaperStatus(paperId, 'draft')

      // 7. 清理资源并更新前端进度
      rasterizer.dispose()
      renderingProgress.value.stage = 'completed'

      // 刷新论文列表并选中新论文
      await loadPapers()
      currentPaperId.value = paperId

      return { success: true, paperId }
    } catch (error) {
      rasterizer.dispose()
      const errorMessage = error instanceof Error ? error.message : String(error)

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
    // Getters
    currentPaper,
    progressPercent,
    // Actions
    loadPapers,
    selectPaper,
    openPaper,
    deletePaper,
    uploadAndRenderPdf,
    cancelRendering,
    resetProgress
  }
})
