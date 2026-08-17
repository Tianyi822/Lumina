import type { PaperDocument } from '@shared/types/paper'
import { notifyWarning } from '@renderer/composables/notificationCore'
import { usePdfPageRasterizer } from '@renderer/composables/usePdfPageRasterizer'
import { i18n } from '@renderer/i18n'
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

const OCR_QUALITY_NOTICE_STORAGE_PREFIX = 'lumina-paper-ocr-quality-notice:'
const shownOcrQualityNoticePaperIds = new Set<string>()

interface UploadPdfFileInfo {
  path: string
  name: string
  size: number
}

// ---------------------------------------------------------------------------
// 跨 Store 协调函数
// ---------------------------------------------------------------------------

/** 重置阅读器视图状态（跨多个子 Store） */
function resetReaderViewState(): void {
  usePaperViewStore.getState().clearPaperToc()
  usePaperViewStore.getState().hideOriginalPdf()
  usePaperTranslationStore.getState().hideTranslation()
  usePaperFigureStore.getState().resetFigureUiState()
}

/** 清除论文全部状态（跨多个子 Store） */
function clearPaperState(paperId: string): void {
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

function getOcrQualityNoticeStorageKey(paperId: string): string {
  return `${OCR_QUALITY_NOTICE_STORAGE_PREFIX}${paperId}`
}

function hasShownOcrQualityNotice(paperId: string): boolean {
  if (shownOcrQualityNoticePaperIds.has(paperId)) return true
  if (typeof window === 'undefined') return false

  try {
    const hasStoredNotice =
      window.localStorage.getItem(getOcrQualityNoticeStorageKey(paperId)) === '1'
    if (hasStoredNotice) {
      shownOcrQualityNoticePaperIds.add(paperId)
    }
    return hasStoredNotice
  } catch {
    return false
  }
}

function markOcrQualityNoticeShown(paperId: string): void {
  shownOcrQualityNoticePaperIds.add(paperId)
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(getOcrQualityNoticeStorageKey(paperId), '1')
  } catch {
    // 本地存储不可用时，保留本次会话内的提示状态即可。
  }
}

function maybeShowOcrQualityNotice(paper: PaperDocument): void {
  if (!isPaperReadableStatus(paper.status) || hasShownOcrQualityNotice(paper.id)) return

  markOcrQualityNoticeShown(paper.id)
  notifyWarning(
    i18n.t('notifications.paper.ocrDisclaimerTitle'),
    i18n.t('notifications.paper.ocrDisclaimerMessage'),
    {
      source: 'paper',
      duration: 10000,
      dedupeKey: `paper-ocr-quality-notice:${paper.id}`
    }
  )
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
    if (prevId) {
      usePaperViewStore.getState().notifyBeforePaperLeave()
    }
    resetReaderViewState()
  }

  listStore.selectPaper(paperId)
  useUIStateStore.getState().setLastPaperId(paperId)

  // 加载 markdown 及其依赖（翻译 + 批注）
  await loadMarkdownWithDeps(paperId)
  maybeShowOcrQualityNotice(result.data)

  return result.data
}

/** 删除论文 — 原 deletePaper */
export async function deletePaper(paperId: string): Promise<boolean> {
  const listStore = usePaperListStore.getState()
  const targetPaper = listStore.papers.find((paper) => paper.id === paperId)
  listStore.markPipelineDeleted(paperId)
  listStore.skipOcrQueue(paperId)
  await window.api.paper.cancelOcr(paperId)

  const result = await window.api.paper.delete(paperId)
  if (!result.success) return false

  if (targetPaper?.chatSessionId) {
    void window.api.session.delete(targetPaper.chatSessionId)
  }

  // 从列表中移除
  const papers = usePaperListStore.getState().papers.filter((paper) => paper.id !== paperId)
  usePaperListStore.setState({ papers })

  clearPaperState(paperId)

  if (listStore.currentPaperId === paperId) {
    usePaperListStore.getState().selectPaper(null)
    usePaperListStore.setState({ markdownContent: '', markdownPaperId: null })
    useUIStateStore.getState().setLastPaperId(null)
    resetReaderViewState()
  }

  return true
}

