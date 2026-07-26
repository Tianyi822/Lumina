import { useEffect, useMemo, useRef, useState } from 'react'
import type { Extensions } from '@tiptap/core'
import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import UniqueID from '@tiptap/extension-unique-id'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type { WriterDocument, WriterJsonDocument } from '@shared/types/writer'
import { useNotification } from '@renderer/composables/useNotification'
import { useWriterSessionStore } from '@renderer/stores/writer'
import { WriterAutosaveController } from './writerAutosave'
import styles from './WriterEditor.module.css'

export interface WriterSnapshot {
  title: string
  content: WriterJsonDocument
}

export interface WriterEditorProps {
  document: WriterDocument
  onAutosaveControllerChange: (controller: WriterAutosaveController<WriterSnapshot> | null) => void
}

const AUTOSAVE_DELAY_MS = 600

function createBaseWriterExtensions(): Extensions {
  return [
    StarterKit.configure({ link: false, underline: false }),
    Underline,
    Highlight,
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: '开始写作…' }),
    CharacterCount,
    UniqueID.configure({ types: ['paragraph', 'heading'] })
  ]
}

function getSaveStatusLabel(
  status: ReturnType<typeof useWriterSessionStore.getState>['saveStatus']
) {
  if (status === 'dirty') return '等待保存'
  if (status === 'saving') return '正在保存'
  if (status === 'saved') return '已保存'
  if (status === 'error') return '保存失败'
  if (status === 'conflict') return '保存冲突'
  return ''
}

/** 写作正文由 Tiptap EditorState 持有，Zustand 只记录保存会话摘要。 */
export default function WriterEditor({ document, onAutosaveControllerChange }: WriterEditorProps) {
  const notify = useNotification()
  const saveStatus = useWriterSessionStore((state) => state.saveStatus)
  const [title, setTitle] = useState(document.title)
  const titleRef = useRef(document.title)
  const revisionRef = useRef(document.revision)

  const autosaveController = useMemo(
    () =>
      new WriterAutosaveController<WriterSnapshot>({
        delayMs: AUTOSAVE_DELAY_MS,
        save: async (snapshot) => {
          const sessionStore = useWriterSessionStore.getState()
          if (
            sessionStore.currentDocumentId === document.id &&
            sessionStore.saveStatus === 'conflict'
          ) {
            return { success: false, code: 'revision_conflict' }
          }

          if (sessionStore.currentDocumentId === document.id) sessionStore.markSaving()

          try {
            const result = await window.api.writer.save({
              documentId: document.id,
              expectedRevision: revisionRef.current,
              title: snapshot.title,
              content: snapshot.content
            })

            if (result.success && result.data) {
              revisionRef.current = result.data.revision
              if (useWriterSessionStore.getState().currentDocumentId === document.id) {
                useWriterSessionStore.getState().applySaveResult(result.data.revision)
              }
              return { success: true }
            }

            if (result.code === 'revision_conflict') {
              if (useWriterSessionStore.getState().currentDocumentId === document.id) {
                useWriterSessionStore.getState().handleRevisionConflict()
              }
              notify.warning(
                '文档保存冲突',
                '当前正文已保留在编辑器中，请重新加载文档后再继续编辑。'
              )
              return { success: false, code: result.code }
            }

            const error = result.error || '保存失败'
            if (useWriterSessionStore.getState().currentDocumentId === document.id) {
              useWriterSessionStore.getState().handleSaveFailure(error)
            }
            notify.error('文档保存失败', error)
            return { success: false, code: result.code }
          } catch (error) {
            const message = error instanceof Error ? error.message : '保存失败'
            if (useWriterSessionStore.getState().currentDocumentId === document.id) {
              useWriterSessionStore.getState().handleSaveFailure(message)
            }
            notify.error('文档保存失败', message)
            return { success: false }
          }
        }
      }),
    [document.id, notify]
  )

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: createBaseWriterExtensions(),
      content: document.content,
      editorProps: {
        attributes: {
          class: styles.prose,
          'aria-label': '文档正文'
        }
      },
      onUpdate: ({ editor: currentEditor }) => {
        useWriterSessionStore.getState().markDirty()
        autosaveController.schedule({
          title: titleRef.current,
          content: currentEditor.getJSON() as WriterJsonDocument
        })
      }
    },
    [autosaveController, document.id]
  )

  useEffect(() => {
    useWriterSessionStore.getState().openDocument(document.id, document.revision, document.title)
    onAutosaveControllerChange(autosaveController)

    const flush = (): void => {
      void autosaveController.flush()
    }
    window.addEventListener('blur', flush)
    window.addEventListener('beforeunload', flush)

    return () => {
      window.removeEventListener('blur', flush)
      window.removeEventListener('beforeunload', flush)
      onAutosaveControllerChange(null)
      void autosaveController.dispose()
      if (useWriterSessionStore.getState().currentDocumentId === document.id) {
        useWriterSessionStore.getState().closeDocument()
      }
    }
  }, [
    autosaveController,
    document.id,
    document.revision,
    document.title,
    onAutosaveControllerChange
  ])

  const handleTitleChange = (nextTitle: string): void => {
    setTitle(nextTitle)
    titleRef.current = nextTitle
    useWriterSessionStore.getState().markDirty(nextTitle)
    autosaveController.schedule({
      title: nextTitle,
      content: (editor?.getJSON() as WriterJsonDocument | undefined) ?? document.content
    })
  }

  return (
    <div className={styles.editorSurface}>
      <div className={styles.content}>
        <div className={styles.titleRow}>
          <input
            className={styles.titleInput}
            aria-label="文档标题"
            maxLength={200}
            placeholder="无标题文档"
            value={title}
            onChange={(event) => handleTitleChange(event.target.value)}
          />
          <span className={styles.saveStatus} role="status">
            {getSaveStatusLabel(saveStatus)}
          </span>
        </div>
        <EditorContent editor={editor} className={styles.editorContent} />
      </div>
    </div>
  )
}
