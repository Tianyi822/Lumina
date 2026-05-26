import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperChatQuoteStore } from '@renderer/stores/paperChatQuoteStore'
import { useNotification } from '@renderer/composables/useNotification'
import { PaperQuoteContext } from '@renderer/contexts/PaperQuoteContext'
import type { PaperAnnotation } from '@shared/types/paper'
import type { PaperQuote } from '@shared/types/chat'
import styles from './PaperReaderPage.module.css'

import PaperMarkdownView, {
  type PaperMarkdownViewHandle
} from '@renderer/components/paper/PaperMarkdownView'
import PaperOriginalPdfView from '@renderer/components/paper/PaperOriginalPdfView'
import PaperFigurePreview from '@renderer/components/paper/PaperFigurePreview'
import PaperChatPanel from '@renderer/components/paper/chat/PaperChatPanel'

const PAPER_CHAT_PANEL_MIN_WIDTH = 340
const PAPER_CHAT_PANEL_MAX_WIDTH = 680
const EMPTY_PAPER_ANNOTATIONS: PaperAnnotation[] = []

function clampPaperChatPanelWidth(value: number): number {
  const maxWidth =
    typeof window === 'undefined'
      ? PAPER_CHAT_PANEL_MAX_WIDTH
      : Math.min(PAPER_CHAT_PANEL_MAX_WIDTH, window.innerWidth)
  return Math.min(Math.max(Math.round(value), PAPER_CHAT_PANEL_MIN_WIDTH), maxWidth)
}

