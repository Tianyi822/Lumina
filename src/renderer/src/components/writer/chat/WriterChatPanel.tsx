import { useEffect, useRef, useState } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useNotification } from '@renderer/composables/useNotification'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import AssistantPanelShell from '@renderer/components/assistant/AssistantPanelShell'
import PaperChatInput from '@renderer/components/paper/chat/PaperChatInput'
import PaperChatMessageList, {
  type PaperChatMessageListHandle
} from '@renderer/components/paper/chat/PaperChatMessageList'
import type { useWriterChatSession } from './useWriterChatSession'
import type { useWriterChatStream } from './useWriterChatStream'
import styles from './WriterChatPanel.module.css'

interface WriterChatPanelProps {
  documentId: string
  documentTitle?: string
  sessionState: ReturnType<typeof useWriterChatSession>
  streamState: ReturnType<typeof useWriterChatStream>
}

/** 写作 AI 面板：受控展示层，会话/流式状态由 WritingPage 持有（侧栏关闭仍可发送） */
export default function WriterChatPanel({
  documentId: _documentId,
  documentTitle,
  sessionState,
  streamState
}: WriterChatPanelProps) {
  const notify = useNotification()
  const setWriterChatPanelOpen = useUIStateStore((s) => s.setWriterChatPanelOpen)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const composerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<PaperChatMessageListHandle>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  useEffect(() => {
    const composer = composerRef.current
    const panel = panelRef.current
    if (!composer || !panel) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
      panel.style.setProperty('--composer-height', `${Math.round(height)}px`)
    })

    observer.observe(composer)
    return () => observer.disconnect()
  }, [])

  async function handleClearContext(): Promise<void> {
    if (streamState.isSending) {
      notify.warning('写作对话', '请先停止当前回复，再清空上下文。', { source: 'chat' })
      return
    }

    const confirmed = await notify.confirm('聊天记录会被清空。', {
      title: '清空当前写作聊天上下文？',
      danger: true
    })
    if (!confirmed) return

    const success = await sessionState.clearContext()
    if (success) {
      notify.success('写作对话', '上下文已清空', { source: 'chat' })
    }
  }

  return (
    <div ref={panelRef} className={styles.panel}>
      <AssistantPanelShell
        title="写作对话"
        subtitle={documentTitle}
        status={sessionState.error || undefined}
        loading={sessionState.loading}
        onClear={() => void handleClearContext()}
        onClose={() => setWriterChatPanelOpen(false)}
        messages={
          <PaperChatMessageList
            ref={messageListRef}
            messages={sessionState.messages}
            currentChatId={sessionState.sessionId}
            onScrollButtonChange={setShowScrollButton}
          />
        }
        composer={
          <div
            ref={composerRef}
            className={[styles.composer, isDragging ? styles.composerDragging : '']
              .filter(Boolean)
              .join(' ')}
            onDragEnter={(event) => {
              event.preventDefault()
              dragCounterRef.current += 1
              setIsDragging(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              dragCounterRef.current -= 1
              if (dragCounterRef.current <= 0) {
                dragCounterRef.current = 0
                setIsDragging(false)
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              dragCounterRef.current = 0
              setIsDragging(false)
            }}
          >
            {showScrollButton && (
              <button
                className={styles.scrollButton}
                type="button"
                aria-label="滚动到底部"
                onClick={() => messageListRef.current?.scrollToBottom()}
              >
                <SvgIcon name="arrow-down" size={16} />
              </button>
            )}
            <PaperChatInput
              sessionId={sessionState.sessionId || 'temp'}
              inputMessage={sessionState.inputMessage}
              selectedModel={sessionState.selectedModel}
              selectedMCPTools={sessionState.selectedMCPTools}
              selectedKnowledgeBases={sessionState.selectedKnowledgeBases}
              enablePaperWebSearch={false}
              allowPaperQuotes={false}
              allowPaperWebSearch={false}
              isSending={streamState.isSending}
              disabled={sessionState.loading || !sessionState.session}
              isDragging={isDragging}
              onUpdateInput={sessionState.updateInputMessage}
              onUpdateSelectedModel={sessionState.updateSelectedModel}
              onUpdateSelectedTools={sessionState.updateSelectedTools}
              onUpdateSelectedKnowledgeBases={sessionState.updateSelectedKnowledgeBases}
              onUpdateEnablePaperWebSearch={() => undefined}
              onSend={(content, docs, images) => streamState.sendMessage(content, docs, images)}
              onStop={streamState.stopRequest}
            />
          </div>
        }
      />
    </div>
  )
}
