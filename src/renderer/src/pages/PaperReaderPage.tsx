import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { usePiniaStore } from '@renderer/composables/usePiniaStore'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperChatQuoteStore } from '@renderer/stores/paperChatQuoteStore'
import { useNotification } from '@renderer/composables/useNotification'
import { PaperQuoteContext } from '@renderer/contexts/PaperQuoteContext'
import type { PaperQuote } from '@shared/types/chat'
import styles from './PaperReaderPage.module.css'

import PaperMarkdownView, {
  type PaperMarkdownViewHandle
} from '@renderer/components/paper/PaperMarkdownView'
import PaperOriginalPdfView from '@renderer/components/paper/PaperOriginalPdfView'
import PaperFigurePreview from '@renderer/components/paper/PaperFigurePreview'
import PaperChatPanel from '@renderer/components/paper/chat/PaperChatPanel'

export default function PaperReaderPage() {
  const store = usePiniaStore(usePaperReaderStore)
  const paperChatPanelOpen = useUIStateStore((s) => s.paperChatPanelOpen)
  const setPaperChatPanelOpen = useUIStateStore((s) => s.setPaperChatPanelOpen)
  const paperChatPanelWidth = useUIStateStore((s) => s.paperChatPanelWidth)
  const setPaperChatPanelWidth = useUIStateStore((s) => s.setPaperChatPanelWidth)
  const lastPaperId = useUIStateStore((s) => s.lastPaperId)

  const paperChatQuoteStore = usePaperChatQuoteStore()
  const notify = useNotification()

  const [isResizingPaperChat, setIsResizingPaperChat] = useState(false)
  const markdownViewRef = useRef<PaperMarkdownViewHandle>(null)

  // Derive state from store (Pinia auto-unwraps refs in return type)
  const currentPaperId = store.currentPaperId ?? null
  const currentPaper = store.currentPaper ?? null
  const markdownContent = store.markdownContent ?? ''
  const markdownLoading = store.markdownLoading ?? false
  const isOcrCompleted = store.isOcrCompleted ?? false
  const paperBasePath = store.paperBasePath ?? null
  const currentAnnotations = store.currentAnnotations ?? []
  const currentReaderDocument = store.currentReaderDocument ?? null
  const originalPdfVisible = store.originalPdfVisible ?? false
  const translationVisible = store.translationVisible ?? false
  const currentTranslationCache = store.currentTranslationCache ?? null

  const isPaperChatPanelVisible =
    paperChatPanelOpen && Boolean(currentPaper) && isOcrCompleted

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

      const sessionResult = await store.ensurePaperChatSession(paperId)
      const sessionId = sessionResult.data
      if (!sessionResult.success || !sessionId) {
        notify.error('论文对话', sessionResult.error || '创建论文对话失败', { source: 'chat' })
        return
      }

      paperChatQuoteStore.addQuote(sessionId, quote)
      setPaperChatPanelOpen(true)
    },
    [currentPaper, store, paperChatQuoteStore, notify, setPaperChatPanelOpen]
  )

  // Chat panel resize
  const handlePaperChatResizeMove = useCallback(
    (event: PointerEvent) => {
      if (!isResizingPaperChat) {
        return
      }

      setPaperChatPanelWidth(window.innerWidth - event.clientX)
    },
    [isResizingPaperChat, setPaperChatPanelWidth]
  )

  const stopPaperChatResize = useCallback(() => {
    setIsResizingPaperChat(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', handlePaperChatResizeMove)
    window.removeEventListener('pointerup', stopPaperChatResize)
  }, [handlePaperChatResizeMove])

  const startPaperChatResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
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
    store.ensureOcrProgressListener()
    void store.loadPapers().then(() => {
      if (!store.currentPaperId && lastPaperId) {
        store.selectPaper(lastPaperId)
      }

      if (store.currentPaperId && store.isOcrCompleted) {
        void store.loadMarkdown(store.currentPaperId)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    const storeTranslationVisible = store.translationVisible
    if (!storeTranslationVisible) {
      void store.toggleTranslationVisible()
    }
  }, [markdownLoading, currentPaper, store])

  // Cleanup
  useEffect(() => {
    return () => {
      stopPaperChatResize()
      store.resetFigureUiState()
      store.hideOriginalPdf()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                  onClick={() => store.uploadAndRenderPdf()}
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
