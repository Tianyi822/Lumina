import { memo, forwardRef, useState, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { CssTransitionGroup } from '@renderer/components/motion/CssTransition'
import { formatFileSize } from '@shared/utils'
import { normalizePaperInlineMathForRender } from '@shared/utils/paperMarkdown'
import type { OcrProgressInfo, PaperDocument } from '@shared/types/paper'
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

/** OCR 进度文案 key（paper.sidebar.*），渲染处经 t() 取当前语言文案 */
const OCR_PROGRESS_LABEL_KEYS: Record<string, string> = {
  idle: 'paper.sidebar.statusIdle',
  queued: 'paper.sidebar.statusQueued',
  processing: 'paper.sidebar.statusProcessing',
  completed: 'paper.sidebar.statusCompleted',
  partial_failed: 'paper.sidebar.statusPartialFailed',
  failed: 'paper.sidebar.statusFailed',
  cancelled: 'paper.sidebar.statusCancelled'
}

/** 论文状态降级文案 key（draft/rendering 同显“待开始”） */
const PAPER_STATUS_LABEL_KEYS: Record<string, string> = {
  draft: 'paper.sidebar.statusIdle',
  rendering: 'paper.sidebar.statusIdle',
  ocr_processing: 'paper.sidebar.statusProcessing',
  completed: 'paper.sidebar.statusCompleted',
  partial_failed: 'paper.sidebar.statusPartialFailed',
  failed: 'paper.sidebar.statusFailed'
}

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

// 获取渲染进度：优先使用 store 中的实时进度，无则退化为 pageAssets 数量
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

  // 无实时进度时，以已生成的页面资产数量估算
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
  // 处理总页数为 0 的边缘情况
  if (progress.totalPages === 0) return 0
  return Math.min(100, Math.round((progress.completedPages / progress.totalPages) * 100))
}

// 获取 OCR 进度：优先使用实时进度信息，无则从论文状态反推（返回文案 key，渲染处经 t() 翻译）
function getOcrProgress(
  paper: PaperDocument,
  ocrProgressByPaperId: Record<string, OcrProgressInfo>
): {
  completedPages: number
  totalPages: number
  hintKey: string
} {
  const progress = ocrProgressByPaperId[paper.id]
  if (progress) {
    // 将 OcrProgressInfo 状态映射为文案 key
    return {
      completedPages: progress.completedPages,
      totalPages: progress.totalPages || paper.pageCount,
      hintKey: OCR_PROGRESS_LABEL_KEYS[progress.status] ?? 'paper.sidebar.statusIdle'
    }
  }

  // 无实时进度时用 PaperStatus 做降级映射
  return {
    completedPages: paper.completedPageCount,
    totalPages: paper.pageCount,
    hintKey: PAPER_STATUS_LABEL_KEYS[paper.status] ?? 'paper.sidebar.statusIdle'
  }
}

function formatOcrProgressText(
  paper: PaperDocument,
  ocrProgressByPaperId: Record<string, OcrProgressInfo>,
  t: TFunction
): string {
  const progress = getOcrProgress(paper, ocrProgressByPaperId)
  return `${progress.completedPages}/${progress.totalPages}（${t(progress.hintKey)}）`
}

function getOcrProgressPercent(
  paper: PaperDocument,
  ocrProgressByPaperId: Record<string, OcrProgressInfo>
): number {
  const progress = getOcrProgress(paper, ocrProgressByPaperId)
  if (progress.totalPages === 0) return 0
  return Math.min(100, Math.round((progress.completedPages / progress.totalPages) * 100))
}

function shouldShowRenderProgress(
  paper: PaperDocument,
  renderProgressByPaperId: Record<string, RenderingProgress>
): boolean {
  if (paper.status !== 'rendering') return false
  const progress = renderProgressByPaperId[paper.id]
  if (!progress) return true
  return progress.stage !== 'completed'
}

function shouldShowOcrProgress(
  paper: PaperDocument,
  ocrProgressByPaperId: Record<string, OcrProgressInfo>
): boolean {
  const progress = ocrProgressByPaperId[paper.id]
  if (progress?.status === 'queued') return true
  return paper.status === 'ocr_processing'
}

