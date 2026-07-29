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
import { usePaperFigureStore } from '@renderer/stores/paper/usePaperFigureStore'
import { useNotification } from '@renderer/composables/useNotification'
import type {
  PaperAnnotation,
  PaperReadingProgress,
  PaperReaderDocument,
  PaperTranslationCache
} from '@shared/types/paper'
import type { PaperQuote } from '@shared/types/chat'
import {
  PAPER_ANNOTATION_INDEX_LOADING_MESSAGE,
  isPaperAnnotationIndexReady
} from '@shared/utils/paperAnnotationReadiness'
import {
  usePaperMarkdownEngine,
  getTranslationRenderKey,
  type RenderedSegment
} from './hooks/usePaperMarkdownEngine'
import { usePaperAnnotationComposer } from './hooks/usePaperAnnotationComposer'
import { usePaperTextSearch } from './hooks/usePaperTextSearch'
import { usePaperVirtualizer, type PaperZoomLayoutSync } from './hooks/usePaperVirtualizer'
import { usePaperSegmentRenderScheduler } from './hooks/usePaperSegmentRenderScheduler'
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
// PERF-PROBE:firstpaint — 临时首屏性能埋点，验证后整体移除
import { probe } from './perf/paperFirstPaintProfiler'

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

/** 论文 Markdown 阅读视图主组件，整合虚拟滚动、文本搜索、批注编排、缩放锚定和滚动持久化 */
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
    const annotationReady = isPaperAnnotationIndexReady(paperId, readerDocument)
    const handleAnnotationUnavailable = useCallback(
      (message: string): void => {
        notify.warning('论文批注', message || PAPER_ANNOTATION_INDEX_LOADING_MESSAGE, {
          source: 'paper',
          dedupeKey: `paper-annotation-index-loading:${paperId}`
        })
      },
      [notify, paperId]
    )

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
    const { navigateToIndex, cancelNavigate } = virtualizerResult

    const isSegmentReady = useCallback(
      (index: number) => engine.renderedSegments[index]?.htmlStatus === 'ready',
      [engine.renderedSegments]
    )

    const segmentHtmlRevision = useMemo(
      () =>
        engine.renderedSegments.reduce(
          (revision, segment, index) =>
            revision +
            (segment.htmlStatus === 'ready' ? index + 1 : 0) +
            (segment.htmlStatus === 'pending' ? (index + 1) * 1000 : 0),
          0
        ),
      [engine.renderedSegments]
    )

    usePaperSegmentRenderScheduler({
      segmentCount: engine.renderedSegments.length,
      segmentHtmlRevision,
      scrollContainerRef,
      virtualizer: virtualizerResult.virtualizer,
      renderSegmentAtIndex: engine.renderSegmentAtIndex,
      isSegmentReady,
      paperId
    })

    // 缩放重测后，若未处于缩放中则标记为缩放中并记录视口锚点，随后滚动到锚点位置
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

    // 封装为 ReadonlyValueRef，通过 getter 保持引用稳定但每次读取返回最新值，避免触发多余重渲染
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
      annotationReady: () => annotationReady,
      translationCache: () => translationCache,
      annotations: () => annotations,
      renderedSegments: renderedSegmentsRef,
      getSourceSegments: engine.getSourceSegments,
      createAnnotation,
      updateAnnotation,
      deleteAnnotation,
      onAddToChat,
      onAnnotationUnavailable: handleAnnotationUnavailable
    })

    const hasContent = content.trim().length > 0

    // Expose scrollToQuoteAndHighlight to parent
    useImperativeHandle(
      ref,
      () => ({
        scrollToQuoteAndHighlight: (quote: PaperQuote) => {
          // 根据 stableId 在段落列表中定位目标段落索引，滚动到居中位置
          const index = engine.renderedSegments.findIndex(
            (s) => s.stableId === quote.segmentStableId
          )
          if (index !== -1) {
            navigateToIndex(index, { align: 'center' })
          }
          // 等下一帧 DOM 更新后再触发高亮，确保滚动完成后再计算选中区域位置
          requestAnimationFrame(() => {
            quoteHighlight.scrollToQuoteAndHighlight(quote)
          })
        }
      }),
      [quoteHighlight, navigateToIndex, engine.renderedSegments]
    )

    // Content zoom style
    const contentZoomStyle = useMemo(
      () => ({
        zoom: zoomLevel
      }),
      [zoomLevel]
    )

    // 检查所有表格容器，内容超宽时添加可滚动标记（+1 像素容差避免浮点精度误判）
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
        // 暂存后续回调，在防抖完成后依次执行
        if (onAfterRemeasure) {
          pendingRemeasureCallbacksRef.current.push(onAfterRemeasure)
        }
        // 重置防抖计时器，保证连续调用只触发一次重测
        if (remeasureTimerRef.current !== null) {
          clearTimeout(remeasureTimerRef.current)
        }
        remeasureTimerRef.current = setTimeout(() => {
          remeasureTimerRef.current = null
          virtualizerResult.remeasureMountedSegments()
          // 取出所有暂存回调并执行，此时重测已完成，回调可安全操作已刷新的布局
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
      // 容器不存在或已经在缩放中则跳过，避免重复捕获锚点
      if (!container) {
        return
      }

      discardPendingReadingProgress()
      virtualizerResult.isZoomingRef.current = true

      if (zoomAnchor.isZooming()) {
        return
      }

      // 从当前虚拟项中捕获视口中心区域的锚点，缩放后据此恢复滚动位置
      const anchor = captureVirtualZoomAnchorFromItems(
        container.scrollTop,
        container.clientHeight,
        virtualizerResult.virtualizer.getVirtualItems(),
        renderedSegmentsForZoomRef.current
      )

      // 优先使用带锚点的开始方式，若失败则回退到无锚点版本（光标居中）
      if (!zoomAnchor.beginZoomWithAnchor(anchor)) {
        zoomAnchor.beginZoom(container)
      }
    }, [discardPendingReadingProgress, virtualizerResult, zoomAnchor])

    // 未恢复批注通知（每次论文加载只提示一次）
    const unresolvedNotifiedRef = useRef(false)

    // 同步段落元数据并调度懒渲染；invalidateAllMeasurements 由 usePaperVirtualizer layoutKey effect 处理
    const syncMetasAndSchedule = useCallback((onAfterLayout?: () => void): void => {
      probe.mark('pr:metas-start') // PERF-PROBE:firstpaint
      engine.renderSegmentMetas()
      probe.mark('pr:metas-end') // PERF-PROBE:firstpaint（取代旧 paper-switch-first-paint）
      requestAnimationFrame(() => {
        syncTablesAndRemeasure(onAfterLayout)
      })
    }, [engine, syncTablesAndRemeasure])

    const annotationInvalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const pendingAnnotationRemeasureStableIdsRef = useRef<Set<string>>(new Set())

    // 通知未恢复批注
    // 论文切换时重置通知标记，并清理缩放/重测的定时器和回调队列
    useEffect(() => {
      unresolvedNotifiedRef.current = false
      return () => {
        // 递增运行 ID 使进行中的缩放 settle 回调自动失效
        zoomSettleRunIdRef.current += 1
        virtualizerResult.isZoomingRef.current = false
        cancelNavigate()
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
    }, [paperId, virtualizerResult.isZoomingRef, cancelNavigate, zoomAnchor])

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

    // 搜索框已打开且有查询内容时，在内容容器上重新执行文本搜索定位
    const refreshTextSearch = useCallback(
      (options: { preserveCurrentIndex?: boolean } = {}) => {
        // 搜索框未打开或查询为空时跳过，避免无意义的 DOM 遍历
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
        // Ctrl/Cmd + F：搜索已打开则聚焦输入框，否则打开搜索并用当前选中文本预填
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault()
          if (textSearch.isOpen) {
            searchInputRef.current?.focus()
            searchInputRef.current?.select()
          } else {
            textSearch.openSearch()
            const selection = window.getSelection()?.toString().trim()
            // 选中文本不超过 200 字符才填入搜索框，避免长文本意外覆盖查询
            if (selection && selection.length <= 200) {
              textSearch.setQuery(selection)
            }
          }
          return
        }

        // Escape：搜索打开时关闭搜索，否则交由 composer 处理（如取消选区）
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
        // Enter 在输入法未组合完成时触发会干扰，仅在确认后执行搜索跳转
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
        // 表格拖拽结束后 160ms 内的点击忽略，防止拖动释放时误触批注选区
        if (Date.now() - lastDragEndedAt.current < 160) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        // 点击正文图片时打开 figure 预览窗口（首次点击图片列表可能尚未加载，由 action 内部按需加载）
        const imgTarget = (event.target as HTMLElement).closest('img[data-paper-figure-id]')
        if (imgTarget) {
          const figureId = imgTarget.getAttribute('data-paper-figure-id')
          if (figureId && paperId) {
            void usePaperFigureStore.getState().openFigurePreviewById(paperId, figureId)
            event.preventDefault()
            return
          }
        }

        composer.handleSurfaceAnnotationClick(event.nativeEvent)
      },
      [composer, lastDragEndedAt, paperId]
    )

    // Retranslate handler
    const handleRetranslateSegment = useCallback(
      async (params: { segmentId: string; stableId: string }): Promise<void> => {
        if (!paperId) {
          return
        }

        // 调用 IPC 重新翻译指定段落，失败时显示通知（使用 dedupeKey 避免重复提示）
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

    // 注册 TOC 跳转回调，组件卸载时注入空函数覆盖，避免调用已卸载的实例
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
    // 记录上一次的值，用于在 effect 中精确判断哪些维度发生了变化
    const prevContentRef = useRef(content)
    const prevBasePathRef = useRef(basePath)
    const prevSourceRevisionIdRef = useRef(readerDocument?.sourceRevisionId)
    // 是否已完成首次元数据全量构建：首次渲染必须走全量构建，后续仅翻译变化走增量
    const hasBuiltMetasRef = useRef(false)
    // 翻译渲染键：翻译可见时才基于缓存计算渲染 key，不可见时返回空串避免触发重渲染
    const translationRenderKey = useMemo(
      () => (translationVisible ? getTranslationRenderKey(translationCache) : ''),
      [translationCache, translationVisible]
    )
    // 批注更新键：将批注数量、版本号和每个批注的时间戳+文本哈希拼接，精确检测批注变化
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

      const structuralChanged = contentChanged || basePathChanged || sourceRevisionIdChanged
      const shouldRestoreScroll = !hasBuiltMetasRef.current || structuralChanged

      if (!hasBuiltMetasRef.current || structuralChanged) {
        // 首次渲染或结构性变化（换论文/内容/路径变更）：全量重建段落元数据并调度懒渲染
        hasBuiltMetasRef.current = true
        if (shouldRestoreScroll) {
          syncMetasAndSchedule(() => {
            requestAnimationFrame(() => {
              void restoreScrollPosition(paperId)
            })
          })
        } else {
          syncMetasAndSchedule()
        }
      } else {
        // 仅翻译可见性切换或翻译进度推送：增量更新译文，保留原文 HTML，
        // 避免全量重置导致内容塌缩、抖动与滚动跳变
        engine.applyTranslationUpdates()
        requestAnimationFrame(() => {
          syncTablesAndRemeasure()
        })
      }

      if (!composer.selectionActionMenu && !composer.noteEditorDraft) {
        composer.clearComposer()
      }

      refreshTextSearch({ preserveCurrentIndex: true })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      content,
      basePath,
      translationVisible,
      translationRenderKey,
      readerDocument?.sourceRevisionId
    ])

    // 批注晚到或变更：增量失效高亮，不全量重建元数据
    useEffect(() => {
      if (annotationInvalidateTimerRef.current) {
        clearTimeout(annotationInvalidateTimerRef.current)
      }
      annotationInvalidateTimerRef.current = setTimeout(() => {
        annotationInvalidateTimerRef.current = null
        const affectedStableIds = engine.applyAnnotationUpdates()
        if (affectedStableIds.length > 0) {
          affectedStableIds.forEach((stableId) => {
            pendingAnnotationRemeasureStableIdsRef.current.add(stableId)
          })
          requestAnimationFrame(() => {
            syncTablesAndRemeasure()
          })
        }
      }, 50)
      return () => {
        if (annotationInvalidateTimerRef.current) {
          clearTimeout(annotationInvalidateTimerRef.current)
        }
      }
    }, [annotationUpdateKey, engine, syncTablesAndRemeasure])

    // 批注 HTML 原子替换完成后立即重测，避免虚拟列表沿用旧高度导致段落重叠
    useLayoutEffect(() => {
      const pendingStableIds = pendingAnnotationRemeasureStableIdsRef.current
      if (pendingStableIds.size === 0) {
        return
      }

      let shouldRemeasure = false
      for (const segment of engine.renderedSegments) {
        if (!pendingStableIds.has(segment.stableId) || segment.htmlStatus === 'pending') {
          continue
        }
        pendingStableIds.delete(segment.stableId)
        shouldRemeasure = true
      }

      if (!shouldRemeasure) {
        return
      }

      syncScrollableTableWrapState()
      virtualizerResult.remeasureMountedSegments()
      requestAnimationFrame(() => {
        syncScrollableTableWrapState()
        virtualizerResult.remeasureMountedSegments()
      })
    }, [engine.renderedSegments, syncScrollableTableWrapState, virtualizerResult])

    // Search query change effect：搜索查询变化时重新执行搜索，更新高亮和匹配计数
    useEffect(() => {
      if (!textSearch.isOpen) return
      const contentEl = getSearchContentElement()
      if (contentEl) {
        textSearch.search(contentEl, textSearch.query)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [textSearch.query])

    // Search open effect：搜索栏打开后自动聚焦输入框，已有查询内容则选中文本方便替换
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
      // 首次挂载只记录初始缩放级别，不执行 settle
      if (!hasMountedZoomRef.current) {
        hasMountedZoomRef.current = true
        previousZoomLevelRef.current = zoomLevel
        return
      }

      // 缩放级别未变化则跳过，防止同一值重复触发 settle
      const prevLevel = previousZoomLevelRef.current
      if (prevLevel === zoomLevel) {
        return
      }

      previousZoomLevelRef.current = zoomLevel

      // 生成新的运行 ID，150ms 防抖期间再次缩放则旧 ID 失效，避免旧回调执行
      const zoomSettleRunId = zoomSettleRunIdRef.current + 1
      zoomSettleRunIdRef.current = zoomSettleRunId

      if (zoomSettleTimerRef.current !== null) clearTimeout(zoomSettleTimerRef.current)
      zoomSettleTimerRef.current = setTimeout(() => {
        // 防抖期间有新的缩放请求则跳过
        if (zoomSettleRunIdRef.current !== zoomSettleRunId) {
          return
        }
        zoomSettleTimerRef.current = null
        // 执行最终缩放重测，回调中先按当前锚点滚动，再同步表格并二次修正滚动位置
        virtualizerResult.finalizeZoomRemeasure((container) => {
          // 每次回调前都检查运行 ID，确保只有最新的缩放 settle 生效
          if (zoomSettleRunIdRef.current !== zoomSettleRunId) {
            return
          }
          const currentAnchor = zoomAnchor.getAnchor()
          // 第一次滚动修正：基于虚拟器重测前的锚点位置
          if (container && currentAnchor) {
            scrollToVirtualZoomAnchor(
              container,
              virtualizerResult.virtualizer,
              currentAnchor,
              renderedSegmentsForZoomRef.current
            )
          }
          // 同步表格布局后再次滚动修正，确保表格尺寸变化不影响锚点位置
          syncTablesAndRemeasure(() => {
            if (zoomSettleRunIdRef.current !== zoomSettleRunId) {
              return
            }
            const settledContainer = scrollContainerRef.current
            const settledAnchor = zoomAnchor.getAnchor()
            // 第二次滚动修正：表格同步后布局已稳定，重新计算滚动位置
            if (settledContainer && settledAnchor) {
              scrollToVirtualZoomAnchor(
                settledContainer,
                virtualizerResult.virtualizer,
                settledAnchor,
                renderedSegmentsForZoomRef.current
              )
            }
            // 持久化阅读进度，标记缩放结束
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
      // 加载中或内容为空时不需要检查表格 overflow 状态
      if (loading || !hasContent) {
        return
      }

      syncScrollableTableWrapState()
    }, [engine.renderedSegments, loading, hasContent, syncScrollableTableWrapState])

    // 实时同步公式拖选高亮：监听容器内的鼠标拖动事件，在 KaTeX 公式上同步选区高亮
    useEffect(() => {
      const container = scrollContainerRef.current
      if (!container) return

      const cleanup = syncFormulaSelectionOnDrag(container)
      return cleanup
    }, [content, paperId])

    // Keyboard & pointer listeners：在 document 层监听，确保点击外部区域时能正确取消选区
    useEffect(() => {
      document.addEventListener('mousedown', composer.handleDocumentPointerDown)
      document.addEventListener('keydown', handleDocumentKeyDown)
      return () => {
        document.removeEventListener('mousedown', composer.handleDocumentPointerDown)
        document.removeEventListener('keydown', handleDocumentKeyDown)
      }
    }, [composer.handleDocumentPointerDown, handleDocumentKeyDown])

    // 窗口尺寸变化时重新检查表格溢出状态并触发虚拟项重测
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

    // 组件卸载时清理 TOC、搜索状态和批注编辑器，避免跨论文实例的状态残留
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
