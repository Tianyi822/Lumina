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
  const pixelRatio =
    typeof window === 'undefined' ? 1 : Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
  return Math.min(PDF_RENDER_SCALE_MAX, Math.max(0.5, zoomLevel * pixelRatio))
}

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
  const zoomAnchorRef = useRef(useZoomAnchor())
  const previousZoomLevelRef = useRef(zoomLevel)
  const hasMountedZoomRef = useRef(false)
  const zoomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoomRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const cancelRenderTasks = useCallback(() => {
    for (const task of renderTasksRef.current.values()) {
      task.cancel()
    }
    renderTasksRef.current.clear()
  }, [])

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

  const renderPage = useCallback(
    async (page: PdfPageInfo, renderScale = getRenderScale(zoomLevelRef.current)) => {
      const pdfDocument = pdfDocumentRef.current
      const canvas = canvasElementsRef.current.get(page.pageIndex)
      if (!pdfDocument || !canvas) {
        return
      }

      const currentState = pageStatesRef.current[page.pageIndex]
      if (
        currentState?.renderScale === renderScale &&
        (currentState.status === 'loading' || currentState.status === 'rendered')
      ) {
        return
      }

      renderTasksRef.current.get(page.pageIndex)?.cancel()
      setPageRenderState(page.pageIndex, { status: 'loading', renderScale })

      let renderTask: RenderTask | null = null
      try {
        const pdfPage = await pdfDocument.getPage(page.pageIndex + 1)
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

        const nextWidth = Math.max(1, Math.floor(viewport.width))
        const nextHeight = Math.max(1, Math.floor(viewport.height))
        if (canvas.width !== nextWidth) {
          canvas.width = nextWidth
        }
        if (canvas.height !== nextHeight) {
          canvas.height = nextHeight
        }

        renderTask = pdfPage.render({
          canvas,
          canvasContext,
          viewport
        })
        renderTasksRef.current.set(page.pageIndex, renderTask)
        await renderTask.promise

        if (renderTasksRef.current.get(page.pageIndex) === renderTask) {
          renderTasksRef.current.delete(page.pageIndex)
        }
        if (pdfDocumentRef.current !== pdfDocument) {
          return
        }

        setPageRenderState(page.pageIndex, { status: 'rendered', renderScale })
      } catch (error) {
        if (renderTask && renderTasksRef.current.get(page.pageIndex) === renderTask) {
          renderTasksRef.current.delete(page.pageIndex)
        }
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
      const page = pagesRef.current[pageIndex]
      if (!page) {
        return
      }

      void renderPage(page)
    },
    [renderPage]
  )

  const renderVisiblePages = useCallback(() => {
    const visibleIndexes = Array.from(visiblePageIndexesRef.current)
    const indexes = visibleIndexes.length > 0 ? visibleIndexes : [0]
    for (const pageIndex of indexes) {
      renderPageByIndex(pageIndex)
    }
  }, [renderPageByIndex])

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

  const recordScrollPosition = useCallback(() => {
    if (!paperIdRef.current || !scrollContainerRef.current || zoomAnchor.isZooming()) {
      return
    }

    if (scrollRafIdRef.current !== null) {
      return
    }

    scrollRafIdRef.current = requestAnimationFrame(() => {
      scrollRafIdRef.current = null
      if (zoomAnchor.isZooming()) {
        return
      }

      persistScrollPositionNow()
    })
  }, [persistScrollPositionNow, zoomAnchor])

  const restoreScrollPosition = useCallback(
    (targetPaperId: string) => {
      const position = getOriginalPdfScrollPosition(targetPaperId)
      if (!position) {
        return
      }

      requestAnimationFrame(() => {
        if (paperIdRef.current !== targetPaperId || !scrollContainerRef.current) {
          return
        }

        scrollContainerRef.current.scrollTop = position.scrollTop
        scrollContainerRef.current.scrollLeft = position.scrollLeft
      })
    },
    [getOriginalPdfScrollPosition]
  )

  const setCanvasElement = useCallback((pageIndex: number, element: HTMLCanvasElement | null) => {
    if (element) {
      canvasElementsRef.current.set(pageIndex, element)
      return
    }

    canvasElementsRef.current.delete(pageIndex)
  }, [])

  const setPageElement = useCallback((pageIndex: number, element: HTMLElement | null) => {
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
    observerRef.current?.observe(element)
  }, [])

  const getPageStyle = useCallback(
    (page: PdfPageInfo): CSSProperties =>
      ({
        '--paper-original-page-width': `${page.width * zoomLevel}px`,
        '--paper-original-page-height': `${page.height * zoomLevel}px`
      }) as CSSProperties,
    [zoomLevel]
  )

  useEffect(() => {
    pageStatesRef.current = pageStates
  }, [pageStates])

  useEffect(() => {
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
        const response = await fetch(sourcePdfUrl)
        if (!response.ok) {
          throw new Error(`PDF 请求失败: ${response.status}`)
        }

        const source = await response.arrayBuffer()
        loadingTask = getDocument({
          data: new Uint8Array(source),
          useSystemFonts: true,
          useWorkerFetch: false
        })

        const pdfDocument = await loadingTask.promise
        loadingTask = null
        if (cancelled) {
          void pdfDocument.destroy()
          return
        }

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

    return () => {
      cancelled = true
      void loadingTask?.destroy()
    }
  }, [cancelRenderTasks, sourcePdfUrl])

  useEffect(() => {
    if (documentState.status !== 'ready' || pages.length === 0) {
      return
    }

    const container = scrollContainerRef.current
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
          const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex)
          if (!Number.isInteger(pageIndex)) {
            continue
          }

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
        rootMargin: PDF_OBSERVER_ROOT_MARGIN,
        threshold: 0.01
      }
    )

    observerRef.current = observer
    for (const element of pageElementsRef.current.values()) {
      observer.observe(element)
    }

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

  useEffect(() => {
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

      {documentState.status === 'loading' && (
        <div className={styles['paper-original-pdf-view__loading']}>
          <p>正在加载 PDF 原件...</p>
        </div>
      )}
    </div>
  )
}
