import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WriterDocument } from '@shared/types/writer'
import WriterEditor from '@renderer/components/writer/WriterEditor'
import type { WriterSnapshot } from '@renderer/components/writer/WriterEditor'
import WriterChatPanel from '@renderer/components/writer/chat/WriterChatPanel'
import { useWriterChatSession } from '@renderer/components/writer/chat/useWriterChatSession'
import { useWriterChatStream } from '@renderer/components/writer/chat/useWriterChatStream'
import {
  buildWriterBubbleSendOptions,
  canStartWriterBubbleAiAction,
  getWriterBubbleAiPrompt,
  type WriterBubbleAiAction
} from '@renderer/components/writer/toolbar/writerBubbleAiActions'
import { formatWriterChatError } from '@renderer/components/writer/chat/formatWriterChatError'
import {
  createWriterAiRequestContext,
  getRegisteredWriterEditor
} from '@renderer/components/writer/suggestions/writerSuggestionCore'
import { convertAllPendingWriterMarkdownBlocks } from '@renderer/components/writer/extensions/writerMarkdownRules'
import {
  WriterAutosaveFlushRegistry,
  flushWriterAutosaveAndAcknowledge
} from '@renderer/components/writer/writerAutosave'
import { useNotification } from '@renderer/composables/useNotification'
import { useWriterLibraryStore, useWriterSessionStore } from '@renderer/stores/writer'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import styles from './WritingPage.module.css'

