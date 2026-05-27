import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperListStore } from '@renderer/stores/paper'
import { usePaperTranslationStore } from '@renderer/stores/paper'
import { usePaperFigureStore } from '@renderer/stores/paper'
import { usePaperViewStore } from '@renderer/stores/paper'
import { toggleTranslationVisible } from '@renderer/stores/paper'
import type { PaperFigureItem, PaperTocEntry } from '@shared/types/paper'
import {
  buildFigureCaptionTranslationMap,
  hasPaperTranslationResult
} from '@shared/utils/paperTranslation'
import styles from './WorkspaceToolbar.module.css'
import ZoomControls from './toolbar/ZoomControls'
import TranslationToggleButton from './toolbar/TranslationToggleButton'
import TocPanel from './toolbar/TocPanel'
import FigurePanel from './toolbar/FigurePanel'
import OriginalPdfButton from './toolbar/OriginalPdfButton'
import PaperChatButton from './toolbar/PaperChatButton'

const EMPTY_PAPER_FIGURES: PaperFigureItem[] = []
const EMPTY_FIGURE_TRANSLATION_MAP: Record<string, string> = {}

export default function WorkspaceToolbar() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const paperChatPanelOpen = useUIStateStore((s) => s.paperChatPanelOpen)
  const togglePaperChatPanel = useUIStateStore((s) => s.togglePaperChatPanel)
  const currentPaperId = usePaperListStore((s) => s.currentPaperId)
  const isOcrCompleted = usePaperListStore((s) => s.isOcrCompleted())
  const markdownLoading = usePaperListStore((s) => s.markdownLoading)

  const paperTocTitle = usePaperViewStore((s) => s.paperTocTitle)
  const paperTocItems = usePaperViewStore((s) => s.paperTocItems)
  const originalPdfVisible = usePaperViewStore((s) => s.originalPdfVisible)
  const canZoomIn = usePaperViewStore((s) => s.canZoomIn())
  const canZoomOut = usePaperViewStore((s) => s.canZoomOut())
  const zoomPercent = usePaperViewStore((s) => s.zoomPercent)
  const toggleOriginalPdfVisible = usePaperViewStore((s) => s.toggleOriginalPdfVisible)
  const scrollToHeading = usePaperViewStore((s) => s.scrollToHeading)
  const zoomOut = usePaperViewStore((s) => s.zoomOut)
  const resetZoom = usePaperViewStore((s) => s.resetZoom)
  const zoomIn = usePaperViewStore((s) => s.zoomIn)

  const figuresByPaperId = usePaperFigureStore((s) => s.figuresByPaperId)
  const figureLoadingByPaperId = usePaperFigureStore((s) => s.figureLoadingByPaperId)
  const showFigurePanel = usePaperFigureStore((s) => s.showFigurePanel)
  const closeFigurePanelAction = usePaperFigureStore((s) => s.closeFigurePanel)
  const closeFigurePreview = usePaperFigureStore((s) => s.closeFigurePreview)
  const toggleFigurePanel = usePaperFigureStore((s) => s.toggleFigurePanel)
  const openFigurePreview = usePaperFigureStore((s) => s.openFigurePreview)

  const translationByPaperId = usePaperTranslationStore((s) => s.translationByPaperId)
  const isCurrentPaperTranslating = usePaperTranslationStore((s) => s.isCurrentPaperTranslating())
  const translationVisible = usePaperTranslationStore((s) => s.translationVisible)

  const tocContainerRef = useRef<HTMLDivElement>(null)
  const figureContainerRef = useRef<HTMLDivElement>(null)
  const figurePanelRef = useRef<HTMLDivElement>(null)
  const [showTocPanel, setShowTocPanel] = useState(false)

  const currentPaperFigures = useMemo<PaperFigureItem[]>(
    () =>
      currentPaperId
        ? figuresByPaperId[currentPaperId] || EMPTY_PAPER_FIGURES
        : EMPTY_PAPER_FIGURES,
    [currentPaperId, figuresByPaperId]
  )
  const currentTranslationCache = useMemo(
    () => (currentPaperId ? translationByPaperId[currentPaperId] || null : null),
    [currentPaperId, translationByPaperId]
  )
  const figureCaptionTranslationMap = useMemo<Record<string, string>>(
    () =>
      currentTranslationCache
        ? buildFigureCaptionTranslationMap(currentTranslationCache)
        : EMPTY_FIGURE_TRANSLATION_MAP,
    [currentTranslationCache]
  )

  const isPaperView = currentView === 'paper'
  const isKnowledgeView = currentView === 'knowledge'
  const isPaperToolbar = isPaperView && Boolean(currentPaperId)
  const isKnowledgeToolbar = isKnowledgeView
  const canOpenToc = Boolean(currentPaperId)
  const canOpenFigurePanel = Boolean(currentPaperId)
  const canOpenPaperChat = Boolean(currentPaperId && isOcrCompleted)
  const hasTranslationCache = hasPaperTranslationResult(currentTranslationCache)
  const currentFigureLoading = currentPaperId
    ? Boolean(figureLoadingByPaperId[currentPaperId])
    : false
  const hasAnyTocEntries = Boolean(paperTocTitle) || paperTocItems.length > 0

  const translationButtonTitle = useMemo(() => {
    if (translationVisible) {
      return isCurrentPaperTranslating ? '隐藏译文（后台继续翻译）' : '隐藏译文'
    }

    if (hasTranslationCache) {
      return isCurrentPaperTranslating ? '显示译文（后台正在翻译）' : '显示译文'
    }

    return isCurrentPaperTranslating ? '显示译文（后台正在翻译）' : '翻译论文'
  }, [hasTranslationCache, isCurrentPaperTranslating, translationVisible])

  const closeTocPanel = useCallback((): void => {
    setShowTocPanel(false)
  }, [])

  const closeFigurePanel = useCallback((): void => {
    closeFigurePanelAction()
  }, [closeFigurePanelAction])

  const handleToggleOriginalPdf = useCallback((): void => {
    if (!currentPaperId) {
      return
    }

    closeTocPanel()
    closeFigurePanel()
    closeFigurePreview()
    toggleOriginalPdfVisible()
  }, [
    closeFigurePanel,
    closeFigurePreview,
    closeTocPanel,
    currentPaperId,
    toggleOriginalPdfVisible
  ])

  const handleToggleTranslation = useCallback(async (): Promise<void> => {
    if (!currentPaperId) {
      return
    }

    closeTocPanel()
    closeFigurePanel()
    await toggleTranslationVisible()
  }, [closeFigurePanel, closeTocPanel, currentPaperId, toggleTranslationVisible])

  const handleToggleToc = useCallback((): void => {
    if (!canOpenToc) {
      return
    }

    closeFigurePanel()
    setShowTocPanel((value) => !value)
  }, [canOpenToc, closeFigurePanel])

  const handleToggleFigurePanel = useCallback(async (): Promise<void> => {
    if (!canOpenFigurePanel) {
      return
    }

    closeTocPanel()
    await toggleFigurePanel()
  }, [canOpenFigurePanel, closeTocPanel, toggleFigurePanel])

  const handleTogglePaperChat = useCallback((): void => {
    if (!canOpenPaperChat) {
      return
    }

    closeTocPanel()
    closeFigurePanel()
    togglePaperChatPanel()
  }, [canOpenPaperChat, closeFigurePanel, closeTocPanel, togglePaperChatPanel])

  const handleSelectTocItem = useCallback(
    (headingId: string): void => {
      if (scrollToHeading(headingId)) {
        closeTocPanel()
      }
    },
    [closeTocPanel, scrollToHeading]
  )

  const getFigureItemLabel = useCallback(
    (figure: PaperFigureItem): string => {
      if (translationVisible) {
        const translated = figureCaptionTranslationMap[figure.id]
        if (translated) return translated
      }
      return figure.caption || figure.subCaption || '暂无图注'
    },
    [figureCaptionTranslationMap, translationVisible]
  )

  const getTocEntryDisplayText = useCallback(
    (entry: PaperTocEntry): string => {
      if (translationVisible && entry.translatedText) {
        return entry.translatedText
      }
      return entry.text
    },
    [translationVisible]
  )

  const handlePreviewFigure = useCallback(
    (figure: PaperFigureItem): void => {
      const panelRect = figurePanelRef.current?.getBoundingClientRect()

      openFigurePreview(figure, {
        initialRect: panelRect
          ? {
              left: panelRect.left,
              top: panelRect.top,
              width: panelRect.width
            }
          : undefined
      })
    },
    [openFigurePreview]
  )

  const handleClickOutside = useCallback(
    (event: MouseEvent): void => {
      const target = event.target as Node

      if (showTocPanel && tocContainerRef.current && !tocContainerRef.current.contains(target)) {
        closeTocPanel()
      }

      if (
        showFigurePanel &&
        figureContainerRef.current &&
        !figureContainerRef.current.contains(target)
      ) {
        closeFigurePanel()
      }
    },
    [closeFigurePanel, closeTocPanel, showFigurePanel, showTocPanel]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }

      if (showTocPanel) {
        closeTocPanel()
      }

      if (showFigurePanel) {
        closeFigurePanel()
      }
    },
    [closeFigurePanel, closeTocPanel, showFigurePanel, showTocPanel]
  )

  useEffect(() => {
    if (!isPaperView) {
      closeTocPanel()
      closeFigurePanel()
    }
  }, [closeFigurePanel, closeTocPanel, isPaperView])

  useEffect(() => {
    closeTocPanel()
    closeFigurePanel()
  }, [closeFigurePanel, closeTocPanel, currentPaperId])

  useEffect(() => {
    if (markdownLoading) {
      closeTocPanel()
      closeFigurePanel()
    }
  }, [closeFigurePanel, closeTocPanel, markdownLoading])

  useEffect(() => {
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleClickOutside, handleKeyDown])

  return (
    <div
      className={[
        styles['sm-workspace-toolbar__controls'],
        isPaperToolbar && styles['sm-workspace-toolbar__controls--paper'],
        isKnowledgeToolbar &&
          !isPaperToolbar &&
          styles['sm-workspace-toolbar__controls--knowledge'],
        isPaperToolbar &&
          isCurrentSidebarCollapsed &&
          styles['sm-workspace-toolbar__controls--chrome-safe']
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isPaperView && currentPaperId && (
        <ZoomControls
          canZoomOut={canZoomOut}
          canZoomIn={canZoomIn}
          zoomPercent={zoomPercent}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
          onZoomIn={zoomIn}
        />
      )}

      {isPaperView && currentPaperId && !originalPdfVisible && (
        <TranslationToggleButton
          isActive={translationVisible}
          isPending={isCurrentPaperTranslating}
          title={translationButtonTitle}
          onToggle={() => {
            void handleToggleTranslation()
          }}
        />
      )}

      {isPaperView && currentPaperId && !originalPdfVisible && (
        <TocPanel
          showTocPanel={showTocPanel}
          onToggle={handleToggleToc}
          canOpenToc={canOpenToc}
          markdownLoading={markdownLoading}
          hasAnyTocEntries={hasAnyTocEntries}
          paperTocTitle={paperTocTitle}
          paperTocItems={paperTocItems}
          onSelectTocItem={handleSelectTocItem}
          getTocEntryDisplayText={getTocEntryDisplayText}
          containerRef={tocContainerRef}
        />
      )}

      {isPaperView && currentPaperId && !originalPdfVisible && (
        <FigurePanel
          showFigurePanel={showFigurePanel}
          onToggle={() => {
            void handleToggleFigurePanel()
          }}
          canOpenFigurePanel={canOpenFigurePanel}
          currentFigureLoading={currentFigureLoading}
          currentPaperFigures={currentPaperFigures}
          getFigureItemLabel={getFigureItemLabel}
          onPreviewFigure={handlePreviewFigure}
          containerRef={figureContainerRef}
          figurePanelRef={figurePanelRef}
        />
      )}

      {isPaperView && currentPaperId && (
        <OriginalPdfButton isActive={originalPdfVisible} onClick={handleToggleOriginalPdf} />
      )}

      {isPaperView && canOpenPaperChat && (
        <PaperChatButton
          isActive={paperChatPanelOpen}
          onClick={handleTogglePaperChat}
        />
      )}
    </div>
  )
}
