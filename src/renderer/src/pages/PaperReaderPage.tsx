import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { usePaperListStore } from '@renderer/stores/paper'
import { usePaperTranslationStore } from '@renderer/stores/paper'
import { usePaperFigureStore } from '@renderer/stores/paper'
import { usePaperViewStore } from '@renderer/stores/paper'
import { usePaperAnnotationStore } from '@renderer/stores/paper'
import {
  openPaper,
  loadPapersWithState,
  ensurePaperChatSession,
  toggleTranslationVisible,
  uploadAndRenderPdf
} from '@renderer/stores/paper'
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
  const currentPaperId = usePaperListStore((state) => state.currentPaperId ?? null)
  const currentPaper = usePaperListStore((state) => state.currentPaper() ?? null)
  const markdownContent = usePaperListStore((state) => state.markdownContent ?? '')
  const markdownLoading = usePaperListStore((state) => state.markdownLoading ?? false)
  const isOcrCompleted = usePaperListStore((state) => state.isOcrCompleted() ?? false)
  const paperBasePath = usePaperListStore((state) => state.paperBasePath() ?? null)
  const ensureOcrProgressListener = usePaperListStore((state) => state.ensureOcrProgressListener)

  // 需要跨 Store 组合的派生值
  const annotationsByPaperId = usePaperAnnotationStore((state) => state.annotationsByPaperId)
  const currentAnnotations = useMemo(() => {
    if (!currentPaperId) return EMPTY_PAPER_ANNOTATIONS
    return annotationsByPaperId[currentPaperId] ?? EMPTY_PAPER_ANNOTATIONS
  }, [currentPaperId, annotationsByPaperId])

  const readerDocumentByPaperId = usePaperAnnotationStore((state) => state.readerDocumentByPaperId)
  const currentReaderDocument = useMemo(() => {
    if (!currentPaperId) return null
    return readerDocumentByPaperId[currentPaperId] ?? null
  }, [currentPaperId, readerDocumentByPaperId])

  const originalPdfVisible = usePaperViewStore((state) => state.originalPdfVisible ?? false)
  const translationVisible = usePaperTranslationStore((state) => state.translationVisible ?? false)

  const translationByPaperId = usePaperTranslationStore((state) => state.translationByPaperId)
  const currentTranslationCache = useMemo(() => {
    if (!currentPaperId) return null
    return translationByPaperId[currentPaperId] ?? null
  }, [currentPaperId, translationByPaperId])
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
    void loadPapersWithState().then(() => {
      const currentId = usePaperListStore.getState().currentPaperId
      if (!currentId && lastPaperIdRef.current) {
        void openPaper(lastPaperIdRef.current)
      }
    })
  }, [ensureOcrProgressListener])

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
      usePaperFigureStore.getState().resetFigureUiState()
      usePaperViewStore.getState().hideOriginalPdf()
    }
  }, [stopPaperChatResize])

  // 视图切换时关闭钉住的图预览
  useEffect(() => {
    const unsubscribe = useUIStateStore.subscribe((state, prevState) => {
      if (prevState.currentView === 'paper' && state.currentView !== 'paper') {
        usePaperFigureStore.getState().resetFigureUiState()
      }
    })
    return unsubscribe
  }, [])

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