/** 初始化单篇论文的上传进度并启动渲染管线 */
async function startPaperUploadPipeline(
  fileInfo: UploadPdfFileInfo
): Promise<{ success: boolean; paperId?: string; error?: string }> {
  const listStore = usePaperListStore.getState()
  let rasterizer: ReturnType<typeof usePdfPageRasterizer> | null = null

  try {
    const fileResult = await window.api.paper.readFileAsBase64(fileInfo.path)
    if (!fileResult.success || !fileResult.data) {
      throw new Error(fileResult.error || `读取 PDF 文件失败: ${fileInfo.name}`)
    }

    rasterizer = usePdfPageRasterizer()
    const pageInfos = await rasterizer.loadPdf(decodeBase64ToArrayBuffer(fileResult.data))
    const totalPageCount = pageInfos.length

    const createResult = await window.api.paper.uploadPdf({
      sourcePdfPath: fileInfo.path,
      pageCount: totalPageCount
    })
    if (!createResult.success || !createResult.data) {
      throw new Error(createResult.error || `创建论文记录失败: ${fileInfo.name}`)
    }

    const newPaperId = createResult.data.id
    listStore.upsertPaper({
      ...createResult.data,
      status: 'rendering',
      errorMessage: undefined
    })

    listStore.registerPaperForOcr(newPaperId)
    listStore.clearRenderPipelineState(newPaperId)
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

    void listStore.runRenderAndOcrPipeline({
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

/** 批量上传并渲染 PDF */
async function uploadAndRenderPdfs(): Promise<{
  success: boolean
  paperIds?: string[]
  error?: string
}> {
  usePaperListStore.getState().ensureOcrProgressListener()

  const selection = await window.api.paper.selectPdfFiles()
  if (!selection.success) {
    if (selection.error) {
      return { success: false, error: selection.error }
    }
    return { success: false, error: i18n.t('notifications.paper.noFileSelected') }
  }

  const files = selection.data ?? []
  if (files.length === 0) {
    return { success: false, error: i18n.t('notifications.paper.noFileSelected') }
  }

  const paperIds: string[] = []
  const errors: string[] = []

  for (const fileInfo of files) {
    const result = await startPaperUploadPipeline(fileInfo)
    if (result.success && result.paperId) {
      paperIds.push(result.paperId)
      continue
    }
    if (result.error) {
      errors.push(result.error)
    }
  }

  if (errors.length > 0) {
    const failureDetail =
      errors.length > 3
        ? `${errors.slice(0, 3).join('\n')}${i18n.t('notifications.paper.partialUploadSuffix', { count: errors.length })}`
        : errors.slice(0, 3).join('\n')
    notifyWarning(i18n.t('notifications.paper.partialUploadTitle'), failureDetail, {
      source: 'paper',
      duration: 10000
    })
  }

  if (paperIds.length === 0) {
    return {
      success: false,
      error: errors[0] || i18n.t('notifications.paper.uploadFailed')
    }
  }

  return { success: true, paperIds }
}

/** 上传并渲染 — 原 uploadAndRenderPdf */
export async function uploadAndRenderPdf(): Promise<{
  success: boolean
  paperId?: string
  error?: string
}> {
  const result = await uploadAndRenderPdfs()
  if (!result.success) {
    return { success: false, error: result.error }
  }

  return {
    success: true,
    paperId: result.paperIds?.[0]
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
    usePaperListStore.setState({ markdownContent: '', markdownPaperId: null })
    resetReaderViewState()
  }

  if (currentId && !selectedPaper) {
    listStore.selectPaper(null)
    usePaperListStore.setState({ markdownContent: '', markdownPaperId: null })
    resetReaderViewState()
  }
}

/** 重试论文 — 原 retryPaper */
export async function retryPaper(paperId: string): Promise<{ success: boolean; error?: string }> {
  usePaperListStore.getState().ensureOcrProgressListener()
  const listStore = usePaperListStore.getState()

  // 检查是否有活跃的渲染管线（渲染进程侧状态）
  const renderProgress = listStore.renderProgressByPaperId[paperId]
  if (renderProgress?.stage === 'rendering') {
    return { success: false, error: i18n.t('notifications.paper.processingRetryLater') }
  }

  // 检查主进程 OCR 管道是否活跃（IPC 确认，不受页面刷新影响）
  const ocrActiveResult = await window.api.paper.isOcrActive(paperId)
  if (ocrActiveResult.success && ocrActiveResult.data) {
    return { success: false, error: i18n.t('notifications.paper.processingRetryLater') }
  }

  const paper = listStore.papers.find((item) => item.id === paperId)
  if (!paper) {
    return { success: false, error: i18n.t('notifications.paper.paperMissing') }
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

      listStore.registerPaperForOcr(paperId)

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
          status: 'queued'
        }
      }
    }))

    listStore.requeuePaperForOcr(paperId)
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
    return { success: false, error: i18n.t('notifications.paper.noOpenPaper') }
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
async function loadMarkdownWithDeps(paperId: string): Promise<void> {
  const listStore = usePaperListStore.getState()
  const paper = listStore.papers.find((item) => item.id === paperId)

  if (!paper || !isPaperReadableStatus(paper.status)) {
    usePaperListStore.setState({
      markdownContent: '',
      markdownPaperId: null,
      markdownLoading: false
    })
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
  usePaperListStore.setState({ markdownLoading: true })

  try {
    // 加载 reader document 和 markdown
    const readerDocument = await usePaperAnnotationStore.getState().loadReaderDocument(paperId)
    if (usePaperListStore.getState().currentPaperId !== paperId) {
      return
    }

    if (readerDocument) {
      usePaperListStore.setState({
        markdownContent: readerDocument.markdown,
        markdownPaperId: paperId
      })
      // 翻译与批注后台加载，不阻塞 markdown 首屏渲染
      void usePaperTranslationStore.getState().loadTranslationState(paperId)
      void usePaperAnnotationStore.getState().loadAnnotations(paperId)
    } else {
      usePaperListStore.setState({ markdownContent: '', markdownPaperId: paperId })
      usePaperTranslationStore.getState().setTranslationCache(paperId, null)
      usePaperTranslationStore.getState().setTranslationTaskState(paperId, {
        isRunning: false,
        completedSegments: 0,
        totalSegments: 0
      })
      usePaperTranslationStore.getState().setHasTranslationState(paperId, false)
      usePaperAnnotationStore.getState().setAnnotations(paperId, [])
    }
  } finally {
    if (usePaperListStore.getState().currentPaperId === paperId) {
      usePaperListStore.setState({ markdownLoading: false })
    }
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
          return {
            success: false,
            error: paperResult.error || i18n.t('notifications.paper.paperMissing')
          }
        }
        paper = paperResult.data
        usePaperListStore.getState().upsertPaper(paper)
      }

      if (!isPaperReadableStatus(paper.status)) {
        return { success: false, error: i18n.t('notifications.paper.ocrNotDone') }
      }

      if (paper.chatSessionId) {
        const existingSession = await window.api.session.load(paper.chatSessionId)
        if (existingSession.success && existingSession.data) {
          return { success: true, data: existingSession.data.sessionId }
        }
      }

      const title = i18n.t('paper.chat.sessionTitle', { name: paper.fileName })
      const createdSession = await window.api.session.create(title, 'paper')
      if (!createdSession.success || !createdSession.data) {
        return {
          success: false,
          error: createdSession.error || i18n.t('notifications.paper.createSessionFailed')
        }
      }
      const bindResult = await setPaperChatSession(paper.id, createdSession.data.sessionId)
      if (!bindResult.success) {
        return {
          success: false,
          error: bindResult.error || i18n.t('notifications.paper.bindSessionFailed')
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
async function setPaperChatSession(
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