export default function PaperReaderPage() {
  const currentPaperId = usePaperReaderStore((state) => state.currentPaperId ?? null)
  const currentPaper = usePaperReaderStore((state) => state.currentPaper() ?? null)
  const markdownContent = usePaperReaderStore((state) => state.markdownContent ?? '')
  const markdownLoading = usePaperReaderStore((state) => state.markdownLoading ?? false)
  const isOcrCompleted = usePaperReaderStore((state) => state.isOcrCompleted() ?? false)
  const paperBasePath = usePaperReaderStore((state) => state.paperBasePath() ?? null)
  const currentAnnotations = usePaperReaderStore((state) => {
    if (!state.currentPaperId) return EMPTY_PAPER_ANNOTATIONS
    return state.annotationsByPaperId[state.currentPaperId] ?? EMPTY_PAPER_ANNOTATIONS
  })
  const currentReaderDocument = usePaperReaderStore(
    (state) => state.currentReaderDocument() ?? null
  )
  const originalPdfVisible = usePaperReaderStore((state) => state.originalPdfVisible ?? false)
  const translationVisible = usePaperReaderStore((state) => state.translationVisible ?? false)
  const currentTranslationCache = usePaperReaderStore(
    (state) => state.currentTranslationCache() ?? null
  )
  const ensureOcrProgressListener = usePaperReaderStore((state) => state.ensureOcrProgressListener)
  const loadPapers = usePaperReaderStore((state) => state.loadPapers)
  const selectPaper = usePaperReaderStore((state) => state.selectPaper)
  const uploadAndRenderPdf = usePaperReaderStore((state) => state.uploadAndRenderPdf)
  const loadMarkdown = usePaperReaderStore((state) => state.loadMarkdown)
  const ensurePaperChatSession = usePaperReaderStore((state) => state.ensurePaperChatSession)
  const toggleTranslationVisible = usePaperReaderStore((state) => state.toggleTranslationVisible)
  const resetFigureUiState = usePaperReaderStore((state) => state.resetFigureUiState)
  const hideOriginalPdf = usePaperReaderStore((state) => state.hideOriginalPdf)
  const paperChatPanelOpen = useUIStateStore((s) => s.paperChatPanelOpen)
  const setPaperChatPanelOpen = useUIStateStore((s) => s.setPaperChatPanelOpen)
  const paperChatPanelWidth = useUIStateStore((s) => s.paperChatPanelWidth)
  const setPaperChatPanelWidth = useUIStateStore((s) => s.setPaperChatPanelWidth)
  const lastPaperId = useUIStateStore((s) => s.lastPaperId)

  const addPaperChatQuote = usePaperChatQuoteStore((s) => s.addQuote)
  const notify = useNotification()

  const [isResizingPaperChat, setIsResizingPaperChat] = useState(false)
  const markdownViewRef = useRef<PaperMarkdownViewHandle>(null)
  const chatSlotRef = useRef<HTMLDivElement>(null)
  const isResizingPaperChatRef = useRef(false)
  const paperChatPanelWidthRef = useRef(paperChatPanelWidth)
  const pendingPaperChatWidthRef = useRef<number | null>(null)
  const paperChatResizeRafRef = useRef<number | null>(null)
  const lastPaperIdRef = useRef(lastPaperId)

  useEffect(() => {
    if (!isResizingPaperChatRef.current) {
      paperChatPanelWidthRef.current = paperChatPanelWidth
    }
  }, [paperChatPanelWidth])

  const isPaperChatPanelVisible = paperChatPanelOpen && Boolean(currentPaper) && isOcrCompleted

  // scrollToQuote implementation for PaperQuoteContext
  const scrollToQuote = useCallback((quote: PaperQuote) => {
    markdownViewRef.current?.scrollToQuoteAndHighlight(quote)
  }, [])

  const paperQuoteContextValue = useMemo(() => ({ scrollToQuote }), [scrollToQuote])

  // Handle add to chat
  const handleAddToChat = useCallback(
    async (quote: PaperQuote) => {
      const paperId = currentPaper?.id
      if (!paperId) {
        return
      }

      const sessionResult = await ensurePaperChatSession(paperId)
      const sessionId = sessionResult.data
      if (!sessionResult.success || !sessionId) {
        notify.error('论文对话', sessionResult.error || '创建论文对话失败', { source: 'chat' })
        return
      }

      addPaperChatQuote(sessionId, quote)
      setPaperChatPanelOpen(true)
    },
    [currentPaper, ensurePaperChatSession, addPaperChatQuote, notify, setPaperChatPanelOpen]
  )

  // Chat panel resize
  const applyPaperChatPanelWidth = useCallback((nextWidth: number) => {
    const width = clampPaperChatPanelWidth(nextWidth)
    paperChatPanelWidthRef.current = width
    pendingPaperChatWidthRef.current = width

    if (paperChatResizeRafRef.current !== null) {
      return
    }

    paperChatResizeRafRef.current = requestAnimationFrame(() => {
      paperChatResizeRafRef.current = null
      const pendingWidth = pendingPaperChatWidthRef.current
      pendingPaperChatWidthRef.current = null
      if (pendingWidth === null) {
        return
      }
      chatSlotRef.current?.style.setProperty('--paper-chat-panel-width', `${pendingWidth}px`)
    })
  }, [])

  const handlePaperChatResizeMove = useCallback(
    (event: PointerEvent) => {
      if (!isResizingPaperChatRef.current) {
        return
      }

      applyPaperChatPanelWidth(window.innerWidth - event.clientX)
    },
    [applyPaperChatPanelWidth]
  )

  const stopPaperChatResize = useCallback(() => {
    if (!isResizingPaperChatRef.current) {
      return
    }

    isResizingPaperChatRef.current = false
    setIsResizingPaperChat(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', handlePaperChatResizeMove)
    window.removeEventListener('pointerup', stopPaperChatResize)

    if (paperChatResizeRafRef.current !== null) {
      cancelAnimationFrame(paperChatResizeRafRef.current)
      paperChatResizeRafRef.current = null
    }
    pendingPaperChatWidthRef.current = null
    setPaperChatPanelWidth(paperChatPanelWidthRef.current)
  }, [handlePaperChatResizeMove, setPaperChatPanelWidth])

  const startPaperChatResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      isResizingPaperChatRef.current = true
      setIsResizingPaperChat(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', handlePaperChatResizeMove)
      window.addEventListener('pointerup', stopPaperChatResize)
      handlePaperChatResizeMove(event.nativeEvent)
    },
    [handlePaperChatResizeMove, stopPaperChatResize]
  )

  // Load papers on mount
  useEffect(() => {
    ensureOcrProgressListener()
    void loadPapers().then(() => {
      const state = usePaperReaderStore.getState()
      if (!state.currentPaperId && lastPaperIdRef.current) {
        selectPaper(lastPaperIdRef.current)
      }

      const nextState = usePaperReaderStore.getState()
      if (nextState.currentPaperId && nextState.isOcrCompleted()) {
        void loadMarkdown(nextState.currentPaperId)
      }
    })
  }, [ensureOcrProgressListener, loadPapers, selectPaper, loadMarkdown])

  // Close chat when paper changes to non-readable
  useEffect(() => {
    if (!currentPaperId || !isOcrCompleted) {
      setPaperChatPanelOpen(false)
    }
  }, [currentPaperId, isOcrCompleted, setPaperChatPanelOpen])

  // Auto-open translation on markdown load
  const wasMarkdownLoadingRef = useRef(markdownLoading)
  useEffect(() => {
    const wasLoading = wasMarkdownLoadingRef.current
    wasMarkdownLoadingRef.current = markdownLoading

    if (markdownLoading || !wasLoading) return

    const progress = currentPaper?.readingProgress
    if (!progress?.translationVisible) return

    if (!translationVisible) {
      void toggleTranslationVisible()
    }
  }, [markdownLoading, currentPaper, translationVisible, toggleTranslationVisible])

  // Cleanup
  useEffect(() => {
    return () => {
      stopPaperChatResize()
      resetFigureUiState()
      hideOriginalPdf()
    }
  }, [stopPaperChatResize, resetFigureUiState, hideOriginalPdf])

  // 视图切换时关闭钉住的图预览
  useEffect(() => {
    const unsubscribe = useUIStateStore.subscribe((state, prevState) => {
      if (prevState.currentView === 'paper' && state.currentView !== 'paper') {
        resetFigureUiState()
      }
    })
    return unsubscribe
  }, [resetFigureUiState])

  return (
    <PaperQuoteContext.Provider value={paperQuoteContextValue}>
      <div className={[styles.page, 'sm-workspace-view'].join(' ')}>
        <div
          className={[styles.main, isOcrCompleted ? styles.mainReader : '']
            .filter(Boolean)
            .join(' ')}
        >
          {!currentPaperId ? (
            <div className={styles.emptyState}>
              <div className={['sm-empty', styles.emptyCard].join(' ')}>
                <h2>选择一篇论文开始阅读</h2>
                <p>从左侧列表中选择已有文献，或直接上传 PDF 开始阅读。</p>
                <button
                  className="sm-button sm-button--primary"
                  type="button"
                  onClick={() => uploadAndRenderPdf()}
                >
                  上传 PDF
                </button>
              </div>
            </div>
          ) : isOcrCompleted && originalPdfVisible && currentPaper ? (
            <PaperOriginalPdfView
              paperId={currentPaperId || ''}
              pageAssets={currentPaper.pageAssets}
              pageCount={currentPaper.pageCount}
            />
          ) : isOcrCompleted ? (
            <PaperMarkdownView
              ref={markdownViewRef}
              content={markdownContent}
              loading={markdownLoading}
              paperId={currentPaperId || ''}
              basePath={paperBasePath || undefined}
              annotations={currentAnnotations}
              readerDocument={currentReaderDocument}
              translationVisible={translationVisible}
              translationCache={currentTranslationCache}
              readingProgress={currentPaper?.readingProgress}
              onAddToChat={handleAddToChat}
            />
          ) : null}
        </div>

        <div
          ref={chatSlotRef}
          className={[
            styles.chatSlot,
            isPaperChatPanelVisible ? styles.chatSlotOpen : '',
            isResizingPaperChat ? styles.chatSlotResizing : ''
          ]
            .filter(Boolean)
            .join(' ')}
          style={
            {
              '--paper-chat-panel-width': `${paperChatPanelWidth}px`
            } as React.CSSProperties
          }
        >
          {isPaperChatPanelVisible && currentPaper && (
            <aside className={styles.chat}>
              <div
                className={styles.chatResize}
                role="separator"
                aria-orientation="vertical"
                title="拖拽调整聊天窗口宽度"
                onPointerDown={startPaperChatResize}
              />
              <PaperChatPanel paper={currentPaper} />
            </aside>
          )}
        </div>

        <PaperFigurePreview />
      </div>
    </PaperQuoteContext.Provider>
  )
}
