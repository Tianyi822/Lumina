import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { PaperFigureItem, PaperTocEntry, PaperTocItem } from '@shared/types/paper'
import {
  buildFigureCaptionTranslationMap,
  hasPaperTranslationResult
} from '@shared/utils/paperTranslation'
import styles from './WorkspaceToolbar.module.css'

interface PaperTocTreeNode {
  item: PaperTocItem
  children: PaperTocTreeNode[]
}

const EMPTY_PAPER_FIGURES: PaperFigureItem[] = []
const EMPTY_FIGURE_TRANSLATION_MAP: Record<string, string> = {}

export default function WorkspaceToolbar() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const paperChatPanelOpen = useUIStateStore((s) => s.paperChatPanelOpen)
  const togglePaperChatPanel = useUIStateStore((s) => s.togglePaperChatPanel)
  const currentPaperId = usePaperReaderStore((s) => s.currentPaperId)
  const paperTocTitle = usePaperReaderStore((s) => s.paperTocTitle)
  const paperTocItems = usePaperReaderStore((s) => s.paperTocItems)
  const figuresByPaperId = usePaperReaderStore((s) => s.figuresByPaperId)
  const figureLoadingByPaperId = usePaperReaderStore((s) => s.figureLoadingByPaperId)
  const translationByPaperId = usePaperReaderStore((s) => s.translationByPaperId)
  const isOcrCompleted = usePaperReaderStore((s) => s.isOcrCompleted())
  const isCurrentPaperTranslating = usePaperReaderStore((s) => s.isCurrentPaperTranslating())
  const markdownLoading = usePaperReaderStore((s) => s.markdownLoading)
  const originalPdfVisible = usePaperReaderStore((s) => s.originalPdfVisible)
  const showFigurePanel = usePaperReaderStore((s) => s.showFigurePanel)
  const translationVisible = usePaperReaderStore((s) => s.translationVisible)
  const canZoomIn = usePaperReaderStore((s) => s.canZoomIn())
  const canZoomOut = usePaperReaderStore((s) => s.canZoomOut())
  const zoomPercent = usePaperReaderStore((s) => s.zoomPercent)
  const closeFigurePanelAction = usePaperReaderStore((s) => s.closeFigurePanel)
  const closeFigurePreview = usePaperReaderStore((s) => s.closeFigurePreview)
  const toggleOriginalPdfVisible = usePaperReaderStore((s) => s.toggleOriginalPdfVisible)
  const toggleTranslationVisible = usePaperReaderStore((s) => s.toggleTranslationVisible)
  const toggleFigurePanel = usePaperReaderStore((s) => s.toggleFigurePanel)
  const scrollToHeading = usePaperReaderStore((s) => s.scrollToHeading)
  const openFigurePreview = usePaperReaderStore((s) => s.openFigurePreview)
  const zoomOut = usePaperReaderStore((s) => s.zoomOut)
  const resetZoom = usePaperReaderStore((s) => s.resetZoom)
  const zoomIn = usePaperReaderStore((s) => s.zoomIn)

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

  const paperTocTree = useMemo<PaperTocTreeNode[]>(() => {
    const roots: PaperTocTreeNode[] = []
    let currentLevel1: PaperTocTreeNode | null = null
    let currentLevel2: PaperTocTreeNode | null = null

    for (const item of paperTocItems) {
      const node: PaperTocTreeNode = {
        item,
        children: []
      }

      if (item.level === 1) {
        roots.push(node)
        currentLevel1 = node
        currentLevel2 = null
        continue
      }

      if (item.level === 2) {
        if (currentLevel1) {
          currentLevel1.children.push(node)
        } else {
          roots.push(node)
        }

        currentLevel2 = node
        continue
      }

      if (currentLevel2) {
        currentLevel2.children.push(node)
      } else if (currentLevel1) {
        currentLevel1.children.push(node)
      } else {
        roots.push(node)
      }
    }

    return roots
  }, [paperTocItems])

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

  function renderTocTree(nodes: PaperTocTreeNode[]): ReactNode {
    return nodes.map((node) => (
      <li key={node.item.id} className={styles['sm-workspace-toolbar__toc-node']}>
        <button
          className={[
            styles['sm-workspace-toolbar__toc-item'],
            styles[`sm-workspace-toolbar__toc-item--level-${node.item.level}`]
          ].join(' ')}
          title={getTocEntryDisplayText(node.item)}
          type="button"
          onClick={() => handleSelectTocItem(node.item.id)}
        >
          {getTocEntryDisplayText(node.item)}
        </button>

        {node.children.length > 0 && (
          <ul
            className={[
              styles['sm-workspace-toolbar__toc-list'],
              styles['sm-workspace-toolbar__toc-list--child']
            ].join(' ')}
          >
            {renderTocTree(node.children)}
          </ul>
        )}
      </li>
    ))
  }

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
        <>
          <button
            className={['sm-icon-button', styles['sm-workspace-toolbar__button']].join(' ')}
            title="缩小"
            aria-label="缩小"
            disabled={!canZoomOut}
            onClick={zoomOut}
          >
            <SvgIcon name="zoom-out" size={14} />
          </button>
          <button
            className={[
              'sm-icon-button',
              styles['sm-workspace-toolbar__button'],
              styles['sm-workspace-toolbar__zoom-display']
            ].join(' ')}
            title={`${zoomPercent}%`}
            aria-label="重置缩放"
            disabled={zoomPercent === 100}
            onClick={resetZoom}
          >
            <span className={styles['sm-workspace-toolbar__zoom-text']}>{zoomPercent}%</span>
          </button>
          <button
            className={['sm-icon-button', styles['sm-workspace-toolbar__button']].join(' ')}
            title="放大"
            aria-label="放大"
            disabled={!canZoomIn}
            onClick={zoomIn}
          >
            <SvgIcon name="zoom-in" size={14} />
          </button>
        </>
      )}

      {isPaperView && currentPaperId && !originalPdfVisible && (
        <button
          className={[
            'sm-icon-button',
            styles['sm-workspace-toolbar__button'],
            translationVisible && styles['is-active'],
            isCurrentPaperTranslating && styles['is-pending']
          ]
            .filter(Boolean)
            .join(' ')}
          title={translationButtonTitle}
          aria-label={translationButtonTitle}
          onClick={() => {
            void handleToggleTranslation()
          }}
        >
          <SvgIcon name="translate" size={14} />
        </button>
      )}

      {isPaperView && currentPaperId && !originalPdfVisible && (
        <div ref={tocContainerRef} className={styles['sm-workspace-toolbar__toc']}>
          <button
            className={[
              'sm-icon-button',
              styles['sm-workspace-toolbar__button'],
              showTocPanel && styles['is-active']
            ]
              .filter(Boolean)
              .join(' ')}
            title="论文目录"
            aria-label="打开论文目录"
            aria-haspopup="dialog"
            aria-expanded={showTocPanel}
            disabled={!canOpenToc}
            onClick={handleToggleToc}
          >
            <SvgIcon name="toc" size={14} />
          </button>

          {showTocPanel && (
            <div
              className={styles['sm-workspace-toolbar__toc-panel']}
              role="dialog"
              aria-label="论文目录"
            >
              <div className={styles['sm-workspace-toolbar__toc-header']}>论文目录</div>

              {markdownLoading ? (
                <div className={styles['sm-workspace-toolbar__toc-state']}>目录加载中</div>
              ) : !hasAnyTocEntries ? (
                <div className={styles['sm-workspace-toolbar__toc-state']}>未识别到可用目录</div>
              ) : (
                <div className={styles['sm-workspace-toolbar__toc-scroll']}>
                  {paperTocTitle && (
                    <button
                      className={styles['sm-workspace-toolbar__toc-title']}
                      title={getTocEntryDisplayText(paperTocTitle)}
                      type="button"
                      onClick={() => handleSelectTocItem(paperTocTitle.id)}
                    >
                      {getTocEntryDisplayText(paperTocTitle)}
                    </button>
                  )}

                  {paperTocTitle && paperTocItems.length > 0 && (
                    <div
                      className={styles['sm-workspace-toolbar__toc-divider']}
                      aria-hidden="true"
                    />
                  )}

                  {paperTocItems.length > 0 && (
                    <ul className={styles['sm-workspace-toolbar__toc-list']}>
                      {renderTocTree(paperTocTree)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isPaperView && currentPaperId && !originalPdfVisible && (
        <div ref={figureContainerRef} className={styles['sm-workspace-toolbar__figures']}>
          <button
            className={[
              'sm-icon-button',
              styles['sm-workspace-toolbar__button'],
              showFigurePanel && styles['is-active']
            ]
              .filter(Boolean)
              .join(' ')}
            title="论文图片"
            aria-label="打开论文图片列表"
            aria-haspopup="dialog"
            aria-expanded={showFigurePanel}
            disabled={!canOpenFigurePanel}
            onClick={() => {
              void handleToggleFigurePanel()
            }}
          >
            <SvgIcon name="image" size={14} />
          </button>

          {showFigurePanel && (
            <div
              ref={figurePanelRef}
              className={styles['sm-workspace-toolbar__figure-panel']}
              role="dialog"
              aria-label="论文图片列表"
            >
              <div className={styles['sm-workspace-toolbar__toc-header']}>论文图片</div>

              {currentFigureLoading ? (
                <div className={styles['sm-workspace-toolbar__toc-state']}>图片加载中</div>
              ) : currentPaperFigures.length === 0 ? (
                <div className={styles['sm-workspace-toolbar__toc-state']}>未识别到可用图片</div>
              ) : (
                <div className={styles['sm-workspace-toolbar__figure-scroll']}>
                  {currentPaperFigures.map((figure) => (
                    <div key={figure.id} className={styles['sm-workspace-toolbar__figure-item']}>
                      <img
                        src={figure.imagePath}
                        alt={getFigureItemLabel(figure)}
                        className={styles['sm-workspace-toolbar__figure-thumb']}
                      />

                      <div className={styles['sm-workspace-toolbar__figure-copy']}>
                        <div
                          className={styles['sm-workspace-toolbar__figure-caption']}
                          title={getFigureItemLabel(figure)}
                        >
                          {getFigureItemLabel(figure)}
                        </div>
                      </div>

                      <button
                        className={styles['sm-workspace-toolbar__figure-preview']}
                        type="button"
                        onClick={() => handlePreviewFigure(figure)}
                      >
                        预览
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isPaperView && currentPaperId && (
        <button
          className={[
            'sm-icon-button',
            styles['sm-workspace-toolbar__button'],
            originalPdfVisible && styles['is-active']
          ]
            .filter(Boolean)
            .join(' ')}
          title="PDF 原件"
          aria-label="PDF 原件"
          type="button"
          onClick={handleToggleOriginalPdf}
        >
          <span className={styles['sm-workspace-toolbar__original-text']}>原</span>
        </button>
      )}

      {isPaperView && canOpenPaperChat && (
        <button
          className={[
            'sm-icon-button',
            styles['sm-workspace-toolbar__button'],
            paperChatPanelOpen && styles['is-active']
          ]
            .filter(Boolean)
            .join(' ')}
          title="聊天"
          aria-label="聊天"
          type="button"
          onClick={handleTogglePaperChat}
        >
          <SvgIcon name="chat" size={14} />
        </button>
      )}
    </div>
  )
}
