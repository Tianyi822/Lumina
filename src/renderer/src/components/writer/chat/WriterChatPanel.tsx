import { useEffect, useRef, useState } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { useNotification } from '@renderer/composables/useNotification'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import AssistantPanelShell from '@renderer/components/assistant/AssistantPanelShell'
import PaperChatInput from '@renderer/components/paper/chat/PaperChatInput'
import PaperChatMessageList, {
  type PaperChatMessageListHandle
} from '@renderer/components/paper/chat/PaperChatMessageList'
import { useWriterChatSession } from './useWriterChatSession'
import { useWriterChatStream } from './useWriterChatStream'
import WriterSourceSelector from './WriterSourceSelector'
import styles from './WriterChatPanel.module.css'

interface WriterChatPanelProps {
  documentId: string
  documentTitle?: string
}

/** 写作 AI 面板：独立会话与来源选择，复用通用外壳与输入控件 */
export default function WriterChatPanel({ documentId, documentTitle }: WriterChatPanelProps) {
  const notify = useNotification()
  const setWriterChatPanelOpen = useUIStateStore((s) => s.setWriterChatPanelOpen)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const composerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<PaperChatMessageListHandle>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const sessionState = useWriterChatSession(documentId)
  const streamState = useWriterChatStream({
    session: sessionState.session,
    selectedPaperId: sessionState.selectedPaperId,
    messagesRef: sessionState.messagesRef,
    setMessages: sessionState.setMessages,
    selectedModel: sessionState.selectedModel,
    selectedMCPTools: sessionState.selectedMCPTools,
    selectedKnowledgeBases: sessionState.selectedKnowledgeBases,
    saveCurrentSession: sessionState.saveCurrentSession,
    setError: sessionState.setError,
    onRequestError: () => {
      notify.error('写作对话请求失败', '模型请求失败，请稍后重试或换一个模型。', {
        source: 'chat'
      })
    }
  })

  useEffect(() => {
    void sessionState.loadSessionWithContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

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
            <WriterSourceSelector
              selectedPaperId={sessionState.selectedPaperId}
              disabled={sessionState.loading || streamState.isSending}
              onSelectPaperId={sessionState.updateSelectedPaperId}
            />
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
