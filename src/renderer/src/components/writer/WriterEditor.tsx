import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import type { WriterDocument, WriterJsonDocument } from '@shared/types/writer'
import { useNotification } from '@renderer/composables/useNotification'
import {
  useWriterLibraryStore,
  useWriterSessionStore,
  useWriterSuggestionStore
} from '@renderer/stores/writer'
import { createWriterExtensions } from './extensions/createWriterExtensions'
import {
  isWriterImageFile,
  queueWriterImageImport,
  runWriterDocumentCloseGc
} from './extensions/writerImage'
import { convertAllPendingWriterMarkdownBlocks } from './extensions/writerMarkdownRules'
import WriterTableControls from './nodes/WriterTableControls'
import { deriveWriterOutline } from './outline/writerOutline'
import {
  registerWriterEditor,
  validateProposalAgainstState
} from './suggestions/writerSuggestionCore'
import { getWriterSuggestionPendingLabel } from './suggestions/writerSuggestionLabels'
import {
  createWriterSuggestionExtension,
  refreshWriterSuggestionDecorations
} from './suggestions/writerSuggestionPlugin'
import WriterBubbleMenu from './toolbar/WriterBubbleMenu'
import type { WriterBubbleAiAction } from './toolbar/writerBubbleAiActions'
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
  isAiSending?: boolean
  onAiAction?: (action: WriterBubbleAiAction) => void
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
export default function WriterEditor({
  document,
  autosaveRegistry,
  isAiSending,
  onAiAction
}: WriterEditorProps) {
  const notify = useNotification()
  const saveStatus = useWriterSessionStore((state) => state.saveStatus)
  const suggestionStatus = useWriterSuggestionStore((state) => state.status)
  const pendingAction = useWriterSuggestionStore((state) => state.pendingAction)
  const invalidReason = useWriterSuggestionStore((state) => state.invalidReason)
  const libraryRevision = useWriterLibraryStore(
    (state) => state.documents.find((item) => item.id === document.id)?.revision
  )
  const [title, setTitle] = useState(document.title)
  const titleRef = useRef(document.title)
  const editorRef = useRef<Editor | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const lastInvalidToastKeyRef = useRef<string | null>(null)

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
              useWriterSuggestionStore.getState().invalidate('session_stale')
              const conflictEditor = editorRef.current
              if (conflictEditor) {
                refreshWriterSuggestionDecorations(
                  (tr) => conflictEditor.view.dispatch(tr),
                  conflictEditor.state
                )
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

  const importImageFile = useCallback(
    (file: File): void => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      void queueWriterImageImport({
        editor: currentEditor,
        documentId: document.id,
        file,
        onError: (message) => notify.error('图片导入失败', message)
      })
    },
    [document.id, notify]
  )

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [...createWriterExtensions(document.id), createWriterSuggestionExtension()],
      enableInputRules: ['writerMarkdownRules'],
      content: document.content,
      editorProps: {
        attributes: {
          class: styles.prose,
          'aria-label': '文档正文'
        },
        handlePaste: (_view, event) => {
          const file = Array.from(event.clipboardData?.files ?? []).find(isWriterImageFile)
          if (!file) return false
          event.preventDefault()
          importImageFile(file)
          return true
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false
          const file = Array.from(event.dataTransfer?.files ?? []).find(isWriterImageFile)
          if (!file) return false
          event.preventDefault()
          const dropPosition = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (dropPosition) {
            editorRef.current?.commands.setTextSelection(dropPosition.pos)
          }
          importImageFile(file)
          return true
        }
      },
      onCreate: ({ editor: currentEditor }) => {
        registerWriterEditor(currentEditor)
        useWriterSessionStore
          .getState()
          .setOutline(deriveWriterOutline(currentEditor.getJSON() as WriterJsonDocument))
      },
      onUpdate: ({ editor: currentEditor, transaction }) => {
        const editVersion = useWriterSessionStore.getState().markDirty()
        const content = currentEditor.getJSON() as WriterJsonDocument
        useWriterSessionStore.getState().setOutline(deriveWriterOutline(content))
        autosaveController.schedule({
          title: titleRef.current,
          content,
          editVersion
        })

        // 建议落盘事务不失效（全部接受 / 单条接受）；仅用户改动目标文本时标记失效
        if (
          transaction.docChanged &&
          !transaction.getMeta('writerSuggestionAccept') &&
          !transaction.getMeta('writerSuggestionApply')
        ) {
          const suggestion = useWriterSuggestionStore.getState()
          if (suggestion.activeProposal) {
            const validation = validateProposalAgainstState(
              suggestion.activeProposal,
              currentEditor.state
            )
            if (!validation.valid) {
              suggestion.invalidate(validation.reason)
              refreshWriterSuggestionDecorations(
                (tr) => currentEditor.view.dispatch(tr),
                currentEditor.state
              )
            }
          }
        }
      },
      onDestroy: () => {
        registerWriterEditor(null)
      }
    },
    [autosaveController, document.id]
  )

  useEffect(() => {
    editorRef.current = editor
    return () => {
      if (editorRef.current === editor) editorRef.current = null
    }
  }, [editor])

  // 建议失效时用 toast 提示，不再渲染标题下大卡片
  useEffect(() => {
    if (suggestionStatus !== 'invalid' || !invalidReason) {
      if (suggestionStatus !== 'invalid') {
        lastInvalidToastKeyRef.current = null
      }
      return
    }
    const key = invalidReason
    if (lastInvalidToastKeyRef.current === key) return
    lastInvalidToastKeyRef.current = key
    const message =
      invalidReason === 'target_changed' ? '目标内容已变化，建议已失效' : '建议无效，请重新生成'
    notify.warning('建议已失效', message)
  }, [invalidReason, notify, suggestionStatus])

  const pendingScrollNodeId = useWriterSessionStore((state) => state.pendingScrollNodeId)

  useEffect(() => {
    if (!pendingScrollNodeId) return
    if (useWriterSessionStore.getState().currentDocumentId !== document.id) return
    const currentEditor = editorRef.current
    if (!currentEditor) return
    // UniqueID 扩展通过 setAttribute 写入属性，HTML 文档会将属性名归一为小写，
    // 因此实际渲染出的 DOM 属性是 data-nodeid 而非驼峰形式。
    const target = currentEditor.view.dom.querySelector(`[data-nodeid="${pendingScrollNodeId}"]`)
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'center'
    })
    useWriterSessionStore.getState().clearPendingScroll()
  }, [document.id, pendingScrollNodeId])

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
    useWriterSuggestionStore.getState().cancelForDocumentSwitch()
    const switchEditor = editorRef.current
    if (switchEditor) {
      refreshWriterSuggestionDecorations((tr) => switchEditor.view.dispatch(tr), switchEditor.state)
    }

    const flush = (): void => {
      const currentEditor = editorRef.current
      if (currentEditor) {
        // 失焦保存前兜底转换 pending 的块级 Markdown 源码行（跳过光标块），
        // 转换触发 onUpdate 生成新快照，随后的 flush 落盘即为转换后内容
        convertAllPendingWriterMarkdownBlocks(currentEditor, (tr) =>
          currentEditor.view.dispatch(tr)
        )
      }
      void autosaveController.flush()
    }
    window.addEventListener('blur', flush)
    window.addEventListener('beforeunload', flush)

    return () => {
      window.removeEventListener('blur', flush)
      window.removeEventListener('beforeunload', flush)
      // 文档关闭时触发该文档的图片资源 GC；必须先等待最后一次自动保存落盘，
      // 否则正在写入的资源可能被 GC 误回收后又被保存写回磁盘。GC 失败保持静默，
      // 与退出路径一致——下次启动时的全量 GC 会兜底。整个清理不阻塞卸载。
      const documentIdForGc = document.id
      void runWriterDocumentCloseGc(documentIdForGc, {
        flush: () => autosaveRegistry.dispose(autosaveController),
        collectGarbage: (id) => window.api.writer.collectGarbage(id)
      })
      useWriterSuggestionStore.getState().cancelForDocumentSwitch()
      const closingEditor = editorRef.current
      if (closingEditor) {
        refreshWriterSuggestionDecorations(
          (tr) => closingEditor.view.dispatch(tr),
          closingEditor.state
        )
      }
      registerWriterEditor(null)
      if (useWriterSessionStore.getState().currentDocumentId === document.id) {
        useWriterSessionStore.getState().closeDocument()
      }
    }
  }, [autosaveController, autosaveRegistry, document.id, document.title, revisionCoordinator])

  const handleTitleChange = (nextTitle: string): void => {
    setTitle(nextTitle)
    titleRef.current = nextTitle
    useWriterLibraryStore.getState().setDocumentTitle(document.id, nextTitle)
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
          <span className={styles.saveStatus} role="status" aria-live="polite" aria-atomic="true">
            {getSaveStatusLabel(saveStatus)}
          </span>
        </div>
        <span className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
          {suggestionStatus === 'pending' ? getWriterSuggestionPendingLabel(pendingAction) : ''}
        </span>
        <EditorContent editor={editor} className={styles.editorContent} />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          aria-label="选择写作图片"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) importImageFile(file)
          }}
        />
        {editor ? (
          <>
            <WriterBubbleMenu editor={editor} isAiSending={isAiSending} onAiAction={onAiAction} />
            <WriterTableControls editor={editor} />
            <WriterSlashMenu editor={editor} onSelectImage={() => imageInputRef.current?.click()} />
          </>
        ) : null}
      </div>
    </div>
  )
}
