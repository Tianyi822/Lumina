import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useImperativeHandle,
  forwardRef
} from 'react'
import { usePaperViewStore } from '@renderer/stores/paper'
import { usePaperAnnotationStore } from '@renderer/stores/paper'
import { retranslateSegment } from '@renderer/stores/paper'
import { useNotification } from '@renderer/composables/useNotification'
import type {
  PaperAnnotation,
  PaperReadingProgress,
  PaperReaderDocument,
  PaperTranslationCache
} from '@shared/types/paper'
import type { PaperQuote } from '@shared/types/chat'
import {
  usePaperMarkdownEngine,
  getTranslationRenderKey,
  type RenderedSegment
} from './hooks/usePaperMarkdownEngine'
import { usePaperAnnotationComposer } from './hooks/usePaperAnnotationComposer'
import { usePaperTextSearch } from './hooks/usePaperTextSearch'
import { usePaperVirtualizer, type PaperZoomLayoutSync } from './hooks/usePaperVirtualizer'
import { usePaperQuoteHighlight } from './composables/usePaperQuoteHighlight'
import { useZoomAnchor } from './composables/useZoomAnchor'
import {
  captureVirtualZoomAnchorFromItems,
  scrollToVirtualZoomAnchor
} from './composables/paperZoomScrollRestore'
import { useTableDragScroll } from './hooks/useTableDragScroll'
import { useMarkdownScrollPersistence } from './hooks/useMarkdownScrollPersistence'
import { syncFormulaSelectionOnDrag } from './composables/paperDragSelectionSync'
import PaperAnnotationHoverPopover from './annotation/PaperAnnotationHoverPopover'
import PaperAnnotationNoteEditor from './annotation/PaperAnnotationNoteEditor'
import PaperAnnotationSelectionMenu from './annotation/PaperAnnotationSelectionMenu'
import PaperMarkdownSegmentList from './PaperMarkdownSegmentList'
import type { PaperMarkdownSegmentListHandle } from './PaperMarkdownSegmentList'
import styles from './PaperMarkdownView.module.css'

interface ReadonlyValueRef<T> {
  readonly value: T
}

interface PaperMarkdownViewProps {
  content: string
  loading: boolean
  paperId: string
  basePath?: string
  translationVisible: boolean
  translationCache?: PaperTranslationCache | null
  readerDocument?: PaperReaderDocument | null
  annotations?: PaperAnnotation[]
  readingProgress?: PaperReadingProgress | null
  onAddToChat?: (quote: PaperQuote) => void
}

export interface PaperMarkdownViewHandle {
  scrollToQuoteAndHighlight: (quote: PaperQuote) => void
}

