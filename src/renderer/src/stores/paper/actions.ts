import type { PaperDocument } from '@shared/types/paper'
import { usePdfPageRasterizer } from '@renderer/composables/usePdfPageRasterizer'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { isPaperReadableStatus, createIdleOcrProgress, decodeBase64ToArrayBuffer } from './shared'
import { usePaperListStore } from './usePaperListStore'
import { usePaperTranslationStore } from './usePaperTranslationStore'
import { usePaperFigureStore } from './usePaperFigureStore'
import { usePaperViewStore } from './usePaperViewStore'
import { usePaperAnnotationStore } from './usePaperAnnotationStore'

// ---------------------------------------------------------------------------
// 非响应式闭包状态
// ---------------------------------------------------------------------------

const pendingPaperChatSessionByPaperId = new Map<
  string,
  Promise<{ success: boolean; data?: string; error?: string }>
>()

// ---------------------------------------------------------------------------
// 跨 Store 协调函数
// ---------------------------------------------------------------------------

/** 重置阅读器视图状态（跨多个子 Store） */
export function resetReaderViewState(): void {
  usePaperViewStore.getState().clearPaperToc()
  usePaperViewStore.getState().hideOriginalPdf()
  usePaperTranslationStore.getState().hideTranslation()
  usePaperFigureStore.getState().resetFigureUiState()
}

/** 清除论文全部状态（跨多个子 Store） */
export function clearPaperState(paperId: string): void {
  usePaperListStore.getState().clearRenderPipelineState(paperId)
  usePaperFigureStore.getState().clearPaperFigureState(paperId)
  usePaperTranslationStore.getState().clearTranslationState(paperId)
  usePaperAnnotationStore.getState().clearAnnotationState(paperId)
  // 滚动位置在 ViewStore 内部 Map 中，也需要清理
  usePaperViewStore.getState().setMarkdownScrollPosition(paperId, { scrollTop: 0, scrollLeft: 0 })
  usePaperViewStore.getState().setOriginalPdfScrollPosition(paperId, {
    scrollTop: 0,
    scrollLeft: 0
  })
}

/** 打开论文 — 原 openPaper */
export async function openPaper(paperId: string): Promise<PaperDocument | null> {
  const listStore = usePaperListStore.getState()
  const localPaper = listStore.papers.find((paper) => paper.id === paperId)
  if (localPaper && !isPaperReadableStatus(localPaper.status)) return null

  const result = await window.api.paper.get(paperId)
  if (!result.success || !result.data) return null

  listStore.upsertPaper(result.data)
  listStore.ensurePaperProgressSnapshot(result.data)

  if (!isPaperReadableStatus(result.data.status)) return null

  const prevId = listStore.currentPaperId
  if (prevId !== paperId) {
    resetReaderViewState()
  }

  listStore.selectPaper(paperId)
  useUIStateStore.getState().setLastPaperId(paperId)

  // 加载 markdown 及其依赖（翻译 + 批注）
  await loadMarkdownWithDeps(paperId)

  return result.data
}

/** 删除论文 — 原 deletePaper */
export async function deletePaper(paperId: string): Promise<boolean> {
  const listStore = usePaperListStore.getState()
  const targetPaper = listStore.papers.find((paper) => paper.id === paperId)
  listStore.markPipelineDeleted(paperId)
  await window.api.paper.cancelOcr(paperId)

  const result = await window.api.paper.delete(paperId)
  if (!result.success) return false

  if (targetPaper?.chatSessionId) {
    void window.api.session.delete(targetPaper.chatSessionId)
  }

  usePaperListStore.getState().updatePaperInList(paperId, {} as PaperDocument)
  // 从列表中移除
  const papers = usePaperListStore.getState().papers.filter((paper) => paper.id !== paperId)
  usePaperListStore.setState({ papers })

  clearPaperState(paperId)

  if (listStore.currentPaperId === paperId) {
    usePaperListStore.getState().selectPaper(null)
    usePaperListStore.setState({ markdownContent: '' })
    useUIStateStore.getState().setLastPaperId(null)
    resetReaderViewState()
  }

  return true
}

