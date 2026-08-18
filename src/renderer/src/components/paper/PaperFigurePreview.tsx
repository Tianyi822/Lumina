import { useRef, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import { buildFigureCaptionTranslationMap } from '@shared/utils/paperTranslation'
import { normalizePaperInlineMathForRender } from '@shared/utils/paperMarkdown'
import { usePaperListStore } from '@renderer/stores/paper'
import { usePaperTranslationStore } from '@renderer/stores/paper'
import { usePaperFigureStore } from '@renderer/stores/paper'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import type { PaperFigurePreviewRect } from '@renderer/stores/paper/shared'
import type { PaperFigureItem } from '@shared/types/paper'
import {
  PAPER_FIGURE_PREVIEW_MARGIN,
  PAPER_FIGURE_PREVIEW_MIN_HEIGHT,
  PAPER_FIGURE_PREVIEW_MIN_WIDTH
} from '@renderer/stores/paper/shared'
import styles from './PaperFigurePreview.module.css'

interface PointerState {
  clientX: number
  clientY: number
}

interface DragState extends PointerState {
  rect: PaperFigurePreviewRect
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
  /** aria-label 文案 key（paper.figures.*），渲染处经 t() 取当前语言文案 */
  labelKey: ParseKeys
}

const resizeHandles: ResizeHandle[] = [
  { edge: 'top', labelKey: 'paper.figures.resizeN' },
  { edge: 'right', labelKey: 'paper.figures.resizeE' },
  { edge: 'bottom', labelKey: 'paper.figures.resizeS' },
  { edge: 'left', labelKey: 'paper.figures.resizeW' },
  { edge: 'top-left', labelKey: 'paper.figures.resizeNW' },
  { edge: 'top-right', labelKey: 'paper.figures.resizeNE' },
  { edge: 'bottom-right', labelKey: 'paper.figures.resizeSE' },
  { edge: 'bottom-left', labelKey: 'paper.figures.resizeSW' }
]

const EMPTY_PAPER_FIGURES: PaperFigureItem[] = []

const captionMd = new MarkdownIt({ html: true, breaks: true }).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'brackets', 'beg_end'],
  katexOptions: { throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' }
})

