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
import { usePaperQuoteHighlight } from './composables/usePaperQuoteHighlight'
import { useZoomAnchor } from './composables/useZoomAnchor'
import { syncFormulaSelectionOnDrag } from './composables/paperDragSelectionSync'
import { PAPER_ANNOTATION_INTERACTIVE_SELECTOR } from './composables/usePaperHighlightRenderer'
import PaperAnnotationHoverPopover from './annotation/PaperAnnotationHoverPopover'
import PaperAnnotationNoteEditor from './annotation/PaperAnnotationNoteEditor'
import PaperAnnotationSelectionMenu from './annotation/PaperAnnotationSelectionMenu'
import PaperMarkdownSegmentList from './PaperMarkdownSegmentList'
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

const TABLE_DRAG_THRESHOLD = 4

interface TableDragState {
  wrap: HTMLElement
  pointerId: number
  startClientX: number
  startScrollLeft: number
  hasDragged: boolean
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
    const setMarkdownScrollPosition = usePaperViewStore((state) => state.setMarkdownScrollPosition)
    const getMarkdownScrollPosition = usePaperViewStore((state) => state.getMarkdownScrollPosition)

    const createAnnotation = usePaperAnnotationStore((state) => state.createAnnotation)
    const updateAnnotation = usePaperAnnotationStore((state) => state.updateAnnotation)
    const deleteAnnotation = usePaperAnnotationStore((state) => state.deleteAnnotation)

    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Text search
    const textSearch = usePaperTextSearch()

    // Zoom anchor
    const zoomAnchorRef = useRef(useZoomAnchor())
    const zoomAnchor = zoomAnchorRef.current
    const quoteHighlightRef = useRef(usePaperQuoteHighlight())
    const quoteHighlight = quoteHighlightRef.current
    const zoomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const hasMountedZoomRef = useRef(false)
    const previousZoomLevelRef = useRef(zoomLevel)

    // Table drag state
    const tableDragStateRef = useRef<TableDragState | null>(null)
    const lastTableDragEndedAtRef = useRef(0)

