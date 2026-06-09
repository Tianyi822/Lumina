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

/** 文本选中后的浮动操作菜单组件，提供高亮、记笔记和添加到对话等功能 */
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