// 限制预览宽度在最小值和窗口边界之间，确保两侧保留边距
function clampPreviewWidth(width: number): number {
  if (typeof window === 'undefined') {
    return Math.max(width, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
  }
  const maxWidth = Math.max(
    window.innerWidth - PAPER_FIGURE_PREVIEW_MARGIN * 2,
    PAPER_FIGURE_PREVIEW_MIN_WIDTH
  )
  return Math.min(Math.max(width, PAPER_FIGURE_PREVIEW_MIN_WIDTH), maxWidth)
}

// 限制预览高度在最小值和窗口边界之间
function clampPreviewHeight(height: number): number {
  if (typeof window === 'undefined') {
    return Math.max(height, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
  }
  const maxHeight = Math.max(
    window.innerHeight - PAPER_FIGURE_PREVIEW_MARGIN * 2,
    PAPER_FIGURE_PREVIEW_MIN_HEIGHT
  )
  return Math.min(Math.max(height, PAPER_FIGURE_PREVIEW_MIN_HEIGHT), maxHeight)
}

// 限制预览左边距不小于边距值，同时右侧不超出窗口范围
function clampPreviewLeft(left: number, width: number): number {
  if (typeof window === 'undefined') {
    return Math.max(left, PAPER_FIGURE_PREVIEW_MARGIN)
  }
  return Math.min(
    Math.max(left, PAPER_FIGURE_PREVIEW_MARGIN),
    Math.max(window.innerWidth - width - PAPER_FIGURE_PREVIEW_MARGIN, PAPER_FIGURE_PREVIEW_MARGIN)
  )
}

// 限制预览上边距不小于边距值，同时底部不超出窗口范围
function clampPreviewTop(top: number, height: number): number {
  if (typeof window === 'undefined') {
    return Math.max(top, PAPER_FIGURE_PREVIEW_MARGIN)
  }
  return Math.min(
    Math.max(top, PAPER_FIGURE_PREVIEW_MARGIN),
    Math.max(window.innerHeight - height - PAPER_FIGURE_PREVIEW_MARGIN, PAPER_FIGURE_PREVIEW_MARGIN)
  )
}

// 对预览窗口的尺寸和位置同时执行边界限制，确保完整可见
function normalizePreviewRect(rect: PaperFigurePreviewRect): PaperFigurePreviewRect {
  const width = clampPreviewWidth(rect.width)
  const height = clampPreviewHeight(rect.height)
  return {
    left: clampPreviewLeft(rect.left, width),
    top: clampPreviewTop(rect.top, height),
    width,
    height
  }
}

// 根据缩放方向（edge）和鼠标偏移量计算新尺寸，左/上边缘缩放同时调整位置
function buildResizedRect(state: ResizeState, event: MouseEvent): PaperFigurePreviewRect {
  const deltaX = event.clientX - state.clientX
  const deltaY = event.clientY - state.clientY
  const rect = { ...state.rect }
  const right = state.rect.left + state.rect.width
  const bottom = state.rect.top + state.rect.height

  // 从左边缩放：宽度减小需同时右移 left，保持右边框不动
  if (state.edge.includes('left')) {
    rect.width = Math.max(state.rect.width - deltaX, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
    rect.left = right - rect.width
  }

  // 从右边缩放：直接改变宽度，left 不变
  if (state.edge.includes('right')) {
    rect.width = Math.max(state.rect.width + deltaX, PAPER_FIGURE_PREVIEW_MIN_WIDTH)
  }

  // 从上边缩放：类似左边逻辑，高度减小需下移 top
  if (state.edge.includes('top')) {
    rect.height = Math.max(state.rect.height - deltaY, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
    rect.top = bottom - rect.height
  }

  // 从下边缩放：直接改变高度，top 不变
  if (state.edge.includes('bottom')) {
    rect.height = Math.max(state.rect.height + deltaY, PAPER_FIGURE_PREVIEW_MIN_HEIGHT)
  }

  return normalizePreviewRect(rect)
}

/** 论文图片预览浮动面板组件，支持拖拽移动、缩放大小、钉住、键盘导航和翻译图注切换 */
export default function PaperFigurePreview() {
  const { t } = useTranslation()
  const currentPaperId = usePaperListStore((state) => state.currentPaperId)
  const activeFigure = usePaperFigureStore((state) => state.activeFigure)
  const figuresByPaperId = usePaperFigureStore((state) => state.figuresByPaperId)
  // 从 store 中取出当前论文的图片列表，论文切换时自动更新
  const currentPaperFigures = useMemo(() => {
    if (!currentPaperId) return EMPTY_PAPER_FIGURES
    return figuresByPaperId[currentPaperId] ?? EMPTY_PAPER_FIGURES
  }, [currentPaperId, figuresByPaperId])

  const translationByPaperId = usePaperTranslationStore((state) => state.translationByPaperId)
  // 取出当前论文的翻译缓存，并构建图片图注的翻译映射表
  const currentTranslationCache = useMemo(() => {
    if (!currentPaperId) return null
    return translationByPaperId[currentPaperId] ?? null
  }, [currentPaperId, translationByPaperId])
  // 从翻译缓存中提取图片图注的翻译结果，按图片 ID 组织成映射
  const figureCaptionTranslationMap = useMemo(
    () =>
      currentTranslationCache ? buildFigureCaptionTranslationMap(currentTranslationCache) : {},
    [currentTranslationCache]
  )
  const translationVisible = usePaperTranslationStore((state) => state.translationVisible ?? false)

  // 预览面板钉住状态，钉住后点击外部不关闭，方便对照阅读
  const figurePreviewPinned = usePaperFigureStore((state) => state.figurePreviewPinned ?? false)
  const figurePreviewRect = usePaperFigureStore((state) => state.figurePreviewRect)
  const setFigurePreviewRect = usePaperFigureStore((state) => state.setFigurePreviewRect)
  const setFigurePreviewPinned = usePaperFigureStore((state) => state.setFigurePreviewPinned)
  const setFigurePreviewImageRatio = usePaperFigureStore(
    (state) => state.setFigurePreviewImageRatio
  )
  const closeFigurePreview = usePaperFigureStore((state) => state.closeFigurePreview)
  const openFigurePreview = usePaperFigureStore((state) => state.openFigurePreview)

  const previewRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const resizeStateRef = useRef<ResizeState | null>(null)
  const latestPreviewRectRef = useRef(figurePreviewRect)
  const pendingPreviewRectRef = useRef<PaperFigurePreviewRect | null>(null)
  const previewRectRafIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!dragStateRef.current && !resizeStateRef.current) {
      latestPreviewRectRef.current = figurePreviewRect
    }
  }, [figurePreviewRect])

  // 通过 requestAnimationFrame 节流更新面板样式，避免 mousemove 高频触发直接操作 DOM
  const applyPreviewRect = useCallback((rect: PaperFigurePreviewRect) => {
    const normalized = normalizePreviewRect(rect)
    latestPreviewRectRef.current = normalized
    pendingPreviewRectRef.current = normalized

    // 已有排队的 RAF 则不重复调度，最新位置在下一个 RAF 中统一应用
    if (previewRectRafIdRef.current !== null) {
      return
    }

    previewRectRafIdRef.current = requestAnimationFrame(() => {
      previewRectRafIdRef.current = null
      const nextRect = pendingPreviewRectRef.current
      pendingPreviewRectRef.current = null
      if (!nextRect || !previewRef.current) {
        return
      }

      previewRef.current.style.left = `${nextRect.left}px`
      previewRef.current.style.top = `${nextRect.top}px`
      previewRef.current.style.width = `${nextRect.width}px`
      previewRef.current.style.height = `${nextRect.height}px`
    })
  }, [])

  // 拖拽或缩放结束时，将最新位置持久化到 store，清理全局监听和 RAF 队列
  const stopInteractions = useCallback(() => {
    if (dragStateRef.current || resizeStateRef.current) {
      setFigurePreviewRect(latestPreviewRectRef.current)
    }
    dragStateRef.current = null
    resizeStateRef.current = null
    // 取消未执行的 RAF 回调，避免位置已释放后仍更新面板样式
    if (previewRectRafIdRef.current !== null) {
      cancelAnimationFrame(previewRectRafIdRef.current)
      previewRectRafIdRef.current = null
    }
    pendingPreviewRectRef.current = null
    window.removeEventListener('mousemove', handlePointerMove)
    window.removeEventListener('mouseup', handlePointerUp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setFigurePreviewRect])

  // 全局鼠标移动处理：根据当前处于拖拽还是缩放状态分别计算新位置/尺寸
  function handlePointerMove(event: MouseEvent): void {
    const dragState = dragStateRef.current
    if (dragState) {
      applyPreviewRect(
        normalizePreviewRect({
          ...dragState.rect,
          left: dragState.rect.left + event.clientX - dragState.clientX,
          top: dragState.rect.top + event.clientY - dragState.clientY
        })
      )
    }

    const resizeState = resizeStateRef.current
    if (resizeState) {
      const newRect = buildResizedRect(resizeState, event)
      applyPreviewRect(newRect)
    }
  }

  function handlePointerUp(): void {
    stopInteractions()
  }

  const handleDragStart = useCallback(
    (event: React.MouseEvent) => {
      // 仅响应左键拖拽
      if (event.button !== 0) {
        return
      }

      // 记录拖拽起始时的鼠标位置和面板位置
      dragStateRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        rect: latestPreviewRectRef.current
      }

      // 切换到全局监听，确保拖拽时鼠标移出面板仍能响应
      window.addEventListener('mousemove', handlePointerMove)
      window.addEventListener('mouseup', handlePointerUp)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const handleResizeStart = useCallback(
    (event: React.MouseEvent, edge: ResizeEdge) => {
      // 仅响应左键拖拽缩放
      if (event.button !== 0) {
        return
      }

      // 记录缩放起始状态：鼠标位置、缩放方向和当前面板尺寸
      resizeStateRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        edge,
        rect: { ...latestPreviewRectRef.current }
      }

      window.addEventListener('mousemove', handlePointerMove)
      window.addEventListener('mouseup', handlePointerUp)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // 图片加载完成后计算宽高比并存入 store，供后续布局参考（如自适应填充）
  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const image = event.target as HTMLImageElement
      if (!image.naturalWidth || !image.naturalHeight) {
        return
      }

      setFigurePreviewImageRatio(image.naturalHeight / image.naturalWidth)
    },
    [setFigurePreviewImageRatio]
  )

  // Close on outside click (when not pinned)
  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent): void {
      // 没有活跃图片、已钉住或面板未挂载时不处理
      if (!activeFigure || figurePreviewPinned || !previewRef.current) {
        return
      }

      // 点击发生在面板外部时关闭预览
      const target = event.target as Node
      if (!previewRef.current.contains(target)) {
        closeFigurePreview()
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown)
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown)
  }, [activeFigure, figurePreviewPinned, closeFigurePreview])

  // Keyboard navigation：Escape 关闭（钉住时忽略），左右箭头切换上一张/下一张
  useEffect(() => {
    function handleDocumentKeyDown(event: KeyboardEvent): void {
      // 没有活跃图片时不处理
      if (!activeFigure) {
        return
      }

      if (event.key === 'Escape') {
        // 钉住状态下按 Esc 不关闭，防止误操作
        if (figurePreviewPinned) {
          return
        }

        closeFigurePreview()
        return
      }

      if (event.key === 'ArrowLeft') {
        // 焦点不在预览面板内时忽略箭头键，避免与页面滚动冲突
        if (previewRef.current && !previewRef.current.contains(document.activeElement)) {
          return
        }
        event.preventDefault()
        switchFigure(-1)
        return
      }

      if (event.key === 'ArrowRight') {
        if (previewRef.current && !previewRef.current.contains(document.activeElement)) {
          return
        }
        event.preventDefault()
        switchFigure(1)
      }
    }

    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => document.removeEventListener('keydown', handleDocumentKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFigure, figurePreviewPinned, closeFigurePreview])

  // 图片切换或关闭时，清理可能正在进行中的拖拽/缩放交互
  useEffect(() => {
    if (!activeFigure) {
      stopInteractions()
    }
  }, [activeFigure, stopInteractions])

  const togglePinned = useCallback(() => {
    setFigurePreviewPinned(!figurePreviewPinned)
  }, [setFigurePreviewPinned, figurePreviewPinned])

  const switchFigure = useCallback(
    (step: number) => {
      // 只有一张图片或无法定位当前索引时跳过切换
      const figures = currentPaperFigures
      if (figures.length <= 1) {
        return
      }

      const currentIndex = figures.findIndex((f: { id: string }) => f.id === activeFigure?.id)
      if (currentIndex < 0) {
        return
      }

      // 环形切换：取模运算保证索引在 0~length-1 范围内循环
      const nextIndex = (currentIndex + step + figures.length) % figures.length
      const nextFigure = figures[nextIndex]
      if (!nextFigure) {
        return
      }

      openFigurePreview(nextFigure)
    },
    [currentPaperFigures, activeFigure, openFigurePreview]
  )

  // 合成当前预览图片的图注文本：启用了翻译时优先显示翻译结果，否则降级到原文或子标题
  const previewCaption = useMemo(() => {
    if (!activeFigure) return t('chrome.toolbar.noCaption')

    if (translationVisible) {
      const translated = figureCaptionTranslationMap[activeFigure.id]
      if (translated) return translated
    }

    return activeFigure.caption || activeFigure.subCaption || t('chrome.toolbar.noCaption')
  }, [activeFigure, translationVisible, figureCaptionTranslationMap, t])

  // 计算当前图片在论文图片列表中的索引，用于显示位置和判断切换可行性
  const currentFigureIndex = useMemo(() => {
    if (!activeFigure) return -1
    return currentPaperFigures.findIndex((f: { id: string }) => f.id === activeFigure.id)
  }, [activeFigure, currentPaperFigures])

  // 图片总数大于 1 且当前索引有效时才能切换
  const canSwitchFigures = currentPaperFigures.length > 1 && currentFigureIndex >= 0

  // 从 store 读取面板位置和尺寸，转换为内联样式对象；undefined 时组件使用默认定位
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
      aria-label={t('paper.figures.previewAria')}
    >
      <div
        className={styles['paper-figure-preview__header']}
        onMouseDown={(e) => {
          e.preventDefault()
          handleDragStart(e)
        }}
      >
        <div className={styles['paper-figure-preview__meta']}>
          <div className={styles['paper-figure-preview__title']}>
            {t('paper.figures.panelTitle')}
          </div>
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
            title={figurePreviewPinned ? t('paper.figures.unpin') : t('paper.figures.pin')}
            aria-label={figurePreviewPinned ? t('paper.figures.unpin') : t('paper.figures.pin')}
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
            title={t('common.close')}
            aria-label={t('paper.figures.closeAria')}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              closeFigurePreview()
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
                title={t('paper.figures.prev')}
                aria-label={t('paper.figures.prevAria')}
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
                title={t('paper.figures.next')}
                aria-label={t('paper.figures.nextAria')}
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

        <div
          className={styles['paper-figure-preview__caption']}
          dangerouslySetInnerHTML={{
            __html: captionMd.render(normalizePaperInlineMathForRender(previewCaption, 'paragraph'))
          }}
        />
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
          aria-label={t(handle.labelKey)}
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
