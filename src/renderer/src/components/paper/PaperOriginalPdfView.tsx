import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask
} from 'pdfjs-dist'
import { usePaperViewStore } from '@renderer/stores/paper'
import { useZoomAnchor } from './composables/useZoomAnchor'
import styles from './PaperOriginalPdfView.module.css'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

interface PaperOriginalPdfViewProps {
  paperId: string
}

interface PdfPageInfo {
  pageIndex: number
  width: number
  height: number
}

interface PageRenderState {
  status: 'idle' | 'loading' | 'rendered' | 'error'
  renderScale?: number
  error?: string
}

type PdfDocumentState = { status: 'idle' | 'loading' | 'ready' | 'error'; error?: string }

const PDF_RENDER_SCALE_MAX = 3
const PDF_ZOOM_SETTLE_DELAY_MS = 140
const PDF_OBSERVER_ROOT_MARGIN = '960px 0px'

function buildSourcePdfUrl(targetPaperId: string): string {
  return `lumina://paper/${targetPaperId}/source.pdf`
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRenderCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException'
}

function getRenderScale(zoomLevel: number): number {
  // 结合 zoom 级别和设备像素比计算渲染分辨率，限制在 [0.5, 3] 范围内
  const pixelRatio =
    typeof window === 'undefined' ? 1 : Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
  return Math.min(PDF_RENDER_SCALE_MAX, Math.max(0.5, zoomLevel * pixelRatio))
}

