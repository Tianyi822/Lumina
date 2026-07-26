import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { WriterDocument, WriterJsonDocument } from '@shared/types/writer'
import { useNotification } from '@renderer/composables/useNotification'
import { useWriterLibraryStore, useWriterSessionStore } from '@renderer/stores/writer'
import { createWriterExtensions } from './extensions/createWriterExtensions'
import WriterBubbleMenu from './toolbar/WriterBubbleMenu'
import WriterSlashMenu from './toolbar/WriterSlashMenu'
import {
  WriterAutosaveController,
  WriterAutosaveFlushRegistry,
  WriterRevisionCoordinator
} from './writerAutosave'
import styles from './WriterEditor.module.css'

export interface WriterSnapshot {
  title: string
  content: WriterJsonDocument
  editVersion: number
}

export interface WriterEditorProps {
  document: WriterDocument
  autosaveRegistry: WriterAutosaveFlushRegistry<WriterSnapshot>
}

const AUTOSAVE_DELAY_MS = 600

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
export default function WriterEditor({ document, autosaveRegistry }: WriterEditorProps) {
  const notify = useNotification()
  const saveStatus = useWriterSessionStore((state) => state.saveStatus)
  const libraryRevision = useWriterLibraryStore(
    (state) => state.documents.find((item) => item.id === document.id)?.revision
  )
  const [title, setTitle] = useState(document.title)
  const titleRef = useRef(document.title)

  const revisionCoordinator = useMemo(
    () =>
      new WriterRevisionCoordinator<WriterSnapshot>({
        initialRevision: document.revision,
        save: async (snapshot, expectedRevision) => {
          const result = await window.api.writer.save({
            documentId: document.id,
            expectedRevision,
            title: snapshot.title,
            content: snapshot.content
          })
          return {
            success: result.success,
            code: result.code,
            error: result.error,
            revision: result.data?.revision
          }
        }
      }),
    [document.id, document.revision]
  )

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
            const result = await revisionCoordinator.save(snapshot)

            if (result.success && result.revision !== undefined) {
              if (useWriterSessionStore.getState().currentDocumentId === document.id) {
                useWriterSessionStore
                  .getState()
                  .applySaveResult(result.revision, snapshot.editVersion)
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
    [document.id, notify, revisionCoordinator]
  )

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: createWriterExtensions(),
      enableInputRules: ['writerMarkdownRules'],
      content: document.content,
      editorProps: {
        attributes: {
          class: styles.prose,
          'aria-label': '文档正文'
        }
      },
      onUpdate: ({ editor: currentEditor }) => {
        const editVersion = useWriterSessionStore.getState().markDirty()
        autosaveController.schedule({
          title: titleRef.current,
          content: currentEditor.getJSON() as WriterJsonDocument,
          editVersion
        })
      }
    },
    [autosaveController, document.id]
  )

  useEffect(() => {
    if (libraryRevision === undefined) return
    revisionCoordinator.syncExternalRevision(libraryRevision)
    if (useWriterSessionStore.getState().currentDocumentId === document.id) {
      useWriterSessionStore.getState().syncRevision(revisionCoordinator.revision)
    }
  }, [document.id, libraryRevision, revisionCoordinator])

  useEffect(() => {
    useWriterSessionStore
      .getState()
      .openDocument(document.id, revisionCoordinator.revision, document.title)
    autosaveRegistry.register(autosaveController)

    const flush = (): void => {
      void autosaveController.flush()
    }
    window.addEventListener('blur', flush)
    window.addEventListener('beforeunload', flush)

    return () => {
      window.removeEventListener('blur', flush)
      window.removeEventListener('beforeunload', flush)
      void autosaveRegistry.dispose(autosaveController)
      if (useWriterSessionStore.getState().currentDocumentId === document.id) {
        useWriterSessionStore.getState().closeDocument()
      }
    }
  }, [autosaveController, autosaveRegistry, document.id, document.title, revisionCoordinator])

  const handleTitleChange = (nextTitle: string): void => {
    setTitle(nextTitle)
    titleRef.current = nextTitle
    const editVersion = useWriterSessionStore.getState().markDirty(nextTitle)
    autosaveController.schedule({
      title: nextTitle,
      content: (editor?.getJSON() as WriterJsonDocument | undefined) ?? document.content,
      editVersion
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
        {editor ? (
          <>
            <WriterBubbleMenu editor={editor} />
            <WriterSlashMenu editor={editor} />
          </>
        ) : null}
      </div>
    </div>
  )
}
