import type { PaperAnnotationColorKey } from '@shared/types/paper'
import type { SelectionActionMenuState } from '../composables/paperAnnotationComposerTypes'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './PaperAnnotationSelectionMenu.module.css'

interface PaperAnnotationSelectionMenuProps {
  state: SelectionActionMenuState
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  error: string | null
  onCreateHighlight: (colorKey: PaperAnnotationColorKey) => void
  onOpenNoteEditor: () => void
  onAddToChat: () => void
  onCopyLatex?: () => void
}

const HAS_LATEX_PATTERN = /\$[^$]+\$/

export default function PaperAnnotationSelectionMenu({
  state,
  highlightColorOptions,
  error,
  onCreateHighlight,
  onOpenNoteEditor,
  onAddToChat,
  onCopyLatex
}: PaperAnnotationSelectionMenuProps) {
  const hasLatex = HAS_LATEX_PATTERN.test(state.draft.selectedText)

  return (
    <div
      className={[
        styles['paper-annotation-selection-menu'],
        'paper-annotation-selection-menu'
      ].join(' ')}
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={[
          styles['paper-annotation-selection-menu__row'],
          'paper-annotation-selection-menu__row'
        ].join(' ')}
      >
        {highlightColorOptions.map((colorKey) => (
          <button
            key={colorKey}
            className={[
              styles['paper-annotation-selection-menu__color-btn'],
              'paper-annotation-selection-menu__color-btn'
            ].join(' ')}
            type="button"
            title={colorKey}
            onClick={() => onCreateHighlight(colorKey)}
          >
            <span
              className={[
                styles['paper-annotation-selection-menu__dot'],
                'paper-annotation-selection-menu__dot',
                styles[`paper-annotation-selection-menu__dot--${colorKey}`],
                `paper-annotation-selection-menu__dot--${colorKey}`
              ].join(' ')}
            />
          </button>
        ))}

        <div
          className={[
            styles['paper-annotation-selection-menu__divider-v'],
            'paper-annotation-selection-menu__divider-v'
          ].join(' ')}
        />

        <button
          className={[
            styles['paper-annotation-selection-menu__note-btn'],
            'paper-annotation-selection-menu__note-btn'
          ].join(' ')}
          type="button"
          onClick={onOpenNoteEditor}
        >
          <SvgIcon
            className={styles['paper-annotation-selection-menu__icon']}
            name="note"
            size={14}
          />
          <span className="paper-annotation-selection-menu__label">记录笔记</span>
        </button>

        <div
          className={[
            styles['paper-annotation-selection-menu__divider-v'],
            'paper-annotation-selection-menu__divider-v'
          ].join(' ')}
        />

        <button
          className={[
            styles['paper-annotation-selection-menu__note-btn'],
            'paper-annotation-selection-menu__note-btn'
          ].join(' ')}
          type="button"
          onClick={onAddToChat}
        >
          <SvgIcon
            className={styles['paper-annotation-selection-menu__icon']}
            name="chat"
            size={14}
          />
          <span className="paper-annotation-selection-menu__label">添加到对话</span>
        </button>

        {hasLatex && onCopyLatex && (
          <>
            <div
              className={[
                styles['paper-annotation-selection-menu__divider-v'],
                'paper-annotation-selection-menu__divider-v'
              ].join(' ')}
            />

            <button
              className={[
                styles['paper-annotation-selection-menu__note-btn'],
                'paper-annotation-selection-menu__note-btn'
              ].join(' ')}
              type="button"
              onClick={onCopyLatex}
            >
              <svg
                className={styles['paper-annotation-selection-menu__icon']}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              <span className="paper-annotation-selection-menu__label">复制 LaTeX</span>
            </button>
          </>
        )}
      </div>

      {error && (
        <p
          className={[
            styles['paper-annotation-selection-menu__error'],
            'paper-annotation-selection-menu__error'
          ].join(' ')}
        >
          {error}
        </p>
      )}
    </div>
  )
}
