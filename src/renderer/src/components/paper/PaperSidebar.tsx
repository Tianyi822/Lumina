import { memo, forwardRef, useState, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { CssTransitionGroup } from '@renderer/components/motion/CssTransition'
import { formatFileSize } from '@shared/utils'
import { normalizePaperInlineMathForRender } from '@shared/utils/paperMarkdown'
import type { OcrProgressInfo, PaperDocument, PaperStatus } from '@shared/types/paper'
import type { RenderingProgress } from '@renderer/stores/paperReaderStore'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import styles from './PaperSidebar.module.css'

// 侧边栏标题 LaTeX 渲染用 MarkdownIt 实例
const titleMd = new MarkdownIt({ html: true, breaks: true }).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'brackets', 'beg_end'],
  katexOptions: { throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' }
})

const TITLE_HTML_CACHE_LIMIT = 500
const titleHtmlCache = new Map<string, string>()
const EMPTY_RENDER_PROGRESS_MAP = {} as Record<string, RenderingProgress>
const EMPTY_OCR_PROGRESS_MAP = {} as Record<string, OcrProgressInfo>

function renderPaperTitleHtml(paperId: string, displayName: string): string {
  const cacheKey = `${paperId}\u0000${displayName}`
  const cached = titleHtmlCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  if (titleHtmlCache.size >= TITLE_HTML_CACHE_LIMIT) {
    const oldestKey = titleHtmlCache.keys().next().value
    if (oldestKey) {
      titleHtmlCache.delete(oldestKey)
    }
  }

  const html = titleMd.renderInline(normalizePaperInlineMathForRender(displayName, 'paragraph'))
  titleHtmlCache.set(cacheKey, html)
  return html
}

interface PaperSidebarProps {
  papers: PaperDocument[]
  currentPaperId: string | null
  renderProgressByPaperId: Record<string, RenderingProgress>
  ocrProgressByPaperId: Record<string, OcrProgressInfo>
  hasTranslationByPaperId: Record<string, boolean>
  onSelectPaper: (paperId: string) => void
  onDeletePaper: (paperId: string) => void
  onDeleteTranslation: (paperId: string) => void
  onRetryPaper: (paperId: string) => void
}

interface PaperSidebarItemProps {
  paper: PaperDocument
  index: number
  className?: string
  isActive: boolean
  renderProgress?: RenderingProgress
  ocrProgress?: OcrProgressInfo
  hasTranslated: boolean
  onSelectPaper: (paperId: string) => void
  onDeletePaper: (paperId: string, event: React.MouseEvent) => void
  onDeleteTranslation: (paperId: string, event: React.MouseEvent) => void
  onRetryPaper: (paperId: string, event: React.MouseEvent) => void
  onItemMouseEnter: (paperId: string, html: string, event: React.MouseEvent<HTMLDivElement>) => void
  onItemMouseLeave: () => void
}

function isPaperReadable(paper: PaperDocument): boolean {
  return paper.status === 'completed'
}

function getRenderProgress(
  paper: PaperDocument,
  renderProgressByPaperId: Record<string, RenderingProgress>
): { completedPages: number; totalPages: number } {
  const progress = renderProgressByPaperId[paper.id]
  if (progress) {
    return {
      completedPages: progress.completedPages,
      totalPages: progress.totalPages || paper.pageCount
    }
  }

  return {
    completedPages: Math.min(paper.pageAssets?.length || 0, paper.pageCount),
    totalPages: paper.pageCount
  }
}

function formatRenderProgressText(
  paper: PaperDocument,
  renderProgressByPaperId: Record<string, RenderingProgress>
): string {
  const progress = getRenderProgress(paper, renderProgressByPaperId)
  return `${progress.completedPages}/${progress.totalPages}`
}

function getRenderProgressPercent(
  paper: PaperDocument,
  renderProgressByPaperId: Record<string, RenderingProgress>
): number {
  const progress = getRenderProgress(paper, renderProgressByPaperId)
  if (progress.totalPages === 0) return 0
  return Math.min(100, Math.round((progress.completedPages / progress.totalPages) * 100))
}

