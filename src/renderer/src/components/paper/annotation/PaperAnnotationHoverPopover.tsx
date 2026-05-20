import type { PaperAnnotation, PaperAnnotationColorKey } from '@shared/types/paper'
import type { AnnotationHoverPopoverState } from '../composables/paperAnnotationComposerTypes'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './PaperAnnotationHoverPopover.module.css'

interface PaperAnnotationHoverPopoverProps {
  state: AnnotationHoverPopoverState
  annotation: PaperAnnotation
  highlightColorOptions: readonly PaperAnnotationColorKey[]
  error: string | null
  onDelete: () => void
  onOpenNoteEditor: () => void
  onUpdateColor: (colorKey: PaperAnnotationColorKey) => void
}

function isHighlight(annotation: PaperAnnotation): boolean {
  return annotation.kind === 'highlight'
}

export default function PaperAnnotationHoverPopover({
  state,
  annotation,
  highlightColorOptions,
  error,
  onDelete,
  onOpenNoteEditor,
  onUpdateColor
}: PaperAnnotationHoverPopoverProps) {
  return (
    <div
      className={[styles['paper-annotation-hover-popover'], 'paper-annotation-hover-popover'].join(
        ' '
      )}
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={[
          styles['paper-annotation-hover-popover__row'],
          'paper-annotation-hover-popover__row'
        ].join(' ')}
      >
        {isHighlight(annotation) && (
          <>
            {highlightColorOptions.map((colorKey) => (
              <button
                key={`hover-${colorKey}`}
                className={[
                  styles['paper-annotation-hover-popover__color-btn'],
                  'paper-annotation-hover-popover__color-btn',
                  annotation.colorKey === colorKey ? styles['is-active'] : '',
                  annotation.colorKey === colorKey ? 'is-active' : ''
                ]
                  .filter(Boolean)
                  .join(' ')}
                type="button"
                title={colorKey}
                onClick={() => onUpdateColor(colorKey)}
              >
                <span
                  className={[
                    styles['paper-annotation-hover-popover__dot'],
                    'paper-annotation-hover-popover__dot',
                    styles[`paper-annotation-hover-popover__dot--${colorKey}`],
                    `paper-annotation-hover-popover__dot--${colorKey}`
                  ].join(' ')}
                />
              </button>
            ))}

            <div
              className={[
                styles['paper-annotation-hover-popover__divider-v'],
                'paper-annotation-hover-popover__divider-v'
              ].join(' ')}
            />
          </>
        )}

        <button
          className={[
            styles['paper-annotation-hover-popover__action-btn'],
            'paper-annotation-hover-popover__action-btn'
          ].join(' ')}
          type="button"
          onClick={onDelete}
        >
          {isHighlight(annotation) ? '删除标记' : '删除笔记'}
        </button>

        <div
          className={[
            styles['paper-annotation-hover-popover__divider-v'],
            'paper-annotation-hover-popover__divider-v'
          ].join(' ')}
        />

        <button
          className={[
            styles['paper-annotation-hover-popover__action-btn'],
            'paper-annotation-hover-popover__action-btn'
          ].join(' ')}
          type="button"
          onClick={onOpenNoteEditor}
        >
          {isHighlight(annotation) && (
            <SvgIcon
              className={styles['paper-annotation-hover-popover__icon']}
              name="note"
              size={14}
            />
          )}
          <span>{isHighlight(annotation) ? '添加笔记' : '编辑笔记'}</span>
        </button>
      </div>

      {error && (
        <p
          className={[
            styles['paper-annotation-hover-popover__error'],
            'paper-annotation-hover-popover__error'
          ].join(' ')}
        >
          {error}
        </p>
      )}
    </div>
  )
}