/** 写作工作区负责文档加载、AI 面板布局和主进程退出握手。 */
export default function WritingPage() {
  const notify = useNotification()
  const { t } = useTranslation()
  const currentDocumentId = useWriterLibraryStore((state) => state.currentDocumentId)
  const createAndOpen = useWriterLibraryStore((state) => state.createAndOpen)
  const currentDocumentTitle = useWriterLibraryStore((state) => {
    if (!state.currentDocumentId) return null
    return (
      state.documents.find((document) => document.id === state.currentDocumentId)?.title ?? null
    )
  })
  const writerChatPanelOpen = useUIStateStore((s) => s.writerChatPanelOpen)
  const writerChatPanelWidth = useUIStateStore((s) => s.writerChatPanelWidth)
  const setWriterChatPanelWidth = useUIStateStore((s) => s.setWriterChatPanelWidth)

  const [writerDocument, setWriterDocument] = useState<WriterDocument | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isResizingChat, setIsResizingChat] = useState(false)
  const autosaveRegistryRef = useRef<WriterAutosaveFlushRegistry<WriterSnapshot> | null>(null)
  if (!autosaveRegistryRef.current) {
    autosaveRegistryRef.current = new WriterAutosaveFlushRegistry<WriterSnapshot>()
  }

  // 会话/流式 hook 挂在页面层：侧栏关闭时仍存活，供气泡发送使用
  const sessionState = useWriterChatSession(writerDocument?.id)
  const streamState = useWriterChatStream({
    session: sessionState.session,
    messagesRef: sessionState.messagesRef,
    setMessages: sessionState.setMessages,
    selectedModel: sessionState.selectedModel,
    selectedMCPTools: sessionState.selectedMCPTools,
    selectedKnowledgeBases: sessionState.selectedKnowledgeBases,
    saveCurrentSession: sessionState.saveCurrentSession,
    setError: sessionState.setError,
    onRequestError: (message) => {
      notify.error(t('notifications.writer.chatRequestFailed'), formatWriterChatError(message), {
        source: 'chat'
      })
    }
  })

  useEffect(() => {
    if (!writerDocument?.id) return
    void sessionState.loadSessionWithContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随文档切换加载
  }, [writerDocument?.id])

  const handleBubbleAiAction = useCallback(
    async (action: WriterBubbleAiAction): Promise<void> => {
      const gate = canStartWriterBubbleAiAction({
        isSending: streamState.isSending,
        selectedModel: sessionState.selectedModel
      })
      if (!gate.ok) {
        if (gate.reason === 'busy') {
          notify.warning(
            t('notifications.writer.chatTitle'),
            t('notifications.writer.stopReplyFirst'),
            { source: 'chat' }
          )
        } else {
          notify.warning(
            t('notifications.writer.chatTitle'),
            t('notifications.writer.openPanelFirst'),
            { source: 'chat' }
          )
        }
        return
      }

      // 返回 SessionData 并传入 send，避免 ensure 后同 tick latestRef 仍为 null
      const session = await sessionState.ensureSession()
      if (!session) {
        notify.error(
          t('notifications.writer.chatTitle'),
          t('notifications.writer.loadSessionFailed'),
          { source: 'chat' }
        )
        return
      }

      // 气泡选区：无可编辑文本块时中止，避免无 writerContext 空发
      const editor = getRegisteredWriterEditor()
      if (editor) {
        const revision = useWriterSessionStore.getState().revision
        const context = createWriterAiRequestContext(editor, 'selection', revision)
        if (!context) {
          notify.warning(
            t('notifications.writer.chatTitle'),
            t('notifications.writer.selectionNotEditable'),
            { source: 'chat' }
          )
          return
        }
      }

      await streamState.sendMessage(getWriterBubbleAiPrompt(action), [], [], {
        ...buildWriterBubbleSendOptions(),
        session,
        pendingAction: action
      })
    },
    [notify, sessionState, streamState, t]
  )

  const chatSlotRef = useRef<HTMLDivElement>(null)
  const isResizingChatRef = useRef(false)
  const writerChatPanelWidthRef = useRef(writerChatPanelWidth)
  const pendingWidthRef = useRef<number | null>(null)
  const resizeRafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isResizingChatRef.current) {
      writerChatPanelWidthRef.current = writerChatPanelWidth
    }
  }, [writerChatPanelWidth])

  useEffect(() => {
    let active = true
    if (!currentDocumentId) {
      setWriterDocument(null)
      setLoading(false)
      setError(null)
      return () => {
        active = false
      }
    }

    setLoading(true)
    setError(null)
    void window.api.writer
      .get(currentDocumentId)
      .then((result) => {
        if (!active) return
        if (!result.success || !result.data) {
          setWriterDocument(null)
          setError(result.error || t('chrome.pages.loadDocumentFailed'))
          return
        }
        setWriterDocument(result.data)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setWriterDocument(null)
        setError(
          loadError instanceof Error ? loadError.message : t('chrome.pages.loadDocumentFailed')
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [currentDocumentId, t])

  useEffect(
    () =>
      window.api.writer.onFlushRequested(async () => {
        // 退出握手前先兜底转换 pending 的块级 Markdown 源码行，再统一刷盘
        const editor = getRegisteredWriterEditor()
        if (editor) {
          convertAllPendingWriterMarkdownBlocks(editor, (tr) => editor.view.dispatch(tr))
        }
        await flushWriterAutosaveAndAcknowledge(autosaveRegistryRef.current!, () =>
          window.api.writer.acknowledgeFlush()
        )
      }),
    []
  )

  const applyChatPanelWidth = useCallback((nextWidth: number) => {
    const width = Math.min(680, Math.max(340, Math.round(nextWidth)))
    writerChatPanelWidthRef.current = width
    pendingWidthRef.current = width

    if (resizeRafRef.current !== null) {
      return
    }

    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null
      const pendingWidth = pendingWidthRef.current
      pendingWidthRef.current = null
      if (pendingWidth === null) {
        return
      }
      chatSlotRef.current?.style.setProperty('--writer-chat-panel-width', `${pendingWidth}px`)
    })
  }, [])

  const handleChatResizeMove = useCallback(
    (event: PointerEvent) => {
      if (!isResizingChatRef.current) {
        return
      }
      applyChatPanelWidth(window.innerWidth - event.clientX)
    },
    [applyChatPanelWidth]
  )

  const stopChatResize = useCallback(() => {
    if (!isResizingChatRef.current) {
      return
    }

    isResizingChatRef.current = false
    setIsResizingChat(false)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('pointermove', handleChatResizeMove)
    window.removeEventListener('pointerup', stopChatResize)

    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current)
      resizeRafRef.current = null
    }
    pendingWidthRef.current = null
    setWriterChatPanelWidth(writerChatPanelWidthRef.current)
  }, [handleChatResizeMove, setWriterChatPanelWidth])

  const startChatResize = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault()
      isResizingChatRef.current = true
      setIsResizingChat(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', handleChatResizeMove)
      window.addEventListener('pointerup', stopChatResize)
      handleChatResizeMove(event.nativeEvent)
    },
    [handleChatResizeMove, stopChatResize]
  )

  useEffect(() => {
    return () => {
      stopChatResize()
    }
  }, [stopChatResize])

  const showDocument = writerDocument?.id === currentDocumentId
  const isChatVisible = writerChatPanelOpen && showDocument && Boolean(writerDocument)

  return (
    <main className={styles.page}>
      <div className={styles.editorPane}>
        {showDocument && writerDocument ? (
          <WriterEditor
            key={writerDocument.id}
            document={writerDocument}
            autosaveRegistry={autosaveRegistryRef.current}
            isAiSending={streamState.isSending}
            onAiAction={(a) => void handleBubbleAiAction(a)}
          />
        ) : (
          <div className={styles.state}>
            {loading ? <span>{t('chrome.pages.loadingDocument')}</span> : null}
            {!loading && error ? (
              <span className={styles.error} role="alert">
                {error}
              </span>
            ) : null}
            {!loading && !error && !currentDocumentId ? (
              <>
                <span>{t('chrome.pages.selectDocumentTitle')}</span>
                <button
                  type="button"
                  className="sm-button sm-button--secondary"
                  onClick={() => void createAndOpen()}
                >
                  {t('chrome.pages.newDocument')}
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>

      <div
        ref={chatSlotRef}
        className={[
          styles.chatSlot,
          isChatVisible ? styles.chatSlotOpen : '',
          isResizingChat ? styles.chatSlotResizing : ''
        ]
          .filter(Boolean)
          .join(' ')}
        style={
          {
            '--writer-chat-panel-width': `${writerChatPanelWidth}px`
          } as React.CSSProperties
        }
      >
        {isChatVisible && writerDocument ? (
          <aside className={styles.chat}>
            <div
              className={styles.chatResize}
              role="separator"
              aria-orientation="vertical"
              title={t('common.resizeChat')}
              onPointerDown={startChatResize}
            />
            <WriterChatPanel
              documentId={writerDocument.id}
              documentTitle={currentDocumentTitle ?? writerDocument.title}
              sessionState={sessionState}
              streamState={streamState}
            />
          </aside>
        ) : null}
      </div>
    </main>
  )
}
