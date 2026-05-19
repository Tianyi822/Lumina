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
}

export default function PaperAnnotationSelectionMenu({
  state,
  highlightColorOptions,
  error,
  onCreateHighlight,
  onOpenNoteEditor,
  onAddToChat
}: PaperAnnotationSelectionMenuProps) {
  return (
    <div
      className={styles['paper-annotation-selection-menu']}
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles['paper-annotation-selection-menu__row']}>
        {highlightColorOptions.map((colorKey) => (
          <button
            key={colorKey}
            className={styles['paper-annotation-selection-menu__color-btn']}
            type="button"
            title={colorKey}
            onClick={() => onCreateHighlight(colorKey)}
          >
            <span
              className={[
                styles['paper-annotation-selection-menu__dot'],
                styles[`paper-annotation-selection-menu__dot--${colorKey}`]
              ].join(' ')}
            />
          </button>
        ))}

        <div className={styles['paper-annotation-selection-menu__divider-v']} />

        <button
          className={styles['paper-annotation-selection-menu__note-btn']}
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

        <div className={styles['paper-annotation-selection-menu__divider-v']} />

        <button
          className={styles['paper-annotation-selection-menu__note-btn']}
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
      </div>

      {error && <p className={styles['paper-annotation-selection-menu__error']}>{error}</p>}
    </div>
  )
}