function getOcrProgress(
  paper: PaperDocument,
  ocrProgressByPaperId: Record<string, OcrProgressInfo>
): {
  completedPages: number
  totalPages: number
  hint: string
} {
  const progress = ocrProgressByPaperId[paper.id]
  if (progress) {
    const hintMap: Record<OcrProgressInfo['status'], string> = {
      idle: '待开始',
      processing: '处理中',
      completed: '已完成',
      partial_failed: '部分失败',
      failed: '失败',
      cancelled: '已取消'
    }

    return {
      completedPages: progress.completedPages,
      totalPages: progress.totalPages || paper.pageCount,
      hint: hintMap[progress.status]
    }
  }

  const fallbackHintMap: Record<PaperStatus, string> = {
    draft: '待开始',
    rendering: '待开始',
    ocr_processing: '处理中',
    completed: '已完成',
    partial_failed: '部分失败',
    failed: '失败'
  }

  return {
    completedPages: paper.completedPageCount,
    totalPages: paper.pageCount,
    hint: fallbackHintMap[paper.status]
  }
}

function formatOcrProgressText(
  paper: PaperDocument,
  ocrProgressByPaperId: Record<string, OcrProgressInfo>
): string {
  const progress = getOcrProgress(paper, ocrProgressByPaperId)
  return `${progress.completedPages}/${progress.totalPages}（${progress.hint}）`
}

function getOcrProgressPercent(
  paper: PaperDocument,
  ocrProgressByPaperId: Record<string, OcrProgressInfo>
): number {
  const progress = getOcrProgress(paper, ocrProgressByPaperId)
  if (progress.totalPages === 0) return 0
  return Math.min(100, Math.round((progress.completedPages / progress.totalPages) * 100))
}

function shouldShowRenderProgress(paper: PaperDocument): boolean {
  return paper.status === 'rendering'
}

function shouldShowOcrProgress(paper: PaperDocument): boolean {
  return paper.status === 'ocr_processing'
}

function shouldShowRetry(paper: PaperDocument): boolean {
  return paper.status === 'failed' || paper.status === 'partial_failed'
}

function getRetryTitle(
  paper: PaperDocument,
  renderProgressByPaperId: Record<string, RenderingProgress>
): string {
  const renderProgress = renderProgressByPaperId[paper.id]
  if (renderProgress?.stage === 'failed') {
    return '截图阶段失败'
  }

  if (paper.status === 'partial_failed') {
    return 'OCR 部分失败'
  }

  return 'OCR 阶段失败'
}

function getRetryMessage(
  paper: PaperDocument,
  renderProgressByPaperId: Record<string, RenderingProgress>,
  ocrProgressByPaperId: Record<string, OcrProgressInfo>
): string {
  const renderProgress = renderProgressByPaperId[paper.id]
  if (renderProgress?.stage === 'failed') {
    return renderProgress.error || paper.errorMessage || '页图生成失败，请手动重试。'
  }

  if (paper.status === 'partial_failed') {
    return '有页面识别失败，点击重试后会重新执行 OCR。'
  }

  const ocrProgress = ocrProgressByPaperId[paper.id]
  return ocrProgress?.errorMessage || paper.errorMessage || 'OCR 执行失败，请手动重试。'
}

function getUnreadableText(paper: PaperDocument): string {
  if (shouldShowRetry(paper)) {
    return '处理失败，暂不可阅读'
  }

  if (paper.status === 'failed' || paper.status === 'partial_failed') {
    return '识别未完成，暂不可阅读'
  }

  return '处理中，暂不可阅读'
}

function getPaperKey(paper: PaperDocument): string {
  return paper.id
}