/** PDF 原件查看器组件，使用 pdfjs-dist 渲染 PDF 页面，支持缩放、滚动持久化和 IntersectionObserver 懒渲染 */
export default function PaperOriginalPdfView({ paperId }: PaperOriginalPdfViewProps) {
  const zoomLevel = usePaperViewStore((state) => state.zoomLevel)
  const handleWheelZoom = usePaperViewStore((state) => state.handleWheelZoom)
  const setOriginalPdfScrollPosition = usePaperViewStore(
    (state) => state.setOriginalPdfScrollPosition
  )
  const getOriginalPdfScrollPosition = usePaperViewStore(
    (state) => state.getOriginalPdfScrollPosition
  )

  const [documentState, setDocumentState] = useState<PdfDocumentState>({ status: 'idle' })
  const [pages, setPages] = useState<PdfPageInfo[]>([])
  const [pageStates, setPageStates] = useState<Record<number, PageRenderState>>({})

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null)
  const canvasElementsRef = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const pageElementsRef = useRef<Map<number, HTMLElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const visiblePageIndexesRef = useRef<Set<number>>(new Set())
  const renderTasksRef = useRef<Map<number, RenderTask>>(new Map())
  const pageStatesRef = useRef<Record<number, PageRenderState>>({})
  const pagesRef = useRef<PdfPageInfo[]>([])
  const paperIdRef = useRef(paperId)
  const zoomLevelRef = useRef(zoomLevel)
  // zoomAnchor: 负责缩放时保持视口中心锚定的工具对象
  const zoomAnchorRef = useRef(useZoomAnchor())
  // 记录上一次 zoomLevel，用于在 useLayoutEffect 中计算缩放比例差
  const previousZoomLevelRef = useRef(zoomLevel)
  const hasMountedZoomRef = useRef(false)
  // 缩放防抖定时器：缩放结束后才执行 scrollPosition 持久化
  const zoomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 缩放后延迟触发页面重渲染的定时器
  const zoomRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // requestAnimationFrame 句柄，用于节流滚动位置记录
  const scrollRafIdRef = useRef<number | null>(null)

  const zoomAnchor = zoomAnchorRef.current
  paperIdRef.current = paperId
  zoomLevelRef.current = zoomLevel
  pagesRef.current = pages

  const sourcePdfUrl = useMemo(() => {
    if (!paperId) {
      return ''
    }

    return buildSourcePdfUrl(paperId)
  }, [paperId])

  // 取消所有正在进行的 PDF 页面渲染任务（RenderingCancelledException 会被 renderPage 静默忽略）
  const cancelRenderTasks = useCallback(() => {
    for (const task of renderTasksRef.current.values()) {
      task.cancel()
    }
    renderTasksRef.current.clear()
  }, [])

  // 同步更新 pageStates（触发 React 重渲染）和 pageStatesRef（供异步回调读取最新值，避免闭包过期）
  const setPageRenderState = useCallback((pageIndex: number, state: PageRenderState) => {
    setPageStates((prev) => {
      const next = {
        ...prev,
        [pageIndex]: state
      }
      pageStatesRef.current = next
      return next
    })
  }, [])

  // 渲染指定 PDF 页到 Canvas 上。通过 pageStatesRef 判断跳过条件以避免重复渲染
  const renderPage = useCallback(
    async (page: PdfPageInfo, renderScale = getRenderScale(zoomLevelRef.current)) => {
      const pdfDocument = pdfDocumentRef.current
      const canvas = canvasElementsRef.current.get(page.pageIndex)
      if (!pdfDocument || !canvas) {
        return
      }

      // 如果当前页已在相同 scale 下渲染中或已完成，跳过此请求
      const currentState = pageStatesRef.current[page.pageIndex]
      if (
        currentState?.renderScale === renderScale &&
        (currentState.status === 'loading' || currentState.status === 'rendered')
      ) {
        return
      }

      // 取消该页可能正在进行的旧渲染任务，标记为 loading
      renderTasksRef.current.get(page.pageIndex)?.cancel()
      setPageRenderState(page.pageIndex, { status: 'loading', renderScale })

      let renderTask: RenderTask | null = null
      try {
        // 获取 PDF 页（pdfjs 中 pageIndex 从 1 开始，所以 +1）
        const pdfPage = await pdfDocument.getPage(page.pageIndex + 1)
        // 文档已切换，丢弃本次渲染结果
        if (pdfDocumentRef.current !== pdfDocument) {
          return
        }

        const viewport = pdfPage.getViewport({ scale: renderScale })
        const canvasContext = canvas.getContext('2d', {
          alpha: false,
          willReadFrequently: false
        })
        if (!canvasContext) {
          throw new Error('创建 Canvas 2D 上下文失败')
        }

        // 仅在尺寸变化时更新 Canvas 大小，避免不必要的重设
        const nextWidth = Math.max(1, Math.floor(viewport.width))
        const nextHeight = Math.max(1, Math.floor(viewport.height))
        if (canvas.width !== nextWidth) {
          canvas.width = nextWidth
        }
        if (canvas.height !== nextHeight) {
          canvas.height = nextHeight
        }

        // 开始渲染并追踪 renderTask，支持后续取消
        renderTask = pdfPage.render({
          canvas,
          canvasContext,
          viewport
        })
        renderTasksRef.current.set(page.pageIndex, renderTask)
        await renderTask.promise

        // 渲染完成，清理 task 引用；如果已经被新的渲染替换则跳过
        if (renderTasksRef.current.get(page.pageIndex) === renderTask) {
          renderTasksRef.current.delete(page.pageIndex)
        }
        // 文档已切换，丢弃结果
        if (pdfDocumentRef.current !== pdfDocument) {
          return
        }

        setPageRenderState(page.pageIndex, { status: 'rendered', renderScale })
      } catch (error) {
        // 清理已取消的 renderTask 引用
        if (renderTask && renderTasksRef.current.get(page.pageIndex) === renderTask) {
          renderTasksRef.current.delete(page.pageIndex)
        }
        // 主动取消或文档切换导致的不视为错误，静默返回
        if (isRenderCancelled(error) || pdfDocumentRef.current !== pdfDocument) {
          return
        }

        setPageRenderState(page.pageIndex, {
          status: 'error',
          renderScale,
          error: formatError(error)
        })
      }
    },
    [setPageRenderState]
  )

  const renderPageByIndex = useCallback(
    (pageIndex: number) => {
      // 从 pagesRef 查找页信息，避免闭包依赖 pages 变化
      const page = pagesRef.current[pageIndex]
      if (!page) {
        return
      }

      void renderPage(page)
    },
    [renderPage]
  )

  // 渲染所有当前处于可见区域的页面；如果没有可见页则默认渲染第 0 页
  const renderVisiblePages = useCallback(() => {
    const visibleIndexes = Array.from(visiblePageIndexesRef.current)
    const indexes = visibleIndexes.length > 0 ? visibleIndexes : [0]
    for (const pageIndex of indexes) {
      renderPageByIndex(pageIndex)
    }
  }, [renderPageByIndex])

  // 立即将当前滚动位置持久化到 store（用于跨会话恢复）
  const persistScrollPositionNow = useCallback(() => {
    const container = scrollContainerRef.current
    if (!paperIdRef.current || !container) {
      return
    }

    setOriginalPdfScrollPosition(paperIdRef.current, {
      scrollTop: container.scrollTop,
      scrollLeft: container.scrollLeft
    })
  }, [setOriginalPdfScrollPosition])

  // 通过 requestAnimationFrame 节流记录滚动位置，缩放到来时不记录
  const recordScrollPosition = useCallback(() => {
    if (!paperIdRef.current || !scrollContainerRef.current || zoomAnchor.isZooming()) {
      return
    }

    // 已有待执行的 RAF 帧，跳过本次请求
    if (scrollRafIdRef.current !== null) {
      return
    }

    scrollRafIdRef.current = requestAnimationFrame(() => {
      scrollRafIdRef.current = null
      // RAF 执行时再次检查，防止缩放刚好结束导致记录错位
      if (zoomAnchor.isZooming()) {
        return
      }

      persistScrollPositionNow()
    })
  }, [persistScrollPositionNow, zoomAnchor])

  // 在下一个帧恢复之前保存的滚动位置（等待 DOM 布局稳定后再跳转）
  const restoreScrollPosition = useCallback(
    (targetPaperId: string) => {
      const position = getOriginalPdfScrollPosition(targetPaperId)
      if (!position) {
        return
      }

      requestAnimationFrame(() => {
        // 用户可能已切换到其他论文，此时不恢复
        if (paperIdRef.current !== targetPaperId || !scrollContainerRef.current) {
          return
        }

        scrollContainerRef.current.scrollTop = position.scrollTop
        scrollContainerRef.current.scrollLeft = position.scrollLeft
      })
    },
    [getOriginalPdfScrollPosition]
  )

  // 管理 canvas DOM 引用的 Map：渲染时可快速通过 pageIndex 获取 canvas
  const setCanvasElement = useCallback((pageIndex: number, element: HTMLCanvasElement | null) => {
    if (element) {
      canvasElementsRef.current.set(pageIndex, element)
      return
    }

    canvasElementsRef.current.delete(pageIndex)
  }, [])

  // 管理页面 DOM 元素 + IntersectionObserver 观察：卸载旧元素、为新元素注册观察
  const setPageElement = useCallback((pageIndex: number, element: HTMLElement | null) => {
    // 如果该页已有元素，先取消 observer 监听
    const existingElement = pageElementsRef.current.get(pageIndex)
    if (existingElement && observerRef.current) {
      observerRef.current.unobserve(existingElement)
    }

    if (!element) {
      pageElementsRef.current.delete(pageIndex)
      visiblePageIndexesRef.current.delete(pageIndex)
      return
    }

    pageElementsRef.current.set(pageIndex, element)
    // 新元素加入 IntersectionObserver 可见性监听
    observerRef.current?.observe(element)
  }, [])

  // 通过 CSS 自定义属性控制页面宽高，使 zoomLevel 变化时所有页尺寸联动
  const getPageStyle = useCallback(
    (page: PdfPageInfo): CSSProperties =>
      ({
        '--paper-original-page-width': `${page.width * zoomLevel}px`,
        '--paper-original-page-height': `${page.height * zoomLevel}px`
      }) as CSSProperties,
    [zoomLevel]
  )

  // 保持 pageStatesRef 与 state 同步，供异步回调读取最新渲染状态
  useEffect(() => {
    pageStatesRef.current = pageStates
  }, [pageStates])

  // 核心 useEffect：监听 sourcePdfUrl 变化，加载 PDF 文档并提取所有页信息
  useEffect(() => {
    // sourcePdfUrl 为空时重置所有状态到初始值
    if (!sourcePdfUrl) {
      cancelRenderTasks()
      void pdfDocumentRef.current?.destroy()
      pdfDocumentRef.current = null
      setPages([])
      setPageStates({})
      pageStatesRef.current = {}
      setDocumentState({ status: 'idle' })
      return
    }

    let cancelled = false
    let loadingTask: ReturnType<typeof getDocument> | null = null

    // 加载新 PDF 前：清理旧文档、渲染任务、页面引用和 observer
    cancelRenderTasks()
    void pdfDocumentRef.current?.destroy()
    pdfDocumentRef.current = null
    canvasElementsRef.current.clear()
    pageElementsRef.current.clear()
    visiblePageIndexesRef.current.clear()
    observerRef.current?.disconnect()
    observerRef.current = null
    setPages([])
    setPageStates({})
    pageStatesRef.current = {}
    setDocumentState({ status: 'loading' })

    const loadPdf = async (): Promise<void> => {
      try {
        // 通过 fetch 获取 PDF 二进制数据（走 lumina:// 协议自定义拦截）
        const response = await fetch(sourcePdfUrl)
        if (!response.ok) {
          throw new Error(`PDF 请求失败: ${response.status}`)
        }

        const source = await response.arrayBuffer()
        // 使用 pdfjs-dist 的 getDocument 解析 PDF
        loadingTask = getDocument({
          data: new Uint8Array(source),
          useSystemFonts: true,
          useWorkerFetch: false
        })

        const pdfDocument = await loadingTask.promise
        loadingTask = null
        // 组件已卸载或 URL 已变化，丢弃结果
        if (cancelled) {
          void pdfDocument.destroy()
          return
        }

        // 遍历所有页，提取原始尺寸信息（scale=1，缩放由 CSS + renderScale 控制）
        const nextPages: PdfPageInfo[] = []
        for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
          const page = await pdfDocument.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1 })
          nextPages.push({
            pageIndex: pageNumber - 1,
            width: viewport.width,
            height: viewport.height
          })
        }

        // 再次检查取消状态
        if (cancelled) {
          void pdfDocument.destroy()
          return
        }

        pdfDocumentRef.current = pdfDocument
        setPages(nextPages)
        setDocumentState({ status: 'ready' })
      } catch (error) {
        if (cancelled) {
          return
        }

        pdfDocumentRef.current = null
        setPages([])
        setDocumentState({
          status: 'error',
          error: formatError(error)
        })
      }
    }

    void loadPdf()

    // 清理：标记取消，如 loadingTask 未完成则销毁以避免内存泄漏
    return () => {
      cancelled = true
      void loadingTask?.destroy()
    }
  }, [cancelRenderTasks, sourcePdfUrl])

  // IntersectionObserver：页面进入视口时触发渲染，离开时从可见集合移除
  useEffect(() => {
    if (documentState.status !== 'ready' || pages.length === 0) {
      return
    }

    const container = scrollContainerRef.current
    // 不支持 IntersectionObserver 时退化为全量渲染
    if (!container || typeof IntersectionObserver === 'undefined') {
      for (const page of pages) {
        void renderPage(page)
      }
      return
    }

    const visiblePageIndexes = visiblePageIndexesRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // 从 data-page-index 属性读取页面索引
          const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex)
          if (!Number.isInteger(pageIndex)) {
            continue
          }

          // 进入视口 → 加入可见集合并触发渲染；离开 → 移除
          if (entry.isIntersecting) {
            visiblePageIndexes.add(pageIndex)
            renderPageByIndex(pageIndex)
          } else {
            visiblePageIndexes.delete(pageIndex)
          }
        }
      },
      {
        root: container,
        // rootMargin 设为 960px 上下扩展，提前加载临近页面
        rootMargin: PDF_OBSERVER_ROOT_MARGIN,
        threshold: 0.01
      }
    )

    observerRef.current = observer
    // 为所有已注册的页面元素建立 observer 监听
    for (const element of pageElementsRef.current.values()) {
      observer.observe(element)
    }

    // 首次渲染可见页面（在下一帧执行，确保 DOM 布局完成）
    const initialRenderRafId = requestAnimationFrame(renderVisiblePages)

    return () => {
      cancelAnimationFrame(initialRenderRafId)
      observer.disconnect()
      if (observerRef.current === observer) {
        observerRef.current = null
      }
      visiblePageIndexes.clear()
    }
  }, [documentState.status, pages, renderPage, renderPageByIndex, renderVisiblePages])

  // PDF 就绪 + 页信息加载完成后恢复之前保存的滚动位置（跨会话记忆）
  useEffect(() => {
    if (documentState.status !== 'ready' || pages.length === 0) {
      return
    }

    restoreScrollPosition(paperId)
  }, [documentState.status, pages.length, paperId, restoreScrollPosition])

  useLayoutEffect(() => {
    if (!hasMountedZoomRef.current) {
      hasMountedZoomRef.current = true
      previousZoomLevelRef.current = zoomLevel
      return
    }

    const previousZoomLevel = previousZoomLevelRef.current
    if (previousZoomLevel === zoomLevel) {
      return
    }

    previousZoomLevelRef.current = zoomLevel

    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    if (!zoomAnchor.isZooming()) {
      const ratio = zoomLevel / previousZoomLevel
      container.scrollTop = container.scrollTop * ratio + (container.clientHeight / 2) * (ratio - 1)
      container.scrollLeft =
        container.scrollLeft * ratio + (container.clientWidth / 2) * (ratio - 1)
      zoomAnchor.beginZoom(container)
    }

    void container.offsetHeight
    zoomAnchor.applyZoomFrame(container)

    if (zoomSettleTimerRef.current !== null) {
      clearTimeout(zoomSettleTimerRef.current)
    }
    zoomSettleTimerRef.current = setTimeout(() => {
      zoomSettleTimerRef.current = null
      zoomAnchor.endZoom()
      recordScrollPosition()
    }, PDF_ZOOM_SETTLE_DELAY_MS)
  }, [recordScrollPosition, zoomAnchor, zoomLevel])

  useEffect(() => {
    if (documentState.status !== 'ready' || pages.length === 0) {
      return
    }

    if (zoomRenderTimerRef.current !== null) {
      clearTimeout(zoomRenderTimerRef.current)
    }
    zoomRenderTimerRef.current = setTimeout(() => {
      zoomRenderTimerRef.current = null
      renderVisiblePages()
    }, PDF_ZOOM_SETTLE_DELAY_MS)

    return () => {
      if (zoomRenderTimerRef.current !== null) {
        clearTimeout(zoomRenderTimerRef.current)
        zoomRenderTimerRef.current = null
      }
    }
  }, [documentState.status, pages.length, renderVisiblePages, zoomLevel])

  // 监听滚轮事件，交由 store 的 handleWheelZoom 处理缩放（Ctrl+滚轮）
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    const onWheel = (event: WheelEvent): void => {
      handleWheelZoom(event)
    }

    // passive: false 以允许在 wheel 处理中调用 preventDefault 阻止页面滚动
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [handleWheelZoom])

  useEffect(() => {
    // 组件卸载时：持久化滚动位置、取消渲染任务、销毁 PDF 文档、清除所有定时器
    return () => {
      persistScrollPositionNow()
      cancelRenderTasks()
      void pdfDocumentRef.current?.destroy()
      pdfDocumentRef.current = null
      if (zoomSettleTimerRef.current !== null) {
        clearTimeout(zoomSettleTimerRef.current)
      }
      if (zoomRenderTimerRef.current !== null) {
        clearTimeout(zoomRenderTimerRef.current)
      }
      if (scrollRafIdRef.current !== null) {
        cancelAnimationFrame(scrollRafIdRef.current)
      }
    }
  }, [cancelRenderTasks, persistScrollPositionNow])

  // 无 PDF URL 或加载出错时显示空状态/错误信息
  if (!sourcePdfUrl || documentState.status === 'error') {
    return (
      <div className={styles['paper-original-pdf-view']}>
        <div className={styles['paper-original-pdf-view__empty']}>
          <p>{sourcePdfUrl ? documentState.error || '加载 PDF 原件失败' : '未选择论文'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles['paper-original-pdf-view']}>
      <div className={styles['paper-original-pdf-view__top-fade']} aria-hidden="true" />
      <div className={styles['paper-original-pdf-view__chrome-top']} aria-hidden="true" />
      <div
        ref={scrollContainerRef}
        className={styles['paper-original-pdf-view__scroll']}
        onScroll={recordScrollPosition}
      >
        {/* pages 非空才渲染 PDF 页面内容 */}
      {pages.length > 0 && (
          <div className={styles['paper-original-pdf-view__content']}>
            {pages.map((page) => {
              const pageState = pageStates[page.pageIndex] || { status: 'idle' }
              return (
                <section
                  key={page.pageIndex}
                  ref={(element) => setPageElement(page.pageIndex, element)}
                  className={styles['paper-original-pdf-view__page']}
                  style={getPageStyle(page)}
                  data-page-index={page.pageIndex}
                >
                  <canvas
                    ref={(element) => setCanvasElement(page.pageIndex, element)}
                    className={styles['paper-original-pdf-view__canvas']}
                    role="img"
                    aria-label={`第 ${page.pageIndex + 1} 页 PDF 原件`}
                  />
                  {/* 页面级渲染失败时显示错误提示 */}
                  {pageState.status === 'error' && (
                    <div className={styles['paper-original-pdf-view__page-state']}>
                      {pageState.error || '页面渲染失败'}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* 文档整体加载中显示 loading 状态 */}
      {documentState.status === 'loading' && (
        <div className={styles['paper-original-pdf-view__loading']}>
          <p>正在加载 PDF 原件...</p>
        </div>
      )}
    </div>
  )
}