    // Scroll RAF
    const scrollRafIdRef = useRef<number | null>(null)

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
        scrollToQuoteAndHighlight: quoteHighlight.scrollToQuoteAndHighlight
      }),
      [quoteHighlight]
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

    // Record scroll position
    const recordMarkdownScrollPosition = useCallback(() => {
      if (!paperId || !scrollContainerRef.current || zoomAnchor.isZooming()) {
        return
      }

      if (scrollRafIdRef.current !== null) {
        return
      }

      scrollRafIdRef.current = requestAnimationFrame(() => {
        scrollRafIdRef.current = null
        if (!paperId || !scrollContainerRef.current) return
        setMarkdownScrollPosition(paperId, {
          scrollTop: scrollContainerRef.current.scrollTop,
          scrollLeft: scrollContainerRef.current.scrollLeft
        })
      })
    }, [paperId, setMarkdownScrollPosition, zoomAnchor])

    // Restore scroll position
    const restoreMarkdownScrollPosition = useCallback(
      async (targetPaperId: string) => {
        const position = getMarkdownScrollPosition(targetPaperId)
        if (!position) {
          return
        }

        requestAnimationFrame(() => {
          if (paperId !== targetPaperId || !scrollContainerRef.current) {
            return
          }

          scrollContainerRef.current.scrollTop = position.scrollTop
          scrollContainerRef.current.scrollLeft = position.scrollLeft
        })
      },
      [paperId, getMarkdownScrollPosition]
    )

    // Table drag handlers
    const isTableWrapHorizontallyScrollable = useCallback((wrap: HTMLElement): boolean => {
      return wrap.scrollWidth > wrap.clientWidth + 1
    }, [])

    function cleanupTableDragListeners(): void {
      window.removeEventListener('pointermove', handleTablePointerMove)
      window.removeEventListener('pointerup', handleTablePointerUp)
      window.removeEventListener('pointercancel', handleTablePointerUp)
    }

    function clearTableDragState(): void {
      tableDragStateRef.current?.wrap.classList.remove('paper-markdown-view__table-wrap--dragging')
      tableDragStateRef.current = null
      cleanupTableDragListeners()
    }

    function shouldIgnoreTableDragTarget(target: Element): boolean {
      return !!target.closest(
        [
          'a',
          'button',
          'input',
          'textarea',
          'select',
          PAPER_ANNOTATION_INTERACTIVE_SELECTOR,
          '.paper-markdown-view__retranslate-btn'
        ].join(', ')
      )
    }

    function handleTablePointerDown(event: React.PointerEvent): void {
      if (event.button !== 0) {
        return
      }

      const target = event.target as Element
      if (!(target instanceof Element) || shouldIgnoreTableDragTarget(target)) {
        return
      }

      const wrap = target.closest<HTMLElement>('.paper-markdown-view__table-wrap')
      if (!wrap || !isTableWrapHorizontallyScrollable(wrap)) {
        return
      }

      clearTableDragState()
      tableDragStateRef.current = {
        wrap,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startScrollLeft: wrap.scrollLeft,
        hasDragged: false
      }

      window.addEventListener('pointermove', handleTablePointerMove, { passive: false })
      window.addEventListener('pointerup', handleTablePointerUp)
      window.addEventListener('pointercancel', handleTablePointerUp)
    }

    function handleTablePointerMove(event: PointerEvent): void {
      const state = tableDragStateRef.current
      if (!state || event.pointerId !== state.pointerId) {
        return
      }

      const deltaX = event.clientX - state.startClientX
      if (!state.hasDragged && Math.abs(deltaX) < TABLE_DRAG_THRESHOLD) {
        return
      }

      if (!state.hasDragged) {
        state.hasDragged = true
        state.wrap.classList.add('paper-markdown-view__table-wrap--dragging')
        window.getSelection()?.removeAllRanges()
      }

      event.preventDefault()
      state.wrap.scrollLeft = state.startScrollLeft - deltaX
    }

    function handleTablePointerUp(event: PointerEvent): void {
      const state = tableDragStateRef.current
      if (!state || event.pointerId !== state.pointerId) {
        return
      }

      if (state.hasDragged) {
        lastTableDragEndedAtRef.current = Date.now()
      }

      clearTableDragState()
    }

    // 未恢复批注通知（每次论文加载只提示一次）
    const unresolvedNotifiedRef = useRef(false)

    // Render content and sync tables
    const renderContentAndSyncTables = useCallback(async (): Promise<void> => {
      await engine.renderContent()
      // Use microtask to let React render
      await new Promise((resolve) => setTimeout(resolve, 0))
      syncScrollableTableWrapState()
    }, [engine, syncScrollableTableWrapState])

    // 通知未恢复批注
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
        if (Date.now() - lastTableDragEndedAtRef.current < 160) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        composer.handleSurfaceAnnotationClick(event.nativeEvent)
      },
      [composer]
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
      [paperId, retranslateSegment, notify]
    )

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
          void restoreMarkdownScrollPosition(paperId)
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

    // Zoom level effect — useLayoutEffect 确保在浏览器绘制前同步修正滚动位置
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

      const container = scrollContainerRef.current
      if (!container) return

      if (!zoomAnchor.isZooming()) {
        // 首次缩放步进：DOM 已更新缩放但 scrollTop 未变，需先用数学方式修正滚动位置
        // 再捕获锚点，否则 beginZoom 捕获的是已偏移的错误锚点
        const ratio = zoomLevel / prevLevel
        const scrollTop = container.scrollTop
        const clientHeight = container.clientHeight
        container.scrollTop = scrollTop * ratio + (clientHeight / 2) * (ratio - 1)
        zoomAnchor.beginZoom(container)
      }

      // 强制同步布局重计算，确保滚动修正基于新的缩放布局
      void container.offsetHeight

      // 同步修正滚动位置（在浏览器绘制前完成，消除抖动）
      zoomAnchor.applyZoomFrame(container)
      syncScrollableTableWrapState()

      if (zoomSettleTimerRef.current !== null) clearTimeout(zoomSettleTimerRef.current)
      zoomSettleTimerRef.current = setTimeout(() => {
        zoomSettleTimerRef.current = null
        zoomAnchor.endZoom()
      }, 150)
    }, [zoomLevel, zoomAnchor, syncScrollableTableWrapState])

    // 实时同步公式拖选高亮
    useEffect(() => {
      const container = scrollContainerRef.current
      if (!container) return

      const cleanup = syncFormulaSelectionOnDrag(container)
      return cleanup
    }, [content, paperId])

    // Reading progress
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingPercentRef = useRef<number | null>(null)
    const isRestoringRef = useRef(false)
    // 使用 ref 存储缩放级别，避免 saveProgress 依赖 zoomLevel 导致整条回调链重建
    const zoomLevelRef = useRef(zoomLevel)
    zoomLevelRef.current = zoomLevel
    const translationVisibleRef = useRef(translationVisible)
    translationVisibleRef.current = translationVisible

    function computeScrollPercent(container: HTMLElement): number {
      const scrollableHeight = container.scrollHeight - container.clientHeight
      if (scrollableHeight <= 0) return 0
      return Math.min(100, Math.max(0, (container.scrollTop / scrollableHeight) * 100))
    }

    const saveProgress = useCallback(
      (percent: number) => {
        if (!paperId) return

        void window.api.paper.saveReadingProgress({
          paperId,
          scrollPercent: Math.round(percent * 100) / 100,
          zoomLevel: zoomLevelRef.current,
          translationVisible: translationVisibleRef.current
        })
      },
      [paperId]
    )

    const flushPendingSave = useCallback(() => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (pendingPercentRef.current !== null) {
        saveProgress(pendingPercentRef.current)
        pendingPercentRef.current = null
      }
    }, [saveProgress])

    const debouncedSave = useCallback(
      (percent: number) => {
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current)
        }
        pendingPercentRef.current = percent
        saveTimerRef.current = setTimeout(() => {
          saveTimerRef.current = null
          if (pendingPercentRef.current !== null) {
            saveProgress(pendingPercentRef.current)
            pendingPercentRef.current = null
          }
        }, 500)
      },
      [saveProgress]
    )

    const handleScroll = useCallback(() => {
      if (isRestoringRef.current) return
      if (zoomAnchor.isZooming()) return

      const container = scrollContainerRef.current
      if (!container) return

      const percent = computeScrollPercent(container)
      debouncedSave(percent)
    }, [debouncedSave, zoomAnchor])

    // Setup scroll listener
    useEffect(() => {
      const container = scrollContainerRef.current
      if (!container) return

      container.addEventListener('scroll', handleScroll, { passive: true })
      return () => {
        container.removeEventListener('scroll', handleScroll)
      }
    }, [handleScroll])

    // Restore reading progress on paper change
    useEffect(() => {
      unresolvedNotifiedRef.current = false
      flushPendingSave()

      const progress = readingProgress
      if (!progress) return

      isRestoringRef.current = true

      const timer = setTimeout(() => {
        const container = scrollContainerRef.current
        if (!container) {
          isRestoringRef.current = false
          return
        }

        const scrollableHeight = container.scrollHeight - container.clientHeight
        if (scrollableHeight > 0) {
          container.scrollTop = (progress.scrollPercent / 100) * scrollableHeight
        }

        setTimeout(() => {
          isRestoringRef.current = false
        }, 300)
      }, 100)

      return () => clearTimeout(timer)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paperId])

    // Restore on loading complete
    const wasLoadingRef = useRef(loading)
    useEffect(() => {
      const wasLoading = wasLoadingRef.current
      wasLoadingRef.current = loading

      if (loading || !wasLoading) return

      const progress = readingProgress
      if (!progress) return

      isRestoringRef.current = true

      const timer = setTimeout(() => {
        const container = scrollContainerRef.current
        if (!container) {
          isRestoringRef.current = false
          return
        }

        const scrollableHeight = container.scrollHeight - container.clientHeight
        if (scrollableHeight > 0) {
          container.scrollTop = (progress.scrollPercent / 100) * scrollableHeight
        }

        setTimeout(() => {
          isRestoringRef.current = false
        }, 300)
      }, 100)

      return () => clearTimeout(timer)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading])

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
      window.addEventListener('resize', syncScrollableTableWrapState)
      return () => window.removeEventListener('resize', syncScrollableTableWrapState)
    }, [syncScrollableTableWrapState])

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        flushPendingSave()
        recordMarkdownScrollPosition()
        clearPaperToc()
        textSearch.closeSearch()
        clearTableDragState()
        composer.clearComposer()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
      <div className={[styles['paper-markdown-view'], 'paper-markdown-view'].join(' ')}>
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
          onPointerDown={handleTablePointerDown}
          onScroll={recordMarkdownScrollPosition}
          onWheel={(e) => handleWheelZoom(e.nativeEvent)}
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
                segments={engine.renderedSegments}
                scrollContainerRef={scrollContainerRef}
                onRetranslate={handleRetranslateSegment}
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
