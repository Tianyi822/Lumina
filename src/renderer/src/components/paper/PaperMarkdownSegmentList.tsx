import { memo, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import type { RenderedSegment } from './hooks/usePaperMarkdownEngine'
import { getTranslationBlockDisplay } from './composables/paperTranslationBlockDisplay'
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

// 从译文 HTML 末尾匹配连续闭合的列表标签，计算嵌套层级以动态调整重翻按钮的左缩进
function getButtonLeftIndent(translationHtml: string | null): string {
  if (!translationHtml) return '0'
  const trimmed = translationHtml.trimEnd()
  // 匹配末尾连续出现的 </ul> 或 </ol> 闭合标签
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
    const htmlStatus = segment.htmlStatus ?? (segment.originalHtml ? 'ready' : 'pending')
    const isReady = htmlStatus === 'ready'
    const showError = htmlStatus === 'error'
    const translationDisplay = getTranslationBlockDisplay(segment)

    return (
      <section
        id={segment.kind === 'heading' ? undefined : segment.segmentAnchorId}
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
          {isReady ? (
            <div
              className={[
                styles['paper-markdown-view__markdown'],
                'paper-markdown-view__markdown'
              ].join(' ')}
              dangerouslySetInnerHTML={{ __html: segment.originalHtml }}
            />
          ) : showError ? (
            <p className={styles['paper-markdown-view__segment-fallback']}>{segment.originalText}</p>
          ) : (
            <div
              className={styles['paper-markdown-view__segment-skeleton']}
              aria-hidden="true"
            />
          )}
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
            {translationDisplay === 'content' && segment.translationHtml ? (
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
            ) : translationDisplay === 'failed' ? (
              <div className={styles['paper-markdown-view__translation-error']}>
                该段翻译暂时失败，再次点击翻译按钮时会继续补全剩余内容。
              </div>
            ) : translationDisplay === 'translating' ? (
              <>
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
                <button
                  className={[
                    styles['paper-markdown-view__retranslate-btn'],
                    'paper-markdown-view__retranslate-btn'
                  ].join(' ')}
                  type="button"
                  disabled
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
              <div
                className={styles['paper-markdown-view__segment-skeleton']}
                aria-hidden="true"
              />
            )}
          </div>
        )}
      </section>
    )
  },
  // 自定义 memo 比较：先比较批注数量与引用，再逐字段浅比较确保仅必要时才重渲染
  (prev, next) => {
    // 批注数组长度不同或任意批注引用不同则需重渲染
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
      prev.segment.htmlStatus === next.segment.htmlStatus &&
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

/** 虚拟化段落列表组件，渲染论文段落（含原文/译文、翻译进度和重翻确认对话框） */
const PaperMarkdownSegmentList = forwardRef<
  PaperMarkdownSegmentListHandle,
  PaperMarkdownSegmentListProps
>(function PaperMarkdownSegmentList(
  { segments, totalHeight, virtualItems, measureElement, zoomLevel = 1, onRetranslate },
  ref
) {
  // TanStack Virtual 的 totalHeight/start 基于视口坐标系，而在 CSS zoom 内部需除以缩放比保持视觉位置一致
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
      // 正在翻译中禁止重复点击
      if (segment.translationStatus === 'translating') {
        return
      }

      // 该段落存在批注时弹出确认对话框，提示用户翻译会删除批注
      if (segment.annotations.length > 0) {
        setConfirmDialog({ segmentId: segment.renderId, stableId: segment.stableId })
        return
      }

      // 无批注时直接触发重新翻译
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
          // 仅在 segments 数组中找到对应索引时才渲染，防止异步更新时空指针
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
                // 虚拟偏移量除以 zoomDivisor，补偿 CSS zoom 造成的内部缩放
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
            // 点击遮罩层本身（非弹窗内部）时取消
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
