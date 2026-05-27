import { useCallback, useEffect, useRef, useState } from 'react'

const CONTENT_HEIGHT_TRANSITION_MS = 220
const CONTENT_HEIGHT_TRANSITION_FALLBACK_MS = CONTENT_HEIGHT_TRANSITION_MS + 80

export interface ContentHeightAnimationAPI {
  creatorRef: React.RefObject<HTMLDivElement | null>
  contentShellRef: React.RefObject<HTMLDivElement | null>
  contentInnerRef: React.RefObject<HTMLDivElement | null>
  isContentMeasured: boolean
  isContentVisible: boolean
  isContentHeightTransitioning: boolean
  handleContentShellTransitionEnd: (event: React.TransitionEvent<HTMLDivElement>) => void
  requestHeightTransition: () => void
}

export function useContentHeightAnimation(visible: boolean): ContentHeightAnimationAPI {
  const [isContentMeasured, setIsContentMeasured] = useState(false)
  const [isContentVisible, setIsContentVisible] = useState(true)
  const [isContentHeightTransitioning, setIsContentHeightTransitioning] = useState(false)
  const creatorRef = useRef<HTMLDivElement | null>(null)
  const contentShellRef = useRef<HTMLDivElement | null>(null)
  const contentInnerRef = useRef<HTMLDivElement | null>(null)
  const contentResizeObserverRef = useRef<ResizeObserver | null>(null)
  const contentResizeFrameRef = useRef<number | null>(null)
  const contentHeightFrameRef = useRef<number | null>(null)
  const contentTransitionTimerRef = useRef<number | null>(null)
  const pendingContentVisibleRef = useRef(false)

  const clearContentHeightFrame = useCallback((): void => {
    if (contentHeightFrameRef.current !== null) {
      window.cancelAnimationFrame(contentHeightFrameRef.current)
      contentHeightFrameRef.current = null
    }
  }, [])

  const clearContentResizeFrame = useCallback((): void => {
    if (contentResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(contentResizeFrameRef.current)
      contentResizeFrameRef.current = null
    }
  }, [])

  const clearContentTransitionTimer = useCallback((): void => {
    if (contentTransitionTimerRef.current !== null) {
      window.clearTimeout(contentTransitionTimerRef.current)
      contentTransitionTimerRef.current = null
    }
  }, [])

  const readCreatorContentAvailableHeight = useCallback((): number => {
    const creator = creatorRef.current
    const shell = contentShellRef.current
    if (!creator || !shell) return Number.POSITIVE_INFINITY

    const creatorStyles = window.getComputedStyle(creator)
    const creatorRect = creator.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const maxHeightValue = creatorStyles.maxHeight
    const maxCreatorHeight = maxHeightValue.endsWith('vh')
      ? (window.innerHeight * Number.parseFloat(maxHeightValue)) / 100
      : Number.parseFloat(maxHeightValue)
    const creatorHeightLimit = Number.isFinite(maxCreatorHeight)
      ? maxCreatorHeight
      : creator.clientHeight
    const shellTop = shellRect.top - creatorRect.top

    return Math.max(1, Math.floor(creatorHeightLimit - shellTop))
  }, [])

  const setCreatorContentHeight = useCallback(
    (height: number): void => {
      const shell = contentShellRef.current
      if (!shell || height <= 0) return

      setIsContentMeasured(true)
      shell.style.height = `${Math.min(height, readCreatorContentAvailableHeight())}px`
    },
    [readCreatorContentAvailableHeight]
  )

  const readCreatorContentHeight = useCallback((): number => {
    const shell = contentShellRef.current
    const inner = contentInnerRef.current
    if (!inner) return 0
    if (!shell) return Math.ceil(inner.scrollHeight)

    const availableHeight = readCreatorContentAvailableHeight()
    const previousShellHeight = shell.style.height
    const previousShellOverflow = shell.style.overflow
    const previousShellTransition = shell.style.transition
    const previousInnerMaxHeight = inner.style.maxHeight
    const previousInnerOverflowY = inner.style.overflowY

    try {
      shell.style.height = 'auto'
      shell.style.overflow = 'visible'
      shell.style.transition = 'none'
      inner.style.maxHeight = 'none'
      inner.style.overflowY = 'visible'

      return Math.min(Math.ceil(inner.scrollHeight), availableHeight)
    } finally {
      shell.style.height = previousShellHeight
      shell.style.overflow = previousShellOverflow
      shell.style.transition = previousShellTransition
      inner.style.maxHeight = previousInnerMaxHeight
      inner.style.overflowY = previousInnerOverflowY
    }
  }, [readCreatorContentAvailableHeight])

  const lockCreatorContentHeight = useCallback((): void => {
    const shell = contentShellRef.current
    if (!shell) return

    setCreatorContentHeight(Math.ceil(shell.offsetHeight))
    void shell.offsetHeight
  }, [setCreatorContentHeight])

  const animateCreatorContentHeightTo = useCallback(
    (nextHeight: number): void => {
      clearContentHeightFrame()
      contentHeightFrameRef.current = window.requestAnimationFrame(() => {
        contentHeightFrameRef.current = null
        setCreatorContentHeight(nextHeight)
      })
    },
    [clearContentHeightFrame, setCreatorContentHeight]
  )

  const finishPendingContentTransition = useCallback((): void => {
    if (!pendingContentVisibleRef.current) return

    pendingContentVisibleRef.current = false
    setIsContentHeightTransitioning(false)
    setIsContentVisible(true)
    clearContentTransitionTimer()
  }, [clearContentTransitionTimer])

  const syncCreatorContentHeight = useCallback((): void => {
    const nextHeight = readCreatorContentHeight()
    if (nextHeight <= 0) return

    lockCreatorContentHeight()
    animateCreatorContentHeightTo(nextHeight)
  }, [animateCreatorContentHeightTo, lockCreatorContentHeight, readCreatorContentHeight])

  const observeCreatorContent = useCallback((): void => {
    contentResizeObserverRef.current?.disconnect()
    clearContentResizeFrame()

    if (typeof ResizeObserver === 'undefined' || !contentInnerRef.current) return

    contentResizeObserverRef.current = new ResizeObserver(() => {
      if (!visible || !isContentVisible || isContentHeightTransitioning) return
      if (contentResizeFrameRef.current !== null) return

      contentResizeFrameRef.current = window.requestAnimationFrame(() => {
        contentResizeFrameRef.current = null
        syncCreatorContentHeight()
      })
    })
    contentResizeObserverRef.current.observe(contentInnerRef.current)
  }, [
    clearContentResizeFrame,
    isContentHeightTransitioning,
    isContentVisible,
    syncCreatorContentHeight,
    visible
  ])

  const initializeCreatorContentHeight = useCallback((): void => {
    clearContentHeightFrame()
    contentHeightFrameRef.current = window.requestAnimationFrame(() => {
      contentHeightFrameRef.current = window.requestAnimationFrame(() => {
        contentHeightFrameRef.current = null
        observeCreatorContent()
        syncCreatorContentHeight()
        setIsContentVisible(true)
      })
    })
  }, [clearContentHeightFrame, observeCreatorContent, syncCreatorContentHeight])

  const transitionCreatorContentHeight = useCallback((): void => {
    if (!visible) return

    setIsContentHeightTransitioning(true)
    pendingContentVisibleRef.current = false
    clearContentTransitionTimer()
    clearContentHeightFrame()
    lockCreatorContentHeight()

    contentHeightFrameRef.current = window.requestAnimationFrame(() => {
      contentHeightFrameRef.current = window.requestAnimationFrame(() => {
        contentHeightFrameRef.current = null
        const nextHeight = readCreatorContentHeight()
        if (nextHeight <= 0) {
          setIsContentHeightTransitioning(false)
          return
        }

        setIsContentVisible(false)
        pendingContentVisibleRef.current = true
        void contentShellRef.current?.offsetHeight
        animateCreatorContentHeightTo(nextHeight)
        contentTransitionTimerRef.current = window.setTimeout(
          finishPendingContentTransition,
          CONTENT_HEIGHT_TRANSITION_FALLBACK_MS
        )
      })
    })
  }, [
    animateCreatorContentHeightTo,
    clearContentHeightFrame,
    clearContentTransitionTimer,
    finishPendingContentTransition,
    lockCreatorContentHeight,
    readCreatorContentHeight,
    visible
  ])

  const handleContentShellTransitionEnd = useCallback(
    (event: React.TransitionEvent<HTMLDivElement>): void => {
      if (
        event.target !== contentShellRef.current ||
        event.propertyName !== 'height' ||
        !isContentHeightTransitioning
      ) {
        return
      }

      setIsContentHeightTransitioning(false)

      if (pendingContentVisibleRef.current) {
        finishPendingContentTransition()
        return
      }

      clearContentTransitionTimer()
    },
    [clearContentTransitionTimer, finishPendingContentTransition, isContentHeightTransitioning]
  )

  const requestHeightTransition = useCallback((): void => {
    transitionCreatorContentHeight()
  }, [transitionCreatorContentHeight])

  // 初始化内容区高度
  useEffect(() => {
    if (visible) {
      initializeCreatorContentHeight()
    }
  }, [initializeCreatorContentHeight, visible])

  // 关闭时重置测量状态，确保重新打开时先测量再过渡
  useEffect(() => {
    if (!visible) {
      setIsContentMeasured(false)
      setIsContentVisible(false)
    }
  }, [visible])

  // 清理所有 observer 和定时器
  useEffect(() => {
    return () => {
      contentResizeObserverRef.current?.disconnect()
      clearContentHeightFrame()
      clearContentResizeFrame()
      clearContentTransitionTimer()
    }
  }, [clearContentHeightFrame, clearContentResizeFrame, clearContentTransitionTimer])

  return {
    creatorRef,
    contentShellRef,
    contentInnerRef,
    isContentMeasured,
    isContentVisible,
    isContentHeightTransitioning,
    handleContentShellTransitionEnd,
    requestHeightTransition
  }
}
