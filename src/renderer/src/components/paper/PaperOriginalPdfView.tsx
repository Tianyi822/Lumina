import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type { PaperPageAsset } from '@shared/types/paper'
import { buildBase64DataUrl } from '@shared/utils'
import { useZoomAnchor } from './composables/useZoomAnchor'
import styles from './PaperOriginalPdfView.module.css'

interface PaperOriginalPdfViewProps {
  paperId: string
  pageAssets?: PaperPageAsset[]
  pageCount?: number
}

interface OriginalPdfPage {
  pageIndex: number
  width: number
  height: number
  imageMimeType: string
  available: boolean
}

interface PageLoadState {
  status: 'idle' | 'loading' | 'loaded' | 'error'
  dataUrl?: string
  error?: string
}

export default function PaperOriginalPdfView({
  paperId,
  pageAssets,
  pageCount
}: PaperOriginalPdfViewProps) {
  const originalPdfZoomLevel = usePaperReaderStore((state) => state.originalPdfZoomLevel ?? 1.0)
  const setOriginalPdfScrollPosition = usePaperReaderStore(
    (state) => state.setOriginalPdfScrollPosition
  )
  const getOriginalPdfScrollPosition = usePaperReaderStore(
    (state) => state.getOriginalPdfScrollPosition
  )
  const handleWheelZoom = usePaperReaderStore((state) => state.handleWheelZoom)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [pageStates, setPageStates] = useState<Record<number, PageLoadState>>({})
  const pageElementsRef = useRef<Map<number, HTMLElement>>(new Map())
  const observedPageIndexesRef = useRef<Set<number>>(new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const isMountedRef = useRef(false)
  const paperIdRef = useRef(paperId)
  paperIdRef.current = paperId

  const zoomAnchorRef = useRef(useZoomAnchor())
  const zoomAnchor = zoomAnchorRef.current

  // Zoom settle timer
  const zoomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMountedZoomRef = useRef(false)
  const previousOriginalPdfZoomLevelRef = useRef(originalPdfZoomLevel)

  // useLayoutEffect 确保在浏览器绘制前同步修正滚动位置
  useLayoutEffect(() => {
    if (!hasMountedZoomRef.current) {
      hasMountedZoomRef.current = true
      previousOriginalPdfZoomLevelRef.current = originalPdfZoomLevel
      return
    }

    if (previousOriginalPdfZoomLevelRef.current === originalPdfZoomLevel) {
      return
    }

    previousOriginalPdfZoomLevelRef.current = originalPdfZoomLevel

    const container = scrollContainerRef.current
    if (!container) return

    if (!zoomAnchor.isZooming()) {
      zoomAnchor.beginZoom(container)
    }

    // 强制同步布局重计算
    void container.offsetHeight

    // 同步修正滚动位置（在浏览器绘制前完成，消除抖动）
    zoomAnchor.applyZoomFrame(container)

    if (zoomSettleTimerRef.current !== null) clearTimeout(zoomSettleTimerRef.current)
    zoomSettleTimerRef.current = setTimeout(() => {
      zoomSettleTimerRef.current = null
      zoomAnchor.endZoom()
    }, 150)
  }, [originalPdfZoomLevel, zoomAnchor])

  const originalPages = useMemo<OriginalPdfPage[]>(() => {
    const assets = [...(pageAssets || [])].sort((a, b) => a.pageIndex - b.pageIndex)
    const assetByIndex = new Map(assets.map((asset) => [asset.pageIndex, asset]))
    const totalPages = Math.max(pageCount || 0, assets.length)

    return Array.from({ length: totalPages }, (_, pageIndex) => {
      const asset = assetByIndex.get(pageIndex)
      const width = asset?.sourceWidth || asset?.imageWidth || 612
      const height = asset?.sourceHeight || asset?.imageHeight || 792

      return {
        pageIndex,
        width: Math.max(width, 1),
        height: Math.max(height, 1),
        imageMimeType: asset?.imageMimeType || 'image/jpeg',
        available: !!asset
      }
    })
  }, [pageAssets, pageCount])

  const pageSignature = useMemo(() => {
    return originalPages
      .map((page) => `${page.pageIndex}:${page.width}:${page.height}:${page.available}`)
      .join('|')
  }, [originalPages])

  const contentZoomStyle = useMemo(
    () => ({
      zoom: originalPdfZoomLevel
    }),
    [originalPdfZoomLevel]
  )

  const hasPages = originalPages.length > 0

  // Scroll position recording
  const scrollRafIdRef = useRef<number | null>(null)

  const recordScrollPosition = useCallback(() => {
    if (!paperIdRef.current || !scrollContainerRef.current || zoomAnchor.isZooming()) {
      return
    }

    if (scrollRafIdRef.current !== null) {
      return
    }

    scrollRafIdRef.current = requestAnimationFrame(() => {
      scrollRafIdRef.current = null
      if (!paperIdRef.current || !scrollContainerRef.current) return
      setOriginalPdfScrollPosition(paperIdRef.current, {
        scrollTop: scrollContainerRef.current.scrollTop,
        scrollLeft: scrollContainerRef.current.scrollLeft
      })
    })
  }, [setOriginalPdfScrollPosition, zoomAnchor])

  const restoreScrollPosition = useCallback(
    async (targetPaperId: string) => {
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

  function getPageState(pageIndex: number): PageLoadState {
    return pageStates[pageIndex] || { status: 'idle' }
  }

  function setPageState(pageIndex: number, state: PageLoadState): void {
    setPageStates((prev) => ({
      ...prev,
      [pageIndex]: state
    }))
  }

  function findPage(pageIndex: number): OriginalPdfPage | undefined {
    return originalPages.find((page) => page.pageIndex === pageIndex)
  }

  const loadPage = useCallback(
    async (pageIndex: number): Promise<void> => {
      const page = findPage(pageIndex)
      if (!page) {
        return
      }

      const currentState = getPageState(pageIndex)
      if (currentState.status === 'loading' || currentState.status === 'loaded') {
        return
      }

      if (!page.available) {
        setPageState(pageIndex, {
          status: 'error',
          error: '页图不存在'
        })
        return
      }

      const targetPaperId = paperIdRef.current
      setPageState(pageIndex, { status: 'loading' })

      const result = await window.api.paper.getPageImage({
        paperId: targetPaperId,
        pageIndex
      })

      if (paperIdRef.current !== targetPaperId) {
        return
      }

      if (!result.success || !result.data) {
        setPageState(pageIndex, {
          status: 'error',
          error: result.error || '读取页图失败'
        })
        return
      }

      setPageState(pageIndex, {
        status: 'loaded',
        dataUrl: buildBase64DataUrl(result.data, page.imageMimeType)
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [originalPages]
  )

  // Observer management
  const disposeObserver = useCallback(() => {
    observerRef.current?.disconnect()
    observerRef.current = null
    observedPageIndexesRef.current.clear()
  }, [])

  const createObserver = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      !('IntersectionObserver' in window) ||
      !scrollContainerRef.current
    ) {
      return
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue
          }

          const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex)
          if (!Number.isInteger(pageIndex)) {
            continue
          }

          observerRef.current?.unobserve(entry.target)
          observedPageIndexesRef.current.delete(pageIndex)
          void loadPage(pageIndex)
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '900px 0px',
        threshold: 0.01
      }
    )
  }, [loadPage])

  const observePage = useCallback(
    (pageIndex: number, element: HTMLElement) => {
      if (!observerRef.current || observedPageIndexesRef.current.has(pageIndex)) {
        return
      }

      const state = getPageState(pageIndex)
      if (state.status === 'loading' || state.status === 'loaded') {
        return
      }

      observerRef.current.observe(element)
      observedPageIndexesRef.current.add(pageIndex)
    },
    [pageStates]
  )

  const refreshObservedPages = useCallback(() => {
    if (!observerRef.current) {
      return
    }

    for (const [pageIndex, element] of pageElementsRef.current.entries()) {
      observePage(pageIndex, element)
    }
  }, [observePage])

  const resetPageLoading = useCallback(async () => {
    setPageStates({})
    disposeObserver()
    // Wait for React to re-render
    await new Promise((resolve) => setTimeout(resolve, 0))
    createObserver()

    // Load first 2 pages immediately
    for (const page of originalPages.slice(0, 2)) {
      void loadPage(page.pageIndex)
    }

    if (!observerRef.current) {
      // No IntersectionObserver, load all pages
      for (const page of originalPages.slice(2)) {
        void loadPage(page.pageIndex)
      }
      await restoreScrollPosition(paperIdRef.current)
      return
    }

    refreshObservedPages()
    await restoreScrollPosition(paperIdRef.current)
  }, [
    originalPages,
    loadPage,
    disposeObserver,
    createObserver,
    refreshObservedPages,
    restoreScrollPosition
  ])

  // Reset when paper or pages change
  useEffect(() => {
    if (isMountedRef.current) {
      void resetPageLoading()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, pageSignature])

  // Initial mount
  useEffect(() => {
    isMountedRef.current = true
    void resetPageLoading()

    return () => {
      recordScrollPosition()
      isMountedRef.current = false
      disposeObserver()
      pageElementsRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setPageElement = useCallback(
    (pageIndex: number, element: HTMLElement | null) => {
      if (element) {
        pageElementsRef.current.set(pageIndex, element)
        observePage(pageIndex, element)
        return
      }

      const existingElement = pageElementsRef.current.get(pageIndex)
      if (existingElement && observerRef.current) {
        observerRef.current.unobserve(existingElement)
      }
      pageElementsRef.current.delete(pageIndex)
      observedPageIndexesRef.current.delete(pageIndex)
    },
    [observePage]
  )

  const getPageStyle = useCallback((page: OriginalPdfPage): React.CSSProperties => {
    return {
      '--paper-original-page-width': `${page.width}px`,
      '--paper-original-page-aspect': `${page.width} / ${page.height}`
    } as React.CSSProperties
  }, [])

  return (
    <div className={styles['paper-original-pdf-view']}>
      <div
        ref={scrollContainerRef}
        className={styles['paper-original-pdf-view__scroll']}
        onScroll={recordScrollPosition}
        onWheel={(e) => handleWheelZoom(e.nativeEvent)}
      >
        {!hasPages ? (
          <div className={styles['paper-original-pdf-view__empty']}>
            <p>暂无 PDF 原件页图</p>
          </div>
        ) : (
          <div className={styles['paper-original-pdf-view__content']} style={contentZoomStyle}>
            {originalPages.map((page) => {
              const state = getPageState(page.pageIndex)
              return (
                <section
                  key={page.pageIndex}
                  ref={(el) => setPageElement(page.pageIndex, el)}
                  className={styles['paper-original-pdf-view__page']}
                  style={getPageStyle(page)}
                  data-page-index={page.pageIndex}
                >
                  {state.status === 'loaded' && state.dataUrl ? (
                    <img
                      className={styles['paper-original-pdf-view__image']}
                      src={state.dataUrl}
                      alt={`第 ${page.pageIndex + 1} 页原件`}
                    />
                  ) : state.status === 'error' ? (
                    <div
                      className={[
                        styles['paper-original-pdf-view__state'],
                        styles['paper-original-pdf-view__state--error']
                      ].join(' ')}
                    >
                      {state.error}
                    </div>
                  ) : (
                    <div className={styles['paper-original-pdf-view__state']}>
                      正在加载第 {page.pageIndex + 1} 页
                    </div>
                  )}

                  <div className={styles['paper-original-pdf-view__page-number']}>
                    {page.pageIndex + 1}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