const PaperMarkdownView = forwardRef<PaperMarkdownViewHandle, PaperMarkdownViewProps>(
  function PaperMarkdownView(
    {
      content,
      loading,
      paperId,
      basePath,
      translationVisible,
      translationCache,
      readerDocument,
      annotations = [],
      readingProgress,
      onAddToChat
    },
    ref
  ) {
    const notify = useNotification()
    const zoomLevel = usePaperViewStore((state) => state.zoomLevel)
    const setPaperTocOutline = usePaperViewStore((state) => state.setPaperTocOutline)
    const clearPaperToc = usePaperViewStore((state) => state.clearPaperToc)
    const handleWheelZoom = usePaperViewStore((state) => state.handleWheelZoom)
    const registerBeforeZoomChange = usePaperViewStore((state) => state.registerBeforeZoomChange)

    const createAnnotation = usePaperAnnotationStore((state) => state.createAnnotation)
    const updateAnnotation = usePaperAnnotationStore((state) => state.updateAnnotation)
    const deleteAnnotation = usePaperAnnotationStore((state) => state.deleteAnnotation)

    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const segmentListRef = useRef<PaperMarkdownSegmentListHandle>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Text search
    const textSearch = usePaperTextSearch()

    // Zoom anchor
    const zoomAnchorRef = useRef(useZoomAnchor())
    const zoomAnchor = zoomAnchorRef.current
    const quoteHighlightRef = useRef(usePaperQuoteHighlight())
    const quoteHighlight = quoteHighlightRef.current
    const zoomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const zoomSettleRunIdRef = useRef(0)
    const hasMountedZoomRef = useRef(false)
    const previousZoomLevelRef = useRef(zoomLevel)
    const zoomLayoutSyncRef = useRef<PaperZoomLayoutSync | null>(null)

    // Markdown engine
    const engine = usePaperMarkdownEngine({
      content,
      basePath,
      translationVisible,
      translationCache,
      readerDocument,
      annotations,
      setTocOutline: setPaperTocOutline,
      clearToc: clearPaperToc
    })

    const renderedSegmentsForZoomRef = useRef(engine.renderedSegments)
    renderedSegmentsForZoomRef.current = engine.renderedSegments

    // Virtual scroll
    const virtualizerResult = usePaperVirtualizer({
      segments: engine.renderedSegments,
      scrollContainerRef,
      zoomLevel,
      zoomLayoutSyncRef
    })

    zoomLayoutSyncRef.current = {
      onAfterRemeasure: (container) => {
        if (!zoomAnchor.isZooming()) {
          virtualizerResult.isZoomingRef.current = true
          zoomAnchor.beginZoom(container)
        }
        const anchor = zoomAnchor.getAnchor()
        if (anchor) {
          scrollToVirtualZoomAnchor(
            container,
            virtualizerResult.virtualizer,
            anchor,
            renderedSegmentsForZoomRef.current
          )
        }
      }
    }

    const renderedSegmentsRef = useMemo(
      () =>
        ({
          get value() {
            return engine.renderedSegments
          }
        }) as ReadonlyValueRef<RenderedSegment[]>,
      [engine.renderedSegments]
    )

    const composer = usePaperAnnotationComposer({
      paperId: () => paperId,
      translationCache: () => translationCache,
      annotations: () => annotations,
      renderedSegments: renderedSegmentsRef,
      getSourceSegments: engine.getSourceSegments,
      createAnnotation,
      updateAnnotation,
      deleteAnnotation,
      onAddToChat
    })

    const hasContent = content.trim().length > 0

    // Expose scrollToQuoteAndHighlight to parent
    useImperativeHandle(
      ref,
      () => ({
        scrollToQuoteAndHighlight: (quote: PaperQuote) => {
          const index = engine.renderedSegments.findIndex(
            (s) => s.stableId === quote.segmentStableId
          )
          if (index !== -1) {
            virtualizerResult.virtualizer.scrollToIndex(index, { align: 'center' })
          }
          requestAnimationFrame(() => {
            quoteHighlight.scrollToQuoteAndHighlight(quote)
          })
        }
      }),
      [quoteHighlight, virtualizerResult.virtualizer, engine.renderedSegments]
    )

    // Content zoom style
    const contentZoomStyle = useMemo(
      () => ({
        zoom: zoomLevel
      }),
      [zoomLevel]
    )

    // Sync scrollable table wrap state
    const syncScrollableTableWrapState = useCallback(() => {
      scrollContainerRef.current
        ?.querySelectorAll<HTMLElement>('.paper-markdown-view__table-wrap')
        .forEach((wrap) => {
          wrap.classList.toggle(
            'paper-markdown-view__table-wrap--scrollable',
            wrap.scrollWidth > wrap.clientWidth + 1
          )
        })
    }, [])

    const remeasureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingRemeasureCallbacksRef = useRef<Array<() => void>>([])

    // 表格 wrap 状态同步；重测防抖，避免滚动时可见项变化引发连续测高抖动
    const syncTablesAndRemeasure = useCallback(
      (onAfterRemeasure?: () => void) => {
        syncScrollableTableWrapState()
        if (onAfterRemeasure) {
          pendingRemeasureCallbacksRef.current.push(onAfterRemeasure)
        }
        if (remeasureTimerRef.current !== null) {
          clearTimeout(remeasureTimerRef.current)
        }
        remeasureTimerRef.current = setTimeout(() => {
          remeasureTimerRef.current = null
          virtualizerResult.remeasureMountedSegments()
          const callbacks = pendingRemeasureCallbacksRef.current.splice(0)
          for (const callback of callbacks) {
            callback()
          }
        }, 120)
      },
      [syncScrollableTableWrapState, virtualizerResult]
    )

    // Table drag scroll
    const { handlePointerDown, lastDragEndedAt } = useTableDragScroll()

    // Scroll persistence
    const {
      recordScrollPosition,
      restoreScrollPosition,
      persistReadingProgressNow,
      discardPendingReadingProgress
    } = useMarkdownScrollPersistence({
      scrollContainerRef,
      paperId,
      readingProgress,
      loading,
      zoomAnchor,
      zoomLevel,
      translationVisible
    })

    const prepareZoomSession = useCallback(() => {
      const container = scrollContainerRef.current
      if (!container) {
        return
      }

      discardPendingReadingProgress()
      virtualizerResult.isZoomingRef.current = true

      if (zoomAnchor.isZooming()) {
        return
      }

      const anchor = captureVirtualZoomAnchorFromItems(
        container.scrollTop,
        container.clientHeight,
        virtualizerResult.virtualizer.getVirtualItems(),
        renderedSegmentsForZoomRef.current
      )

      if (!zoomAnchor.beginZoomWithAnchor(anchor)) {
        zoomAnchor.beginZoom(container)
      }
    }, [discardPendingReadingProgress, virtualizerResult, zoomAnchor])

    // 未恢复批注通知（每次论文加载只提示一次）
    const unresolvedNotifiedRef = useRef(false)

    // Render content and sync tables
    // invalidateAllMeasurements 由 usePaperVirtualizer 的 layoutKey effect 在 segments 变化时自动触发，
    // 此处不再重复调用，避免缓存被反复清空延长估算值窗口期
    const renderContentAndSyncTables = useCallback(async (): Promise<void> => {
      await engine.renderContent()
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })
      syncTablesAndRemeasure()
    }, [engine, syncTablesAndRemeasure])

    // 通知未恢复批注
    // 论文切换时重置通知标记
    useEffect(() => {
      unresolvedNotifiedRef.current = false
      return () => {
        zoomSettleRunIdRef.current += 1
        virtualizerResult.isZoomingRef.current = false
        zoomAnchor.endZoom()
        if (zoomSettleTimerRef.current !== null) {
          clearTimeout(zoomSettleTimerRef.current)
          zoomSettleTimerRef.current = null
        }
        if (remeasureTimerRef.current !== null) {
          clearTimeout(remeasureTimerRef.current)
        }
        pendingRemeasureCallbacksRef.current = []
      }
    }, [paperId, virtualizerResult.isZoomingRef, zoomAnchor])

    // 检查并通知未恢复的批注
    useEffect(() => {
      if (unresolvedNotifiedRef.current) return
      const ids = engine.unresolvedAnnotationIds
      if (ids.length > 0) {
        unresolvedNotifiedRef.current = true
        const uniqueCount = new Set(ids).size
        notify.info('批注恢复', `${uniqueCount} 条批注因文本变化未能恢复高亮`, {
          source: 'paper',
          dedupeKey: `paper-unresolved-annotations:${paperId}`
        })
      }
    }, [engine.unresolvedAnnotationIds, notify, paperId])

    // Search helpers
    const getSearchContentElement = useCallback((): HTMLElement | null => {
      const contentEl = scrollContainerRef.current?.querySelector('.paper-markdown-view__content')
      return contentEl instanceof HTMLElement ? contentEl : null
    }, [])

    const refreshTextSearch = useCallback(
      (options: { preserveCurrentIndex?: boolean } = {}) => {
        if (!textSearch.isOpen || !textSearch.query.trim()) {
          return
        }

        const contentEl = getSearchContentElement()
        if (!contentEl) {
          return
        }

        textSearch.search(contentEl, textSearch.query, options)
      },
      [textSearch, getSearchContentElement]
    )

    // Keyboard handlers
    const handleDocumentKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault()
          if (textSearch.isOpen) {
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
          } else {
            textSearch.openSearch()
            const selection = window.getSelection()?.toString().trim()
            if (selection && selection.length <= 200) {
              textSearch.setQuery(selection)
            }
          }
          return
        }

        if (event.key === 'Escape' && textSearch.isOpen) {
          event.preventDefault()
          textSearch.closeSearch()
          return
        }

        composer.handleDocumentKeyDown(event)
      },
      [composer, textSearch]
    )

    const handleSearchInputKeydown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          if (event.shiftKey) {
            textSearch.goToPrevious()
          } else {
            textSearch.goToNext()
          }
        }
      },
      [textSearch]
    )

    // Handle markdown click (prevent after table drag)
    const handleMarkdownClick = useCallback(
      (event: React.MouseEvent) => {
        if (Date.now() - lastDragEndedAt.current < 160) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        composer.handleSurfaceAnnotationClick(event.nativeEvent)
      },
      [composer, lastDragEndedAt]
    )

    // Retranslate handler
    const handleRetranslateSegment = useCallback(
      async (params: { segmentId: string; stableId: string }): Promise<void> => {
        if (!paperId) {
          return
        }

        const result = await retranslateSegment(paperId, params.segmentId, params.stableId)
        if (!result.success) {
          notify.error('重新翻译失败', result.error || '请稍后再试', {
            source: 'paper',
            dedupeKey: `paper-retranslate:${paperId}:${params.segmentId}:${result.error || ''}`
          })
        }
      },
      [paperId, notify]
    )

    // 注册 TOC 跳转回调
    const registerScrollToHeading = usePaperViewStore((state) => state.registerScrollToHeading)
    useEffect(() => {
      registerScrollToHeading(virtualizerResult.scrollToHeadingId)
      return () => registerScrollToHeading(() => false)
    }, [virtualizerResult.scrollToHeadingId, registerScrollToHeading])

    // 缩放前先捕获当前视口中心虚拟锚点，避免缩放后再反查 DOM 造成中部漂移
    useEffect(() => {
      return registerBeforeZoomChange(() => {
        prepareZoomSession()
      })
    }, [registerBeforeZoomChange, prepareZoomSession])

    // Content change effect
    const prevContentRef = useRef(content)
    const prevBasePathRef = useRef(basePath)
    const prevSourceRevisionIdRef = useRef(readerDocument?.sourceRevisionId)
    const translationRenderKey = useMemo(
      () => (translationVisible ? getTranslationRenderKey(translationCache) : ''),
      [translationCache, translationVisible]
    )
    const annotationUpdateKey = useMemo(
      () =>
        [
          annotations.length,
          readerDocument?.sourceRevisionId ?? '',
          ...annotations.map(
            (annotation) => `${annotation.updatedAt}:${annotation.semanticAnchor.segmentTextHash}`
          )
        ].join('|'),
      [annotations, readerDocument?.sourceRevisionId]
    )

    useEffect(() => {
      const prevContent = prevContentRef.current
      const prevBasePath = prevBasePathRef.current
      const prevSourceRevisionId = prevSourceRevisionIdRef.current

      const contentChanged = content !== prevContent
      const basePathChanged = basePath !== prevBasePath
      const sourceRevisionIdChanged = readerDocument?.sourceRevisionId !== prevSourceRevisionId

      prevContentRef.current = content
      prevBasePathRef.current = basePath
      prevSourceRevisionIdRef.current = readerDocument?.sourceRevisionId

      void renderContentAndSyncTables().then(() => {
        // 仅当菜单和笔记编辑器都未打开时才清除 composer，避免破坏活跃的选区状态
        if (!composer.selectionActionMenu && !composer.noteEditorDraft) {
          composer.clearComposer()
        }

        // Restore scroll position on initial load or major content change
        if (contentChanged || basePathChanged || sourceRevisionIdChanged) {
          void restoreScrollPosition(paperId)
        }
        refreshTextSearch({ preserveCurrentIndex: true })
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      content,
      basePath,
      translationVisible,
      translationRenderKey,
      readerDocument?.sourceRevisionId,
      annotations.length,
      annotationUpdateKey
    ])

    // Search query change effect
    useEffect(() => {
      if (!textSearch.isOpen) return
      const contentEl = getSearchContentElement()
      if (contentEl) {
        textSearch.search(contentEl, textSearch.query)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [textSearch.query])

    // Search open effect
    useEffect(() => {
      if (textSearch.isOpen) {
        setTimeout(() => {
          searchInputRef.current?.focus()
          if (textSearch.query) {
            searchInputRef.current?.select()
          }
        }, 0)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [textSearch.isOpen])

    // 缩放 settle：虚拟测量与锚点修正由 usePaperVirtualizer + zoomLayoutSyncRef 处理
    useLayoutEffect(() => {
      if (!hasMountedZoomRef.current) {
        hasMountedZoomRef.current = true
        previousZoomLevelRef.current = zoomLevel
        return
      }

      const prevLevel = previousZoomLevelRef.current
      if (prevLevel === zoomLevel) {
        return
      }

      previousZoomLevelRef.current = zoomLevel

      const zoomSettleRunId = zoomSettleRunIdRef.current + 1
      zoomSettleRunIdRef.current = zoomSettleRunId

      if (zoomSettleTimerRef.current !== null) clearTimeout(zoomSettleTimerRef.current)
      zoomSettleTimerRef.current = setTimeout(() => {
        if (zoomSettleRunIdRef.current !== zoomSettleRunId) {
          return
        }
        zoomSettleTimerRef.current = null
        virtualizerResult.finalizeZoomRemeasure((container) => {
          if (zoomSettleRunIdRef.current !== zoomSettleRunId) {
            return
          }
          const currentAnchor = zoomAnchor.getAnchor()
          if (container && currentAnchor) {
            scrollToVirtualZoomAnchor(
              container,
              virtualizerResult.virtualizer,
              currentAnchor,
              renderedSegmentsForZoomRef.current
            )
          }
          syncTablesAndRemeasure(() => {
            if (zoomSettleRunIdRef.current !== zoomSettleRunId) {
              return
            }
            const settledContainer = scrollContainerRef.current
            const settledAnchor = zoomAnchor.getAnchor()
            if (settledContainer && settledAnchor) {
              scrollToVirtualZoomAnchor(
                settledContainer,
                virtualizerResult.virtualizer,
                settledAnchor,
                renderedSegmentsForZoomRef.current
              )
            }
            persistReadingProgressNow()
            virtualizerResult.isZoomingRef.current = false
            zoomAnchor.endZoom()
          })
        })
      }, 150)
    }, [
      zoomLevel,
      zoomAnchor,
      syncTablesAndRemeasure,
      virtualizerResult,
      persistReadingProgressNow
    ])

    // 内容渲染完成后同步表格 wrap；不在每次可见项变化时重测（滚动会剧烈抖动）
    useLayoutEffect(() => {
      if (loading || !hasContent) {
        return
      }

      syncScrollableTableWrapState()
    }, [engine.renderedSegments, loading, hasContent, syncScrollableTableWrapState])

    // 实时同步公式拖选高亮
    useEffect(() => {
      const container = scrollContainerRef.current
      if (!container) return

      const cleanup = syncFormulaSelectionOnDrag(container)
      return cleanup
    }, [content, paperId])

    // Keyboard listeners
    useEffect(() => {
      document.addEventListener('mousedown', composer.handleDocumentPointerDown)
      document.addEventListener('keydown', handleDocumentKeyDown)
      return () => {
        document.removeEventListener('mousedown', composer.handleDocumentPointerDown)
        document.removeEventListener('keydown', handleDocumentKeyDown)
      }
    }, [composer.handleDocumentPointerDown, handleDocumentKeyDown])

    // Resize listener for table wraps
    useEffect(() => {
      const handleResize = (): void => {
        syncTablesAndRemeasure()
      }

      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }, [syncTablesAndRemeasure])

    // Ctrl/⌘ + 滚轮缩放：必须用非被动监听，否则 preventDefault 在 React 被动 wheel 监听中失效
    // （报错 "Unable to preventDefault inside passive event listener invocation"）
    useEffect(() => {
      const container = scrollContainerRef.current
      if (!container) {
        return
      }

      const onWheel = (event: WheelEvent): void => {
        handleWheelZoom(event)
      }

      container.addEventListener('wheel', onWheel, { passive: false })
      return () => container.removeEventListener('wheel', onWheel)
    }, [handleWheelZoom])

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        clearPaperToc()
        textSearch.closeSearch()
        composer.clearComposer()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
      <div className={[styles['paper-markdown-view'], 'paper-markdown-view'].join(' ')}>
        <div className={styles['paper-markdown-view__top-fade']} aria-hidden="true" />
        <div className={styles['paper-markdown-view__chrome-top']} aria-hidden="true" />
        {textSearch.isOpen && (
          <div
            className={[
              styles['paper-markdown-view__search-bar'],
              'paper-markdown-view__search-bar'
            ].join(' ')}
          >
            <input
              ref={searchInputRef}
              type="text"
              className={[
                styles['paper-markdown-view__search-input'],
                'paper-markdown-view__search-input'
              ].join(' ')}
              placeholder="搜索..."
              value={textSearch.query}
              onChange={(e) => textSearch.setQuery(e.target.value)}
              onKeyDown={handleSearchInputKeydown}
            />
            {textSearch.hasMatches ? (
              <span
                className={[
                  styles['paper-markdown-view__search-count'],
                  'paper-markdown-view__search-count'
                ].join(' ')}
              >
                {textSearch.currentIndex + 1} / {textSearch.matchCount}
              </span>
            ) : textSearch.query.trim() ? (
              <span
                className={[
                  styles['paper-markdown-view__search-count'],
                  'paper-markdown-view__search-count'
                ].join(' ')}
              >
                无结果
              </span>
            ) : null}
            <button
              className={[
                styles['paper-markdown-view__search-btn'],
                'paper-markdown-view__search-btn'
              ].join(' ')}
              type="button"
              disabled={!textSearch.hasMatches}
              title="上一个 (Shift+Enter)"
              onClick={textSearch.goToPrevious}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              className={[
                styles['paper-markdown-view__search-btn'],
                'paper-markdown-view__search-btn'
              ].join(' ')}
              type="button"
              disabled={!textSearch.hasMatches}
              title="下一个 (Enter)"
              onClick={textSearch.goToNext}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <button
              className={[
                styles['paper-markdown-view__search-btn'],
                'paper-markdown-view__search-btn',
                'paper-markdown-view__search-btn--close'
              ].join(' ')}
              type="button"
              title="关闭 (Esc)"
              onClick={textSearch.closeSearch}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          className={[styles['paper-markdown-view__scroll'], 'paper-markdown-view__scroll'].join(
            ' '
          )}
          onMouseUp={(e) => composer.updateComposerFromSelection(e.nativeEvent)}
          onClick={handleMarkdownClick}
          onPointerDown={handlePointerDown}
          onScroll={recordScrollPosition}
        >
          {loading ? (
            <div
              className={[
                styles['paper-markdown-view__loading'],
                'paper-markdown-view__loading'
              ].join(' ')}
            >
              <p>正在加载内容...</p>
            </div>
          ) : engine.parseError ? (
            <div
              className={[styles['paper-markdown-view__error'], 'paper-markdown-view__error'].join(
                ' '
              )}
            >
              <p>{engine.parseError}</p>
            </div>
          ) : !hasContent ? (
            <div
              className={[styles['paper-markdown-view__empty'], 'paper-markdown-view__empty'].join(
                ' '
              )}
            >
              <p>暂无内容</p>
            </div>
          ) : (
            <article
              className={[
                styles['paper-markdown-view__content'],
                'paper-markdown-view__content'
              ].join(' ')}
              style={contentZoomStyle}
            >
              <PaperMarkdownSegmentList
                ref={segmentListRef}
                segments={engine.renderedSegments}
                onRetranslate={handleRetranslateSegment}
                totalHeight={virtualizerResult.virtualizer.getTotalSize()}
                virtualItems={virtualizerResult.virtualizer.getVirtualItems()}
                measureElement={virtualizerResult.measureElement}
                zoomLevel={zoomLevel}
              />
            </article>
          )}
        </div>

        {composer.selectionActionMenu && (
          <PaperAnnotationSelectionMenu
            state={composer.selectionActionMenu}
            highlightColorOptions={composer.highlightColorOptions}
            error={composer.selectionActionMenuError}
            onCreateHighlight={composer.handleCreateHighlight}
            onOpenNoteEditor={composer.handleOpenNoteEditorFromSelection}
            onAddToChat={composer.handleAddToChat}
          />
        )}

        {composer.noteEditorDraft && (
          <PaperAnnotationNoteEditor
            state={composer.noteEditorDraft}
            comment={composer.noteEditorComment}
            isExistingNote={composer.noteEditorIsExistingNote}
            canUpdate={composer.noteEditorCanUpdate}
            saving={composer.noteEditorSaving}
            error={composer.noteEditorError}
            onCommentChange={composer.setNoteEditorComment}
            onSave={composer.handleSaveNote}
            onUpdateNote={composer.handleUpdateNote}
            onDeleteNote={composer.handleDeleteNoteFromEditor}
            onClose={composer.handleCloseNoteEditor}
            onMove={composer.handleMoveNoteEditor}
          />
        )}

        {composer.annotationHoverPopover && composer.hoverPopoverAnnotation && (
          <PaperAnnotationHoverPopover
            state={composer.annotationHoverPopover}
            annotation={composer.hoverPopoverAnnotation}
            highlightColorOptions={composer.highlightColorOptions}
            error={composer.hoverPopoverError}
            onDelete={() => {
              const annotation = composer.hoverPopoverAnnotation
              if (annotation) {
                void composer.handleDeleteAnnotation(annotation.id)
              }
            }}
            onOpenNoteEditor={composer.handleOpenNoteEditorFromHover}
            onUpdateColor={composer.handleUpdateHoverColor}
          />
        )}
      </div>
    )
  }
)

export default PaperMarkdownView