function shouldShowRetry(paper: PaperDocument): boolean {
  return paper.status === 'failed' || paper.status === 'partial_failed'
}

// 根据失败阶段生成重试提示消息，优先展示详细的错误信息
function getRetryMessage(
  paper: PaperDocument,
  renderProgressByPaperId: Record<string, RenderingProgress>,
  ocrProgressByPaperId: Record<string, OcrProgressInfo>,
  t: TFunction
): string {
  const renderProgress = renderProgressByPaperId[paper.id]
  // 截图阶段失败 → 展示 render 错误信息
  if (renderProgress?.stage === 'failed') {
    return renderProgress.error || paper.errorMessage || t('paper.sidebar.renderFailedHint')
  }

  // 部分失败 → 提示可重试 OCR
  if (paper.status === 'partial_failed') {
    return t('paper.sidebar.hasFailedPagesHint')
  }

  // 完全失败 → 展示 OCR 错误信息
  const ocrProgress = ocrProgressByPaperId[paper.id]
  return ocrProgress?.errorMessage || paper.errorMessage || t('paper.sidebar.ocrFailedHint')
}

// 根据论文状态判断不可阅读时的显示文本
function getUnreadableText(paper: PaperDocument, t: TFunction): string {
  if (shouldShowRetry(paper)) {
    return t('paper.sidebar.unreadableFailed')
  }

  if (paper.status === 'failed' || paper.status === 'partial_failed') {
    return t('paper.sidebar.unreadableIncomplete')
  }

  return t('paper.sidebar.unreadableProcessing')
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
    const { t } = useTranslation()
    // 优先使用标题，无标题时从文件名去除 .pdf 后缀
    const displayName = paper.title || paper.fileName.replace(/\.pdf$/i, '')
    const renderedHtml = useMemo(
      () => renderPaperTitleHtml(paper.id, displayName),
      [displayName, paper.id]
    )
    // 构造单条目的 progress map 传给子组件（复用 EMPTY_*_MAP 避免空数据时创建新对象）
    const renderProgressByPaperId = useMemo<Record<string, RenderingProgress>>(
      () => (renderProgress ? { [paper.id]: renderProgress } : EMPTY_RENDER_PROGRESS_MAP),
      [paper.id, renderProgress]
    )
    const ocrProgressByPaperId = useMemo<Record<string, OcrProgressInfo>>(
      () => (ocrProgress ? { [paper.id]: ocrProgress } : EMPTY_OCR_PROGRESS_MAP),
      [ocrProgress, paper.id]
    )

    const readable = isPaperReadable(paper)

    // 按照失败阶段优先级的顺序确定重试按钮标题
    const getRetryTitle = (): string => {
      const renderProgress = renderProgressByPaperId[paper.id]
      // 截图阶段失败优先于 OCR 阶段
      if (renderProgress?.stage === 'failed') {
        return t('paper.sidebar.retryTitleScreenshot')
      }

      if (paper.status === 'partial_failed') {
        return t('paper.sidebar.retryTitlePartial')
      }

      return t('paper.sidebar.retryTitleOcr')
    }

    return (
      <div
        ref={ref}
        style={getSidebarListItemMotionStyle(index) as CSSProperties}
        className={[
          /* 组装 className：基础样式 + 选中态 + 禁用态 + 外部传入样式 */
          styles['paper-item'],
          isActive ? styles['paper-item--active'] : '',
          !readable ? styles['paper-item--disabled'] : '',
          className
        ]
          .filter(Boolean)
          .join(' ')}
        aria-disabled={!readable}
        onClick={() => {
          /* 仅可读论文响应点击事件 */
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
              <span>{t('paper.sidebar.pagesCount', { count: paper.pageCount })}</span>
              <span className={styles['paper-item__meta-sep']}>·</span>
              <span>{formatFileSize(paper.fileSize)}</span>
            </div>

            {/* 有译文标记：显示有译文标签，可点击删除翻译 */}
            {hasTranslated && (
              <button
                className={styles['paper-item__translation-tag']}
                type="button"
                title={t('paper.sidebar.deleteTranslationTooltip')}
                onClick={(event) => onDeleteTranslation(paper.id, event)}
              >
                <span className={styles['paper-item__translation-tag-default']}>
                  {t('paper.sidebar.hasTranslation')}
                </span>
                <span className={styles['paper-item__translation-tag-delete']}>
                  {t('paper.sidebar.deleteTranslation')}
                </span>
              </button>
            )}
          </div>

          {/* rendering 状态：显示截图进度条 */}
          {shouldShowRenderProgress(paper, renderProgressByPaperId) && (
            <div className={styles['paper-item__progress']}>
              <div className={styles['paper-item__progress-line']}>
                <span className={styles['paper-item__progress-label']}>
                  {t('paper.sidebar.screenshotProgress')}
                </span>
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

          {/* ocr_processing 状态（且不在 rendering 中）：显示 OCR 进度条 */}
          {!shouldShowRenderProgress(paper, renderProgressByPaperId) &&
            shouldShowOcrProgress(paper, ocrProgressByPaperId) && (
              <div className={styles['paper-item__progress']}>
                <div className={styles['paper-item__progress-line']}>
                  <span className={styles['paper-item__progress-label']}>
                    {t('paper.sidebar.ocrProgress')}
                  </span>
                  <span>{formatOcrProgressText(paper, ocrProgressByPaperId, t)}</span>
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

          {/* failed/partial_failed 状态：显示错误信息和重试按钮 */}
          {shouldShowRetry(paper) && (
            <div className={styles['paper-item__retry']}>
              <div className={styles['paper-item__retry-title']}>{getRetryTitle()}</div>
              <div className={styles['paper-item__retry-message']}>
                {getRetryMessage(paper, renderProgressByPaperId, ocrProgressByPaperId, t)}
              </div>
              <button
                className={styles['paper-item__retry-btn']}
                type="button"
                onClick={(event) => onRetryPaper(paper.id, event)}
              >
                {t('paper.sidebar.retry')}
              </button>
            </div>
          )}

          {/* 不可读状态（处理中或失败）：显示提示文本 */}
          {!readable && (
            <div className={styles['paper-item__unreadable']}>{getUnreadableText(paper, t)}</div>
          )}
        </div>

        <div className={styles['paper-item__actions']}>
          <button
            className={styles['paper-item__delete-btn']}
            title={t('paper.sidebar.deletePaperTooltip')}
            type="button"
            onClick={(event) => onDeletePaper(paper.id, event)}
          >
            <SvgIcon name="trash" size={14} />
          </button>
        </div>
      </div>
    )
  }),
  // 自定义比较器：逐字段比较 props，避免无关属性变化导致不必要重渲染
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
  // 阻止冒泡，防止点击删除按钮触发父级 onClick 选中论文
  const handleDeletePaper = useCallback(
    (paperId: string, event: React.MouseEvent): void => {
      event.stopPropagation()
      onDeletePaper(paperId)
    },
    [onDeletePaper]
  )

  // 阻止冒泡，防止点击重试按钮触发父级 onClick
  const handleRetryPaper = useCallback(
    (paperId: string, event: React.MouseEvent): void => {
      event.stopPropagation()
      onRetryPaper(paperId)
    },
    [onRetryPaper]
  )

  // 阻止冒泡，防止点击删除翻译触发父级 onClick
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

  // 鼠标悬停 400ms 后，在列表项右侧弹出 LaTeX 渲染后的完整标题 tooltip
  const handleItemMouseEnter = useCallback(
    (_paperId: string, html: string, event: React.MouseEvent<HTMLDivElement>) => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
      // 在 setTimeout 前同步读取 DOM 信息，避免 React 合成事件回收后 currentTarget 变为 null
      const itemEl = event.currentTarget
      // 通过 closest 找到侧边栏容器，计算 tooltip 绝对定位
      const sidebarEl = itemEl.closest('.paper-sidebar')
      if (!sidebarEl) return
      const sidebarRect = sidebarEl.getBoundingClientRect()
      const itemRect = itemEl.getBoundingClientRect()
      // tooltip 定位在列表项右侧 8px、垂直居中
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
              // 选中态条件：论文 ID 匹配且论文可读（不可读论文不能被选中）
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
      {/* 将 tooltip 渲染到 document.body 下，避免被侧边栏 overflow: hidden 裁剪 */}
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
