import { useRef, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import type { PaperFigurePreviewRect } from '@renderer/stores/paperReaderStore'
import {
  PAPER_FIGURE_PREVIEW_MIN_HEIGHT,
  PAPER_FIGURE_PREVIEW_MIN_WIDTH
} from '@renderer/stores/paper/shared'
import styles from './PaperFigurePreview.module.css'

interface PointerState {
  clientX: number
  clientY: number
}

type ResizeEdge =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-right'
  | 'bottom-left'

interface ResizeState extends PointerState {
  edge: ResizeEdge
  rect: PaperFigurePreviewRect
}

interface ResizeHandle {
  edge: ResizeEdge
  label: string
}

const resizeHandles: ResizeHandle[] = [
  { edge: 'top', label: '从上边缩放图片预览' },
  { edge: 'right', label: '从右边缩放图片预览' },
  { edge: 'bottom', label: '从下边缩放图片预览' },
  { edge: 'left', label: '从左边缩放图片预览' },
  { edge: 'top-left', label: '从左上角缩放图片预览' },
  { edge: 'top-right', label: '从右上角缩放图片预览' },
  { edge: 'bottom-right', label: '从右下角缩放图片预览' },
  { edge: 'bottom-left', label: '从左下角缩放图片预览' }
]

function buildResizedRect(state: ResizeState, event: MouseEvent): PaperFigurePreviewRect {
  const deltaX = event.clientX - state.clientX
  const deltaY = event.clientY - state.clientY
  const rect = { ...state.rect }
  const right = state.rect.left + state.rect.width
  const bottom = state.rect.top + state.rect.height

  if (state.edge.includes('left')) {
    rect.width = Math.max(state.rect.width - deltaX, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
    rect.left = right - rect.width
  }

  if (state.edge.includes('right')) {
    rect.width = Math.max(state.rect.width + deltaX, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
  }

  if (state.edge.includes('top')) {
    rect.height = Math.max(state.rect.height - deltaY, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
    rect.top = bottom - rect.height
  }

  if (state.edge.includes('bottom')) {
    rect.height = Math.max(state.rect.height + deltaY, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
  }

  return rect
}

export default function PaperFigurePreview() {
  const store = usePaperReaderStore()

  const activeFigure = store.activeFigure
  const currentPaperFigures = useMemo(
    () => store.currentPaperFigures() ?? [],
    [store.currentPaperFigures()]
  )
  const figureCaptionTranslationMap = useMemo(
    () => store.figureCaptionTranslationMap() ?? {},
    [store.figureCaptionTranslationMap()]
  )
  const figurePreviewPinned = store.figurePreviewPinned ?? false
  const figurePreviewRect = store.figurePreviewRect
  const translationVisible = store.translationVisible ?? false

  const previewRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<PointerState | null>(null)
  const resizeStateRef = useRef<ResizeState | null>(null)

  const stopInteractions = useCallback(() => {
    dragStateRef.current = null
    resizeStateRef.current = null
    window.removeEventListener('mousemove', handlePointerMove)
    window.removeEventListener('mouseup', handlePointerUp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handlePointerMove(event: MouseEvent): void {
    const dragState = dragStateRef.current
    if (dragState) {
      store.moveFigurePreview({
        x: event.clientX - dragState.clientX,
        y: event.clientY - dragState.clientY
      })
      dragStateRef.current = {
        clientX: event.clientX,
        clientY: event.clientY
      }
    }

    const resizeState = resizeStateRef.current
    if (resizeState) {
      const newRect = buildResizedRect(resizeState, event)
      store.setFigurePreviewRect(newRect)
      resizeStateRef.current = {
        ...resizeState,
        rect: newRect,
        clientX: event.clientX,
        clientY: event.clientY
      }
    }
  }

  function handlePointerUp(): void {
    stopInteractions()
  }

  const handleDragStart = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) {
        return
      }

      dragStateRef.current = {
        clientX: event.clientX,
        clientY: event.clientY
      }

      window.addEventListener('mousemove', handlePointerMove)
      window.addEventListener('mouseup', handlePointerUp)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const handleResizeStart = useCallback(
    (event: React.MouseEvent, edge: ResizeEdge) => {
      if (event.button !== 0) {
        return
      }

      resizeStateRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        edge,
        rect: { ...figurePreviewRect }
      }

      window.addEventListener('mousemove', handlePointerMove)
      window.addEventListener('mouseup', handlePointerUp)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [figurePreviewRect]
  )

  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const image = event.target as HTMLImageElement
      if (!image.naturalWidth || !image.naturalHeight) {
        return
      }

      store.setFigurePreviewImageRatio(image.naturalHeight / image.naturalWidth)
    },
    [store]
  )

  // Close on outside click (when not pinned)
  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent): void {
      if (!activeFigure || figurePreviewPinned || !previewRef.current) {
        return
      }

      const target = event.target as Node
      if (!previewRef.current.contains(target)) {
        store.closeFigurePreview()
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [activeFigure, figurePreviewPinned, store])

  // Keyboard navigation
  useEffect(() => {
    function handleDocumentKeyDown(event: KeyboardEvent): void {
      if (!activeFigure) {
        return
      }

      if (event.key === 'Escape') {
        if (figurePreviewPinned) {
          return
        }

        store.closeFigurePreview()
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        switchFigure(-1)
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        switchFigure(1)
      }
    }

    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => document.removeEventListener('keydown', handleDocumentKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFigure, figurePreviewPinned, store])

  // Stop interactions when figure changes
  useEffect(() => {
    if (!activeFigure) {
      stopInteractions()
    }
  }, [activeFigure, stopInteractions])

  const togglePinned = useCallback(() => {
    store.setFigurePreviewPinned(!figurePreviewPinned)
  }, [store, figurePreviewPinned])

  const switchFigure = useCallback(
    (step: number) => {
      const figures = currentPaperFigures
      if (figures.length <= 1) {
        return
      }

      const currentIndex = figures.findIndex((f: { id: string }) => f.id === activeFigure?.id)
      if (currentIndex < 0) {
        return
      }

      const nextIndex = (currentIndex + step + figures.length) % figures.length
      const nextFigure = figures[nextIndex]
      if (!nextFigure) {
        return
      }

      store.openFigurePreview(nextFigure)
    },
    [currentPaperFigures, activeFigure, store]
  )

  const previewCaption = useMemo(() => {
    if (!activeFigure) return '暂无图注'

    if (translationVisible) {
      const translated = figureCaptionTranslationMap[activeFigure.id]
      if (translated) return translated
    }

    return activeFigure.caption || activeFigure.subCaption || '暂无图注'
  }, [activeFigure, translationVisible, figureCaptionTranslationMap])

  const currentFigureIndex = useMemo(() => {
    if (!activeFigure) return -1
    return currentPaperFigures.findIndex((f: { id: string }) => f.id === activeFigure.id)
  }, [activeFigure, currentPaperFigures])

  const canSwitchFigures = currentPaperFigures.length > 1 && currentFigureIndex >= 0

  const previewStyle = figurePreviewRect
    ? {
        left: `${figurePreviewRect.left}px`,
        top: `${figurePreviewRect.top}px`,
        width: `${figurePreviewRect.width}px`,
        height: `${figurePreviewRect.height}px`
      }
    : undefined

  if (!activeFigure) {
    return null
  }

  return createPortal(
    <div
      ref={previewRef}
      className={styles['paper-figure-preview']}
      style={previewStyle}
      role="dialog"
      aria-label="论文图片预览"
    >
      <div
        className={styles['paper-figure-preview__header']}
        onMouseDown={(e) => {
          e.preventDefault()
          handleDragStart(e)
        }}
      >
        <div className={styles['paper-figure-preview__meta']}>
          <div className={styles['paper-figure-preview__title']}>论文图片预览</div>
        </div>

        <div
          className={styles['paper-figure-preview__actions']}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className={[
              'sm-icon-button',
              styles['paper-figure-preview__action'],
              figurePreviewPinned ? styles['is-active'] : ''
            ]
              .filter(Boolean)
              .join(' ')}
            title={figurePreviewPinned ? '取消钉住' : '钉住预览窗'}
            aria-label={figurePreviewPinned ? '取消钉住' : '钉住预览窗'}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              togglePinned()
            }}
          >
            <SvgIcon name={figurePreviewPinned ? 'pin-filled' : 'pin'} size={14} />
          </button>

          <button
            className={['sm-icon-button', styles['paper-figure-preview__action']].join(' ')}
            title="关闭"
            aria-label="关闭图片预览"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              store.closeFigurePreview()
            }}
          >
            <SvgIcon name="close" size={14} />
          </button>
        </div>
      </div>

      <div className={styles['paper-figure-preview__body']}>
        <div className={styles['paper-figure-preview__image-shell']}>
          <img
            src={activeFigure.imagePath}
            alt={previewCaption}
            className={styles['paper-figure-preview__image']}
            onLoad={handleImageLoad}
          />

          {canSwitchFigures && (
            <div
              className={styles['paper-figure-preview__nav']}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                className={['sm-icon-button', styles['paper-figure-preview__nav-button']].join(' ')}
                type="button"
                title="上一张"
                aria-label="查看上一张图片"
                onClick={(e) => {
                  e.stopPropagation()
                  switchFigure(-1)
                }}
              >
                <SvgIcon name="arrow-left" size={14} />
              </button>

              <button
                className={['sm-icon-button', styles['paper-figure-preview__nav-button']].join(' ')}
                type="button"
                title="下一张"
                aria-label="查看下一张图片"
                onClick={(e) => {
                  e.stopPropagation()
                  switchFigure(1)
                }}
              >
                <SvgIcon name="arrow-right" size={14} />
              </button>
            </div>
          )}
        </div>

        <div className={styles['paper-figure-preview__caption']}>{previewCaption}</div>
      </div>

      {resizeHandles.map((handle) => (
        <button
          key={handle.edge}
          className={[
            styles['paper-figure-preview__resize'],
            styles[`paper-figure-preview__resize--${handle.edge}`]
          ].join(' ')}
          type="button"
          tabIndex={-1}
          aria-label={handle.label}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleResizeStart(e, handle.edge)
          }}
        />
      ))}
    </div>,
    document.body
  )
}
