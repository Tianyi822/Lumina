import { useRef, useCallback, useEffect } from 'react'
import type { NoteEditorState } from '../composables/paperAnnotationComposerTypes'
import styles from './PaperAnnotationNoteEditor.module.css'

interface PaperAnnotationNoteEditorProps {
  state: NoteEditorState
  comment: string
  isExistingNote: boolean
  canUpdate: boolean
  saving: boolean
  error: string | null
  onCommentChange: (value: string) => void
  onSave: () => void
  onUpdateNote: () => void
  onDeleteNote: () => void
  onClose: () => void
  onMove: (delta: { x: number; y: number }) => void
}

interface PointerState {
  clientX: number
  clientY: number
}

export default function PaperAnnotationNoteEditor({
  state,
  comment,
  isExistingNote,
  canUpdate,
  saving,
  error,
  onCommentChange,
  onSave,
  onUpdateNote,
  onDeleteNote,
  onClose,
  onMove
}: PaperAnnotationNoteEditorProps) {
  const dragStateRef = useRef<PointerState | null>(null)

  const stopDrag = useCallback(() => {
    dragStateRef.current = null
    window.removeEventListener('mousemove', handleDragMove)
    window.removeEventListener('mouseup', handleDragEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDragMove(event: MouseEvent): void {
    const dragState = dragStateRef.current
    if (!dragState) {
      return
    }

    onMove({
      x: event.clientX - dragState.clientX,
      y: event.clientY - dragState.clientY
    })
    dragStateRef.current = {
      clientX: event.clientX,
      clientY: event.clientY
    }
  }

  function handleDragEnd(): void {
    stopDrag()
  }

  const handleDragStart = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) {
        return
      }

      dragStateRef.current = {
        clientX: event.clientX,
        clientY: event.clientY
      }
      window.addEventListener('mousemove', handleDragMove)
      window.addEventListener('mouseup', handleDragEnd)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    return () => {
      stopDrag()
    }
  }, [stopDrag])

  return (
    <div
      className={styles['paper-annotation-note-editor']}
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={styles['paper-annotation-note-editor__header']}
        onMouseDown={(e) => {
          e.preventDefault()
          handleDragStart(e)
        }}
      >
        <div className={styles['paper-annotation-note-editor__title']}>
          {isExistingNote ? '编辑笔记' : '记录笔记'}
        </div>
        <button
          className={styles['paper-annotation-note-editor__close']}
          type="button"
          aria-label="关闭笔记编辑器"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className={styles['paper-annotation-note-editor__selection']}>
        {state.draft.selectedText}
      </div>
      <textarea
        value={comment}
        className={styles['paper-annotation-note-editor__input']}
        rows={7}
        placeholder="写下这段内容的笔记..."
        onChange={(e) => onCommentChange(e.target.value)}
      />
      <div className={styles['paper-annotation-note-editor__actions']}>
        <div className={styles['paper-annotation-note-editor__color-chip']} />
        {isExistingNote ? (
          <>
            <button
              className="sm-button sm-button--danger"
              type="button"
              disabled={saving}
              onClick={onDeleteNote}
            >
              删除笔记
            </button>
            <button
              className="sm-button sm-button--primary"
              type="button"
              disabled={saving || !canUpdate}
              onClick={onUpdateNote}
            >
              {saving ? '更新中...' : '更新笔记'}
            </button>
          </>
        ) : (
          <button
            className="sm-button sm-button--primary"
            type="button"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? '保存中...' : '保存笔记'}
          </button>
        )}
      </div>
      {error && <p className={styles['paper-annotation-note-editor__error']}>{error}</p>}
      {state.draft.viewKind === 'translation' && (
        <p className={styles['paper-annotation-note-editor__hint']}>
          该笔记只显示在当前译文中；如果之后删除译文，对应标注也会一起删除。
        </p>
      )}
    </div>
  )
}
