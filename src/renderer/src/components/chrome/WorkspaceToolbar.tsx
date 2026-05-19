import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePiniaStore } from '@renderer/composables/usePiniaStore'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { PaperFigureItem, PaperTocEntry, PaperTocItem } from '@shared/types/paper'
import { hasPaperTranslationResult } from '@shared/utils/paperTranslation'
import styles from './WorkspaceToolbar.module.css'

interface PaperTocTreeNode {
  item: PaperTocItem
  children: PaperTocTreeNode[]
}

export default function WorkspaceToolbar() {
  const currentView = useUIStateStore((s) => s.currentView)
  const isCurrentSidebarCollapsed = useUIStateStore((s) => s.isCurrentSidebarCollapsed())
  const paperChatPanelOpen = useUIStateStore((s) => s.paperChatPanelOpen)
  const togglePaperChatPanel = useUIStateStore((s) => s.togglePaperChatPanel)
  const paperReaderStore = usePiniaStore(usePaperReaderStore)

  const tocContainerRef = useRef<HTMLDivElement>(null)
  const figureContainerRef = useRef<HTMLDivElement>(null)
  const figurePanelRef = useRef<HTMLDivElement>(null)
  const [showTocPanel, setShowTocPanel] = useState(false)

  const currentPaperId = paperReaderStore.currentPaperId ?? null
  const paperTocTitle = paperReaderStore.paperTocTitle ?? null
  const paperTocItems = useMemo<PaperTocItem[]>(
    () => paperReaderStore.paperTocItems ?? [],
    [paperReaderStore.paperTocItems]
  )
  const currentPaperFigures = useMemo<PaperFigureItem[]>(
    () => paperReaderStore.currentPaperFigures ?? [],
    [paperReaderStore.currentPaperFigures]
  )
  const currentTranslationCache = paperReaderStore.currentTranslationCache ?? null
  const figureCaptionTranslationMap = useMemo<Record<string, string>>(
    () => paperReaderStore.figureCaptionTranslationMap ?? {},
    [paperReaderStore.figureCaptionTranslationMap]
  )
  const figureLoadingByPaperId = useMemo<Record<string, boolean>>(
    () => paperReaderStore.figureLoadingByPaperId ?? {},
    [paperReaderStore.figureLoadingByPaperId]
  )
  const isOcrCompleted = paperReaderStore.isOcrCompleted ?? false
  const isCurrentPaperTranslating = paperReaderStore.isCurrentPaperTranslating ?? false
  const markdownLoading = paperReaderStore.markdownLoading ?? false
  const originalPdfVisible = paperReaderStore.originalPdfVisible ?? false
  const showFigurePanel = paperReaderStore.showFigurePanel ?? false
  const translationVisible = paperReaderStore.translationVisible ?? false
  const canZoomIn = paperReaderStore.canZoomIn ?? false
  const canZoomOut = paperReaderStore.canZoomOut ?? false
  const zoomPercent = paperReaderStore.zoomPercent ?? 100

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
    paperReaderStore.closeFigurePanel()
  }, [paperReaderStore])

  const handleToggleOriginalPdf = useCallback((): void => {
    if (!currentPaperId) {
      return
    }

    closeTocPanel()
    closeFigurePanel()
    paperReaderStore.closeFigurePreview()
    paperReaderStore.toggleOriginalPdfVisible()
  }, [closeFigurePanel, closeTocPanel, currentPaperId, paperReaderStore])

  const handleToggleTranslation = useCallback(async (): Promise<void> => {
    if (!currentPaperId) {
      return
    }

    closeTocPanel()
    closeFigurePanel()
    await paperReaderStore.toggleTranslationVisible()
  }, [closeFigurePanel, closeTocPanel, currentPaperId, paperReaderStore])

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
    await paperReaderStore.toggleFigurePanel()
  }, [canOpenFigurePanel, closeTocPanel, paperReaderStore])

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
      if (paperReaderStore.scrollToHeading(headingId)) {
        closeTocPanel()
      }
    },
    [closeTocPanel, paperReaderStore]
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

      paperReaderStore.openFigurePreview(figure, {
        initialRect: panelRect
          ? {
              left: panelRect.left,
              top: panelRect.top,
              width: panelRect.width
            }
          : undefined
      })
    },
    [paperReaderStore]
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
            onClick={() => paperReaderStore.zoomOut()}
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
            onClick={() => paperReaderStore.resetZoom()}
          >
            <span className={styles['sm-workspace-toolbar__zoom-text']}>{zoomPercent}%</span>
          </button>
          <button
            className={['sm-icon-button', styles['sm-workspace-toolbar__button']].join(' ')}
            title="放大"
            aria-label="放大"
            disabled={!canZoomIn}
            onClick={() => paperReaderStore.zoomIn()}
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
