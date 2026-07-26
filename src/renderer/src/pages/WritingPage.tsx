import { useCallback, useEffect, useRef, useState } from 'react'
import type { WriterDocument } from '@shared/types/writer'
import WriterEditor from '@renderer/components/writer/WriterEditor'
import type { WriterSnapshot } from '@renderer/components/writer/WriterEditor'
import WriterChatPanel from '@renderer/components/writer/chat/WriterChatPanel'
import {
  WriterAutosaveFlushRegistry,
  flushWriterAutosaveAndAcknowledge
} from '@renderer/components/writer/writerAutosave'
import { useWriterLibraryStore } from '@renderer/stores/writer'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './WritingPage.module.css'

/** 写作工作区负责文档加载、AI 面板布局和主进程退出握手。 */
export default function WritingPage() {
  const currentDocumentId = useWriterLibraryStore((state) => state.currentDocumentId)
  const createAndOpen = useWriterLibraryStore((state) => state.createAndOpen)
  const writerChatPanelOpen = useUIStateStore((s) => s.writerChatPanelOpen)
  const setWriterChatPanelOpen = useUIStateStore((s) => s.setWriterChatPanelOpen)
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
          setError(result.error || '加载文档失败')
          return
        }
        setWriterDocument(result.data)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setWriterDocument(null)
        setError(loadError instanceof Error ? loadError.message : '加载文档失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [currentDocumentId])

  useEffect(
    () =>
      window.api.writer.onFlushRequested(async () => {
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
          />
        ) : (
          <div className={styles.state}>
            {loading ? <span>正在加载文档…</span> : null}
            {!loading && error ? (
              <span className={styles.error} role="alert">
                {error}
              </span>
            ) : null}
            {!loading && !error && !currentDocumentId ? (
              <>
                <span>选择一个文档，或开始新的写作</span>
                <button
                  type="button"
                  className="sm-button sm-button--secondary"
                  onClick={() => void createAndOpen()}
                >
                  新建文档
                </button>
              </>
            ) : null}
          </div>
        )}

        {showDocument && writerDocument && !writerChatPanelOpen ? (
          <button
            type="button"
            className={styles.aiToggle}
            aria-label="打开写作对话"
            title="打开写作对话"
            onClick={() => setWriterChatPanelOpen(true)}
          >
            <SvgIcon name="chat" size={16} />
          </button>
        ) : null}
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
              title="拖拽调整聊天窗口宽度"
              onPointerDown={startChatResize}
            />
            <WriterChatPanel
              documentId={writerDocument.id}
              documentTitle={writerDocument.title}
            />
          </aside>
        ) : null}
      </div>
    </main>
  )
}
