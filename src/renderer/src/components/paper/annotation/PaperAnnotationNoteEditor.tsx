import { useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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

/** 批注笔记编辑器组件，支持拖拽移动、新增/编辑/删除笔记，展示选中文本和保存状态 */
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
  const { t } = useTranslation()
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
      className={[styles['paper-annotation-note-editor'], 'paper-annotation-note-editor'].join(' ')}
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={[
          styles['paper-annotation-note-editor__header'],
          'paper-annotation-note-editor__header'
        ].join(' ')}
        onMouseDown={(e) => {
          e.preventDefault()
          handleDragStart(e)
        }}
      >
        <div
          className={[
            styles['paper-annotation-note-editor__title'],
            'paper-annotation-note-editor__title'
          ].join(' ')}
        >
          {isExistingNote
            ? t('paper.annotation.noteEditor.titleEdit')
            : t('paper.annotation.noteEditor.titleCreate')}
        </div>
        <button
          className={[
            styles['paper-annotation-note-editor__close'],
            'paper-annotation-note-editor__close'
          ].join(' ')}
          type="button"
          aria-label={t('paper.annotation.noteEditor.closeAria')}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div
        className={[
          styles['paper-annotation-note-editor__selection'],
          'paper-annotation-note-editor__selection'
        ].join(' ')}
      >
        {state.draft.selectedText}
      </div>
      <textarea
        value={comment}
        className={[
          styles['paper-annotation-note-editor__input'],
          'paper-annotation-note-editor__input'
        ].join(' ')}
        rows={7}
        placeholder={t('paper.annotation.noteEditor.placeholder')}
        onChange={(e) => onCommentChange(e.target.value)}
      />
      <div
        className={[
          styles['paper-annotation-note-editor__actions'],
          'paper-annotation-note-editor__actions'
        ].join(' ')}
      >
        <div
          className={[
            styles['paper-annotation-note-editor__color-chip'],
            'paper-annotation-note-editor__color-chip'
          ].join(' ')}
        />
        {isExistingNote ? (
          <>
            <button
              className="sm-button sm-button--danger"
              type="button"
              disabled={saving}
              onClick={onDeleteNote}
            >
              {t('paper.annotation.noteEditor.delete')}
            </button>
            <button
              className="sm-button sm-button--primary"
              type="button"
              disabled={saving || !canUpdate}
              onClick={onUpdateNote}
            >
              {saving
                ? t('paper.annotation.noteEditor.updateSaving')
                : t('paper.annotation.noteEditor.update')}
            </button>
          </>
        ) : (
          <button
            className="sm-button sm-button--primary"
            type="button"
            disabled={saving}
            onClick={onSave}
          >
            {saving
              ? t('paper.annotation.noteEditor.createSaving')
              : t('paper.annotation.noteEditor.create')}
          </button>
        )}
      </div>
      {error && (
        <p
          className={[
            styles['paper-annotation-note-editor__error'],
            'paper-annotation-note-editor__error'
          ].join(' ')}
        >
          {error}
        </p>
      )}
      {state.draft.viewKind === 'translation' && (
        <p
          className={[
            styles['paper-annotation-note-editor__hint'],
            'paper-annotation-note-editor__hint'
          ].join(' ')}
        >
          {t('paper.annotation.noteEditor.syncNotice')}
        </p>
      )}
    </div>
  )
}
