import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { useTranslation } from 'react-i18next'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import type { PaperFigureItem } from '@shared/types/paper'
import { normalizePaperInlineMathForRender } from '@shared/utils/paperMarkdown'
import styles from '../WorkspaceToolbar.module.css'

const captionMd = new MarkdownIt({ html: true, breaks: true }).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'brackets', 'beg_end'],
  katexOptions: { throwOnError: false, strict: 'ignore', output: 'htmlAndMathml' }
})

/** 论文图片面板：工具栏中展示论文图片缩略图列表，支持预览 */
interface FigurePanelProps {
  showFigurePanel: boolean
  onToggle: () => void
  canOpenFigurePanel: boolean
  currentFigureLoading: boolean
  currentPaperFigures: PaperFigureItem[]
  getFigureItemLabel: (figure: PaperFigureItem) => string
  onPreviewFigure: (figure: PaperFigureItem) => void
  containerRef: React.RefObject<HTMLDivElement | null>
  figurePanelRef: React.RefObject<HTMLDivElement | null>
}

export default function FigurePanel({
  showFigurePanel,
  onToggle,
  canOpenFigurePanel,
  currentFigureLoading,
  currentPaperFigures,
  getFigureItemLabel,
  onPreviewFigure,
  containerRef,
  figurePanelRef
}: FigurePanelProps) {
  const { t } = useTranslation()
  return (
    <div ref={containerRef} className={styles['sm-workspace-toolbar__figures']}>
      <div className={styles['sm-workspace-toolbar__item-wrap']}>
        <button
          className={[
            'sm-icon-button',
            styles['sm-workspace-toolbar__button'],
            showFigurePanel && styles['is-active']
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={t('chrome.toolbar.openFigures')}
          aria-haspopup="dialog"
          aria-expanded={showFigurePanel}
          disabled={!canOpenFigurePanel}
          onClick={onToggle}
        >
          <SvgIcon name="image" size={18} />
        </button>
        <span className={styles['sm-workspace-toolbar__tooltip']} role="tooltip">
          {t('chrome.toolbar.figures')}
        </span>
      </div>

      {showFigurePanel && (
        <div
          ref={figurePanelRef}
          className={styles['sm-workspace-toolbar__figure-panel']}
          role="dialog"
          aria-label={t('chrome.toolbar.figuresAria')}
        >
          <div className={styles['sm-workspace-toolbar__toc-header']}>
            {t('chrome.toolbar.figures')}
          </div>

          {currentFigureLoading ? (
            <div className={styles['sm-workspace-toolbar__toc-state']}>
              {t('chrome.toolbar.figuresLoading')}
            </div>
          ) : currentPaperFigures.length === 0 ? (
            <div className={styles['sm-workspace-toolbar__toc-state']}>
              {t('chrome.toolbar.figuresEmpty')}
            </div>
          ) : (
            <div className={styles['sm-workspace-toolbar__figure-scroll']}>
              {currentPaperFigures.map((figure) => (
                <div key={figure.id} className={styles['sm-workspace-toolbar__figure-item']}>
                  <img
                    src={figure.imagePath}
                    alt={getFigureItemLabel(figure)}
                    className={styles['sm-workspace-toolbar__figure-thumb']}
                  />

                  <div className={styles['sm-workspace-toolbar__figure-copy']}>
                    <div
                      className={styles['sm-workspace-toolbar__figure-caption']}
                      title={getFigureItemLabel(figure)}
                      dangerouslySetInnerHTML={{
                        __html: captionMd.render(
                          normalizePaperInlineMathForRender(getFigureItemLabel(figure), 'paragraph')
                        )
                      }}
                    />
                  </div>

                  <button
                    className={styles['sm-workspace-toolbar__figure-preview']}
                    type="button"
                    onClick={() => onPreviewFigure(figure)}
                  >
                    {t('chrome.toolbar.preview')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
