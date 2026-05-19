import type { CSSProperties } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { formatFileSize } from '@shared/utils'
import type { OcrProgressInfo, PaperDocument, PaperStatus } from '@shared/types/paper'
import type { RenderingProgress } from '@renderer/stores/paperReaderStore'
import { getSidebarListItemMotionStyle } from '@renderer/utils/sidebarListMotion'
import styles from './PaperSidebar.module.css'

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
  function handleSelectPaper(paper: PaperDocument): void {
    if (!isPaperReadable(paper)) {
      return
    }

    onSelectPaper(paper.id)
  }

  function handleDeletePaper(paperId: string, event: React.MouseEvent): void {
    event.stopPropagation()
    onDeletePaper(paperId)
  }

  function handleRetryPaper(paperId: string, event: React.MouseEvent): void {
    event.stopPropagation()
    onRetryPaper(paperId)
  }

  function hasTranslated(paperId: string): boolean {
    return hasTranslationByPaperId[paperId] === true
  }

  function handleDeleteTranslation(paperId: string, event: React.MouseEvent): void {
    event.stopPropagation()
    onDeleteTranslation(paperId)
  }

  return (
    <div className="paper-sidebar sm-sidebar-shell__body sm-sidebar-shell__body--flush">
      <div className={styles['paper-list']}>
        {papers.map((paper, index) => (
          <div
            key={paper.id}
            style={getSidebarListItemMotionStyle(index) as CSSProperties}
            className={[
              styles['paper-item'],
              paper.id === currentPaperId && isPaperReadable(paper)
                ? styles['paper-item--active']
                : '',
              !isPaperReadable(paper) ? styles['paper-item--disabled'] : ''
            ]
              .filter(Boolean)
              .join(' ')}
            aria-disabled={!isPaperReadable(paper)}
            onClick={() => handleSelectPaper(paper)}
          >
            <div className={styles['paper-item__icon']}>
              <SvgIcon name="file-pdf" size={20} />
            </div>

            <div className={styles['paper-item__info']}>
              <div className={styles['paper-item__name']} title={paper.fileName}>
                {paper.fileName}
              </div>
              <div className={styles['paper-item__meta-row']}>
                <div className={styles['paper-item__meta']}>
                  <span>{paper.pageCount} 页</span>
                  <span className={styles['paper-item__meta-sep']}>·</span>
                  <span>{formatFileSize(paper.fileSize)}</span>
                </div>

                {hasTranslated(paper.id) && (
                  <button
                    className={styles['paper-item__translation-tag']}
                    type="button"
                    title="点击删除翻译内容"
                    onClick={(e) => handleDeleteTranslation(paper.id, e)}
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
                    onClick={(e) => handleRetryPaper(paper.id, e)}
                  >
                    重试
                  </button>
                </div>
              )}

              {!isPaperReadable(paper) && (
                <div className={styles['paper-item__unreadable']}>{getUnreadableText(paper)}</div>
              )}
            </div>

            <div className={styles['paper-item__actions']}>
              <button
                className={styles['paper-item__delete-btn']}
                title="删除论文"
                type="button"
                onClick={(e) => handleDeletePaper(paper.id, e)}
              >
                <SvgIcon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