const PaperSidebarItem = memo(
  forwardRef<HTMLDivElement, PaperSidebarItemProps>(function PaperSidebarItem(
    {
      paper,
      index,
      className,
      isActive,
      renderProgress,
      ocrProgress,
      hasTranslated,
      onSelectPaper,
      onDeletePaper,
      onDeleteTranslation,
      onRetryPaper,
      onItemMouseEnter,
      onItemMouseLeave
    },
    ref
  ) {
    const displayName = paper.title || paper.fileName.replace(/\.pdf$/i, '')
    const renderedHtml = useMemo(
      () => renderPaperTitleHtml(paper.id, displayName),
      [displayName, paper.id]
    )
    const renderProgressByPaperId = useMemo<Record<string, RenderingProgress>>(
      () => (renderProgress ? { [paper.id]: renderProgress } : EMPTY_RENDER_PROGRESS_MAP),
      [paper.id, renderProgress]
    )
    const ocrProgressByPaperId = useMemo<Record<string, OcrProgressInfo>>(
      () => (ocrProgress ? { [paper.id]: ocrProgress } : EMPTY_OCR_PROGRESS_MAP),
      [ocrProgress, paper.id]
    )

    const readable = isPaperReadable(paper)

    return (
      <div
        ref={ref}
        style={getSidebarListItemMotionStyle(index) as CSSProperties}
        className={[
          styles['paper-item'],
          isActive ? styles['paper-item--active'] : '',
          !readable ? styles['paper-item--disabled'] : '',
          className
        ]
          .filter(Boolean)
          .join(' ')}
        aria-disabled={!readable}
        onClick={() => {
          if (readable) {
            onSelectPaper(paper.id)
          }
        }}
        onMouseEnter={(event) => onItemMouseEnter(paper.id, renderedHtml, event)}
        onMouseLeave={onItemMouseLeave}
      >
        <div className={styles['paper-item__info']}>
          <div
            className={styles['paper-item__name']}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
          <div className={styles['paper-item__meta-row']}>
            <div className={styles['paper-item__meta']}>
              <span>{paper.pageCount} 页</span>
              <span className={styles['paper-item__meta-sep']}>·</span>
              <span>{formatFileSize(paper.fileSize)}</span>
            </div>

            {hasTranslated && (
              <button
                className={styles['paper-item__translation-tag']}
                type="button"
                title="点击删除翻译内容"
                onClick={(event) => onDeleteTranslation(paper.id, event)}
              >
                <span className={styles['paper-item__translation-tag-default']}>有译文</span>
                <span className={styles['paper-item__translation-tag-delete']}>删除翻译</span>
              </button>
            )}
          </div>

          {shouldShowRenderProgress(paper) && (
            <div className={styles['paper-item__progress']}>
              <div className={styles['paper-item__progress-line']}>
                <span className={styles['paper-item__progress-label']}>截图进度</span>
                <span>{formatRenderProgressText(paper, renderProgressByPaperId)}</span>
              </div>
              <div className={styles['paper-item__progress-track']}>
                <span
                  className={[
                    styles['paper-item__progress-fill'],
                    styles['paper-item__progress-fill--render']
                  ].join(' ')}
                  style={{
                    width: `${getRenderProgressPercent(paper, renderProgressByPaperId)}%`
                  }}
                />
              </div>
            </div>
          )}

          {!shouldShowRenderProgress(paper) && shouldShowOcrProgress(paper) && (
            <div className={styles['paper-item__progress']}>
              <div className={styles['paper-item__progress-line']}>
                <span className={styles['paper-item__progress-label']}>OCR 进度</span>
                <span>{formatOcrProgressText(paper, ocrProgressByPaperId)}</span>
              </div>
              <div className={styles['paper-item__progress-track']}>
                <span
                  className={[
                    styles['paper-item__progress-fill'],
                    styles['paper-item__progress-fill--ocr']
                  ].join(' ')}
                  style={{
                    width: `${getOcrProgressPercent(paper, ocrProgressByPaperId)}%`
                  }}
                />
              </div>
            </div>
          )}

          {shouldShowRetry(paper) && (
            <div className={styles['paper-item__retry']}>
              <div className={styles['paper-item__retry-title']}>
                {getRetryTitle(paper, renderProgressByPaperId)}
              </div>
              <div className={styles['paper-item__retry-message']}>
                {getRetryMessage(paper, renderProgressByPaperId, ocrProgressByPaperId)}
              </div>
              <button
                className={styles['paper-item__retry-btn']}
                type="button"
                onClick={(event) => onRetryPaper(paper.id, event)}
              >
                重试
              </button>
            </div>
          )}

          {!readable && (
            <div className={styles['paper-item__unreadable']}>{getUnreadableText(paper)}</div>
          )}
        </div>

        <div className={styles['paper-item__actions']}>
          <button
            className={styles['paper-item__delete-btn']}
            title="删除论文"
            type="button"
            onClick={(event) => onDeletePaper(paper.id, event)}
          >
            <SvgIcon name="trash" size={14} />
          </button>
        </div>
      </div>
    )
  }),
  (prev, next) =>
    prev.paper === next.paper &&
    prev.index === next.index &&
    prev.className === next.className &&
    prev.isActive === next.isActive &&
    prev.renderProgress === next.renderProgress &&
    prev.ocrProgress === next.ocrProgress &&
    prev.hasTranslated === next.hasTranslated &&
    prev.onSelectPaper === next.onSelectPaper &&
    prev.onDeletePaper === next.onDeletePaper &&
    prev.onDeleteTranslation === next.onDeleteTranslation &&
    prev.onRetryPaper === next.onRetryPaper &&
    prev.onItemMouseEnter === next.onItemMouseEnter &&
    prev.onItemMouseLeave === next.onItemMouseLeave
)

