import { memo, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import type { RenderedSegment } from './hooks/usePaperMarkdownEngine'
import styles from './PaperMarkdownSegmentList.module.css'

interface VirtualItem {
  key: number | string | bigint
  index: number
  start: number
  size: number
}

export interface PaperMarkdownSegmentListHandle {
  getSegmentElement: (stableId: string) => HTMLElement | null
}

interface PaperMarkdownSegmentListProps {
  segments: RenderedSegment[]
  totalHeight: number
  virtualItems: VirtualItem[]
  measureElement: (node: HTMLElement | null) => void
  /**
   * 内容容器的 CSS zoom 值。虚拟容器与虚拟项位于 zoom 容器内部，
   * 而 TanStack 的 totalHeight/start 是「视觉像素」（与外层 scrollTop 同坐标系）。
   * 因此渲染时需除以 zoom 抵消内部缩放，保证视觉高度/位置与模型一致。
   */
  zoomLevel?: number
  onRetranslate?: (params: { segmentId: string; stableId: string }) => void
}

interface PaperMarkdownSegmentItemProps {
  segment: RenderedSegment
  onRetranslateClick: (segment: RenderedSegment) => void
}

const LIST_ITEM_INDENT = 2.8

function getButtonLeftIndent(translationHtml: string | null): string {
  if (!translationHtml) return '0'
  const trimmed = translationHtml.trimEnd()
  const match = trimmed.match(/((?:<\/(?:ul|ol)>\s*)+)$/)
  if (!match) return '0'
  const nestLevel = (match[1].match(/<\/(?:ul|ol)>/g) || []).length
  return `${nestLevel * LIST_ITEM_INDENT}em`
}

const PaperMarkdownSegmentItem = memo(
  function PaperMarkdownSegmentItem({
    segment,
    onRetranslateClick
  }: PaperMarkdownSegmentItemProps) {
    return (
      <section
        id={segment.segmentAnchorId}
        className={[
          styles['paper-markdown-view__segment'],
          'paper-markdown-view__segment',
          segment.isCenteredMeta ? styles['paper-markdown-view__segment--meta'] : '',
          segment.isCenteredMeta ? 'paper-markdown-view__segment--meta' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        data-paper-segment-stable-id={segment.stableId}
      >
        <div
          className={[
            styles['paper-markdown-view__segment-original'],
            'paper-markdown-view__segment-original'
          ].join(' ')}
          data-paper-selection-surface="true"
          data-view-kind="original"
          data-segment-stable-id={segment.stableId}
        >
          <div
            className={[
              styles['paper-markdown-view__markdown'],
              'paper-markdown-view__markdown'
            ].join(' ')}
            dangerouslySetInnerHTML={{ __html: segment.originalHtml }}
          />
        </div>

        {segment.showTranslation && (
          <div
            className={[
              styles['paper-markdown-view__segment-translation'],
              'paper-markdown-view__segment-translation',
              styles[`is-${segment.translationStatus}`]
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {segment.translationHtml ? (
              <>
                <div
                  className={[
                    styles['paper-markdown-view__segment-translation-body'],
                    'paper-markdown-view__segment-translation-body'
                  ].join(' ')}
                  data-paper-selection-surface="true"
                  data-view-kind="translation"
                  data-segment-stable-id={segment.stableId}
                >
                  <div
                    className={[
                      styles['paper-markdown-view__markdown'],
                      'paper-markdown-view__markdown'
                    ].join(' ')}
                    dangerouslySetInnerHTML={{ __html: segment.translationHtml }}
                  />
                </div>
                <button
                  className={[
                    styles['paper-markdown-view__retranslate-btn'],
                    'paper-markdown-view__retranslate-btn'
                  ].join(' ')}
                  type="button"
                  disabled={segment.translationStatus === 'translating'}
                  style={{
                    marginLeft: getButtonLeftIndent(segment.translationHtml)
                  }}
                  title="重新翻译"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRetranslateClick(segment)
                  }}
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
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  <span>重新翻译</span>
                </button>
              </>
            ) : (
              <>
                {segment.translationStatus === 'failed' ? (
                  <div className={styles['paper-markdown-view__translation-error']}>
                    该段翻译暂时失败，再次点击翻译按钮时会继续补全剩余内容。
                  </div>
                ) : (
                  <div
                    className={styles['paper-markdown-view__translation-placeholder']}
                    aria-hidden="true"
                  >
                    <span className={styles['paper-markdown-view__translation-placeholder-text']}>
                      正在翻译...
                    </span>
                    <span className={styles['paper-markdown-view__translation-placeholder-bar']} />
                    <span className={styles['paper-markdown-view__translation-placeholder-bar']} />
                    <span className={styles['paper-markdown-view__translation-placeholder-bar']} />
                  </div>
                )}
                <button
                  className={[
                    styles['paper-markdown-view__retranslate-btn'],
                    'paper-markdown-view__retranslate-btn'
                  ].join(' ')}
                  type="button"
                  disabled={segment.translationStatus === 'translating'}
                  title="重新翻译"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRetranslateClick(segment)
                  }}
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
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  <span>重新翻译</span>
                </button>
              </>
            )}
          </div>
        )}
      </section>
    )
  },
  (prev, next) => {
    if (prev.segment.annotations.length !== next.segment.annotations.length) return false
    for (let i = 0; i < prev.segment.annotations.length; i++) {
      if (prev.segment.annotations[i] !== next.segment.annotations[i]) return false
    }
    return (
      prev.segment.renderId === next.segment.renderId &&
      prev.segment.stableId === next.segment.stableId &&
      prev.segment.sourceRevisionId === next.segment.sourceRevisionId &&
      prev.segment.textHash === next.segment.textHash &&
      prev.segment.kind === next.segment.kind &&
      prev.segment.originalHtml === next.segment.originalHtml &&
      prev.segment.translationHtml === next.segment.translationHtml &&
      prev.segment.translationText === next.segment.translationText &&
      prev.segment.translationStatus === next.segment.translationStatus &&
      prev.segment.showTranslation === next.segment.showTranslation &&
      prev.segment.segmentAnchorId === next.segment.segmentAnchorId &&
      prev.segment.isCenteredMeta === next.segment.isCenteredMeta &&
      prev.onRetranslateClick === next.onRetranslateClick
    )
  }
)

const PaperMarkdownSegmentList = forwardRef<
  PaperMarkdownSegmentListHandle,
  PaperMarkdownSegmentListProps
>(function PaperMarkdownSegmentList(
  { segments, totalHeight, virtualItems, measureElement, zoomLevel = 1, onRetranslate },
  ref
) {
  const zoomDivisor = zoomLevel || 1
  const [confirmDialog, setConfirmDialog] = useState<{
    segmentId: string
    stableId: string
  } | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      getSegmentElement(stableId: string) {
        return document.querySelector(`[data-paper-segment-stable-id="${stableId}"]`)
      }
    }),
    []
  )

  const handleRetranslateClick = useCallback(
    (segment: RenderedSegment) => {
      if (segment.translationStatus === 'translating') {
        return
      }

      if (segment.annotations.length > 0) {
        setConfirmDialog({ segmentId: segment.renderId, stableId: segment.stableId })
        return
      }

      onRetranslate?.({ segmentId: segment.renderId, stableId: segment.stableId })
    },
    [onRetranslate]
  )

  const handleConfirmRetranslate = useCallback(() => {
    if (!confirmDialog) {
      return
    }

    onRetranslate?.(confirmDialog)
    setConfirmDialog(null)
  }, [confirmDialog, onRetranslate])

  const handleCancelRetranslate = useCallback(() => {
    setConfirmDialog(null)
  }, [])

  return (
    <>
      <div
        className={styles['paper-markdown-view__virtual-container']}
        style={{ height: totalHeight / zoomDivisor }}
      >
        {virtualItems.map((vItem) => {
          const segment = segments[vItem.index]
          if (!segment) return null
          return (
            <div
              key={vItem.key}
              className={styles['paper-markdown-view__virtual-item']}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translateY(${vItem.start / zoomDivisor}px)`,
                width: '100%'
              }}
              data-index={vItem.index}
              data-stable-id={segment.stableId}
              ref={measureElement}
            >
              <PaperMarkdownSegmentItem
                segment={segment}
                onRetranslateClick={handleRetranslateClick}
              />
            </div>
          )
        })}
      </div>

      {confirmDialog &&
        createPortal(
          <div
            className={styles['paper-retranslate-overlay']}
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCancelRetranslate()
            }}
          >
            <div className={styles['paper-retranslate-dialog']}>
              <div className={styles['paper-retranslate-dialog__title']}>重新翻译</div>
              <div className={styles['paper-retranslate-dialog__body']}>
                该段落存在批注或笔记。继续重新翻译后，这些标注会一起删除。
              </div>
              <div className={styles['paper-retranslate-dialog__actions']}>
                <button
                  className={[
                    styles['paper-retranslate-dialog__btn'],
                    styles['paper-retranslate-dialog__btn--cancel']
                  ].join(' ')}
                  type="button"
                  onClick={handleCancelRetranslate}
                >
                  取消
                </button>
                <button
                  className={[
                    styles['paper-retranslate-dialog__btn'],
                    styles['paper-retranslate-dialog__btn--confirm']
                  ].join(' ')}
                  type="button"
                  onClick={handleConfirmRetranslate}
                >
                  继续翻译
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
})

export default memo(PaperMarkdownSegmentList)