/** 上传并渲染 — 原 uploadAndRenderPdf */
export async function uploadAndRenderPdf(): Promise<{
  success: boolean
  paperId?: string
  error?: string
}> {
  usePaperListStore.getState().ensureOcrProgressListener()

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
    usePaperListStore.getState().upsertPaper({
      ...createResult.data,
      status: 'rendering',
      errorMessage: undefined
    })

    usePaperListStore.getState().clearRenderPipelineState(newPaperId)
    // 设置渲染进度
    usePaperListStore.setState((s) => ({
      renderProgressByPaperId: {
        ...s.renderProgressByPaperId,
        [newPaperId]: {
          currentPage: 0,
          totalPages: totalPageCount,
          completedPages: 0,
          stage: 'rendering'
        }
      },
      ocrProgressByPaperId: {
        ...s.ocrProgressByPaperId,
        [newPaperId]: createIdleOcrProgress(newPaperId, totalPageCount)
      }
    }))

    void usePaperListStore.getState().runRenderAndOcrPipeline({
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

/** 加载论文列表 — 原 loadPapers（需要同时加载翻译状态和进度） */
export async function loadPapersWithState(): Promise<void> {
  const papers = await usePaperListStore.getState().loadPapersList()

  // 加载翻译状态
  await usePaperTranslationStore.getState().loadTranslationStatus(papers.map((p) => p.id))

  // 检查当前论文是否仍可读
  const listStore = usePaperListStore.getState()
  const currentId = listStore.currentPaperId
  const selectedPaper = currentId ? papers.find((paper) => paper.id === currentId) : null

  if (selectedPaper && !isPaperReadableStatus(selectedPaper.status)) {
    listStore.selectPaper(null)
    usePaperListStore.setState({ markdownContent: '' })
    resetReaderViewState()
  }

  if (currentId && !selectedPaper) {
    listStore.selectPaper(null)
    usePaperListStore.setState({ markdownContent: '' })
    resetReaderViewState()
  }
}

/** 重试论文 — 原 retryPaper */
export async function retryPaper(paperId: string): Promise<{ success: boolean; error?: string }> {
  usePaperListStore.getState().ensureOcrProgressListener()
  const listStore = usePaperListStore.getState()

  // 检查是否有活跃的渲染管线（通过 renderProgressByPaperId）
  const renderProgress = listStore.renderProgressByPaperId[paperId]
  if (renderProgress?.stage === 'rendering') {
    return { success: false, error: '论文正在处理中，请稍后再试' }
  }

  const paper = listStore.papers.find((item) => item.id === paperId)
  if (!paper) {
    return { success: false, error: '论文不存在' }
  }

  const totalPages = paper.pageCount
  const savedRenderedPages = Math.min(paper.pageAssets?.length || 0, totalPages)
  const hasIncomplete = savedRenderedPages < totalPages

  if (hasIncomplete || paper.status === 'failed') {
    try {
      const fileResult = await window.api.paper.readFileAsBase64(paper.filePath)
      if (!fileResult.success || !fileResult.data) {
        throw new Error(fileResult.error || '读取本地论文文件失败')
      }
      const rasterizer = usePdfPageRasterizer()
      const pageInfos = await rasterizer.loadPdf(decodeBase64ToArrayBuffer(fileResult.data))

      await listStore.updatePaperStatus(paperId, 'rendering')
      usePaperListStore.getState().updatePaperInList(paperId, { completedPageCount: 0 })

      usePaperListStore.setState((s) => ({
        renderProgressByPaperId: {
          ...s.renderProgressByPaperId,
          [paperId]: {
            currentPage: 0,
            totalPages: pageInfos.length,
            completedPages: 0,
            stage: 'rendering'
          }
        },
        ocrProgressByPaperId: {
          ...s.ocrProgressByPaperId,
          [paperId]: createIdleOcrProgress(paperId, pageInfos.length)
        }
      }))

      void usePaperListStore.getState().runRenderAndOcrPipeline({
        paperId,
        pageInfos,
        rasterizer
      })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }

  // 渲染已完成，仅重试 OCR
  try {
    const savedCompletedCount = paper.completedPageCount

    await listStore.updatePaperStatus(paperId, 'ocr_processing')
    usePaperListStore.getState().updatePaperInList(paperId, {
      completedPageCount: savedCompletedCount
    })

    usePaperListStore.setState((s) => ({
      renderProgressByPaperId: {
        ...s.renderProgressByPaperId,
        [paperId]: {
          currentPage: Math.max(totalPages - 1, 0),
          totalPages,
          completedPages: totalPages,
          stage: 'completed'
        }
      },
      ocrProgressByPaperId: {
        ...s.ocrProgressByPaperId,
        [paperId]: {
          paperId,
          currentPage: 0,
          totalPages,
          completedPages: savedCompletedCount,
          failedPages: [],
          status: 'processing'
        }
      }
    }))

    const result = await window.api.paper.startOcr(paperId)
    if (!result.success) {
      throw new Error(result.error || 'OCR 重试失败')
    }

    await loadPapersWithState()
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    usePaperListStore.setState((s) => ({
      ocrProgressByPaperId: {
        ...s.ocrProgressByPaperId,
        [paperId]: {
          ...(s.ocrProgressByPaperId[paperId] || createIdleOcrProgress(paperId, totalPages)),
          status: 'failed',
          errorMessage
        }
      }
    }))

    try {
      await usePaperListStore.getState().updatePaperStatus(paperId, 'failed', errorMessage)
    } catch {
      // 保留首次失败原因
    }

    return { success: false, error: errorMessage }
  }
}

/** 切换翻译 — 原 toggleTranslationVisible（需要检查 currentPaperId） */
export async function toggleTranslationVisible(): Promise<{
  success: boolean
  error?: string
}> {
  const currentPaperId = usePaperListStore.getState().currentPaperId
  if (!currentPaperId) {
    return { success: false, error: '当前没有打开论文' }
  }

  const translationStore = usePaperTranslationStore.getState()
  if (translationStore.translationVisible) {
    usePaperTranslationStore.setState({ translationVisible: false })
    return { success: true }
  }

  usePaperTranslationStore.setState({ translationVisible: true })
  const result = await translationStore.ensureTranslation(currentPaperId)
  if (!result.success) {
    usePaperTranslationStore.setState({ translationVisible: false })
    return result
  }

  return { success: true }
}

/** 加载 Markdown 及依赖 — 原 loadMarkdown 后续的翻译/批注加载 */
export async function loadMarkdownWithDeps(paperId: string): Promise<void> {
  const listStore = usePaperListStore.getState()
  const paper = listStore.papers.find((item) => item.id === paperId)

  if (!paper || !isPaperReadableStatus(paper.status)) {
    usePaperListStore.setState({ markdownContent: '' })
    usePaperViewStore.getState().clearPaperToc()
    usePaperTranslationStore.getState().setTranslationCache(paperId, null)
    usePaperTranslationStore.getState().setTranslationTaskState(paperId, {
      isRunning: false,
      completedSegments: 0,
      totalSegments: 0
    })
    usePaperTranslationStore.getState().setHasTranslationState(paperId, false)
    usePaperAnnotationStore.getState().setReaderDocument(paperId, null)
    usePaperAnnotationStore.getState().setAnnotations(paperId, [])
    return
  }

  usePaperViewStore.getState().clearPaperToc()

  // 加载 reader document 和 markdown
  const readerDocument = await usePaperAnnotationStore.getState().loadReaderDocument(paperId)
  if (readerDocument) {
    usePaperListStore.setState({ markdownContent: readerDocument.markdown })
    // 翻译缓存后台加载，不阻塞 markdown 内容渲染
    void usePaperTranslationStore.getState().loadTranslationState(paperId)
    await usePaperAnnotationStore.getState().loadAnnotations(paperId)
  } else {
    usePaperListStore.setState({ markdownContent: '' })
    usePaperViewStore.getState().clearPaperToc()
    usePaperTranslationStore.getState().setTranslationCache(paperId, null)
    usePaperTranslationStore.getState().setTranslationTaskState(paperId, {
      isRunning: false,
      completedSegments: 0,
      totalSegments: 0
    })
    usePaperTranslationStore.getState().setHasTranslationState(paperId, false)
    usePaperAnnotationStore.getState().setAnnotations(paperId, [])
  }
}

/** 聊天会话 — 原 ensurePaperChatSession */
export async function ensurePaperChatSession(
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
      let paper = usePaperListStore.getState().papers.find((item) => item.id === paperId) || null

      if (!paper) {
        const paperResult = await window.api.paper.get(paperId)
        if (!paperResult.success || !paperResult.data) {
          return { success: false, error: paperResult.error || '论文不存在' }
        }
        paper = paperResult.data
        usePaperListStore.getState().upsertPaper(paper)
      }

      if (!isPaperReadableStatus(paper.status)) {
        return { success: false, error: '论文尚未完成 OCR，无法创建对话' }
      }

      if (paper.chatSessionId) {
        const existingSession = await window.api.session.load(paper.chatSessionId)
        if (existingSession.success && existingSession.data) {
          return { success: true, data: existingSession.data.sessionId }
        }
      }

      const title = `论文对话：${paper.fileName}`
      const createdSession = await window.api.session.create(title, 'paper')
      if (!createdSession.success || !createdSession.data) {
        return {
          success: false,
          error: createdSession.error || '创建会话失败'
        }
      }
      const bindResult = await setPaperChatSession(paper.id, createdSession.data.sessionId)
      if (!bindResult.success) {
        return {
          success: false,
          error: bindResult.error || '绑定论文聊天会话失败'
        }
      }

      return { success: true, data: createdSession.data.sessionId }
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

/** 聊天会话 — 原 setPaperChatSession */
export async function setPaperChatSession(
  paperId: string,
  sessionId: string
): Promise<{ success: boolean; data?: PaperDocument; error?: string }> {
  const result = await window.api.paper.setChatSession({ paperId, sessionId })
  if (result.success && result.data) {
    usePaperListStore.getState().updatePaperInList(paperId, result.data)
  }
  return result
}

/** 重译段落并删除关联批注 — 原 retranslateSegmentWithAnnotation */
export async function retranslateSegment(
  paperId: string,
  segmentId: string,
  segmentStableId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await usePaperTranslationStore.getState().retranslateSegment(paperId, segmentId)
  if (!result.success) return result

  const paperAnnotations = usePaperAnnotationStore.getState().annotationsByPaperId[paperId] || []
  const annotationIdsToDelete = paperAnnotations
    .filter((ann) => ann.semanticAnchor.segmentStableId === segmentStableId)
    .map((ann) => ann.id)

  for (const id of annotationIdsToDelete) {
    await usePaperAnnotationStore.getState().deleteAnnotation(paperId, id)
  }

  return result
}