/** 论文侧边栏列表组件，展示论文列表、进度、状态和操作（删除/重试），支持标题 LaTeX 渲染 */
export default function PaperSidebar({
  papers,
  currentPaperId,
  renderProgressByPaperId,
  ocrProgressByPaperId,
  hasTranslationByPaperId,
  onSelectPaper,
  onDeletePaper,
  onDeleteTranslation,
  onRetryPaper
}: PaperSidebarProps) {
  const handleDeletePaper = useCallback(
    (paperId: string, event: React.MouseEvent): void => {
      event.stopPropagation()
      onDeletePaper(paperId)
    },
    [onDeletePaper]
  )

  const handleRetryPaper = useCallback(
    (paperId: string, event: React.MouseEvent): void => {
      event.stopPropagation()
      onRetryPaper(paperId)
    },
    [onRetryPaper]
  )

  const handleDeleteTranslation = useCallback(
    (paperId: string, event: React.MouseEvent): void => {
      event.stopPropagation()
      onDeleteTranslation(paperId)
    },
    [onDeleteTranslation]
  )

  // Tooltip 状态：悬停时在列表项右侧显示完整标题（支持 LaTeX 渲染）
  const [tooltip, setTooltip] = useState<{
    html: string
    top: number
    left: number
  } | null>(null)
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleItemMouseEnter = useCallback(
    (_paperId: string, html: string, event: React.MouseEvent<HTMLDivElement>) => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
      // 在 setTimeout 前同步读取 DOM 信息，避免 React 合成事件回收后 currentTarget 变为 null
      const itemEl = event.currentTarget
      const sidebarEl = itemEl.closest('.paper-sidebar')
      if (!sidebarEl) return
      const sidebarRect = sidebarEl.getBoundingClientRect()
      const itemRect = itemEl.getBoundingClientRect()
      tooltipTimerRef.current = setTimeout(() => {
        setTooltip({
          html,
          top: itemRect.top + itemRect.height / 2,
          left: sidebarRect.right + 8
        })
      }, 400)
    },
    []
  )

  const handleItemMouseLeave = useCallback(() => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    setTooltip(null)
  }, [])

  return (
    <>
      <div className={['paper-sidebar', styles['paper-list']].join(' ')}>
        <CssTransitionGroup items={papers} name="sm-sidebar-list-item" getKey={getPaperKey} appear>
          {({ item: paper, index, transitionKey, className, ref }) => (
            <PaperSidebarItem
              ref={ref}
              key={transitionKey}
              paper={paper}
              index={index}
              className={className}
              isActive={paper.id === currentPaperId && isPaperReadable(paper)}
              renderProgress={renderProgressByPaperId[paper.id]}
              ocrProgress={ocrProgressByPaperId[paper.id]}
              hasTranslated={hasTranslationByPaperId[paper.id] === true}
              onSelectPaper={onSelectPaper}
              onDeletePaper={handleDeletePaper}
              onDeleteTranslation={handleDeleteTranslation}
              onRetryPaper={handleRetryPaper}
              onItemMouseEnter={handleItemMouseEnter}
              onItemMouseLeave={handleItemMouseLeave}
            />
          )}
        </CssTransitionGroup>
      </div>
      {tooltip &&
        createPortal(
          <div
            className={styles['paper-item__tooltip']}
            style={{ top: tooltip.top, left: tooltip.left }}
            dangerouslySetInnerHTML={{ __html: tooltip.html }}
          />,
          document.body
        )}
    </>
  )
}
