import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperChatStreamStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import { usePaperQuoteContext } from '@renderer/contexts/PaperQuoteContext'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import type { Message } from '@renderer/types'
import type { PaperDocument } from '@shared/types/paper'
import { parseMessageOptions } from '@renderer/utils/optionParser'
import { usePaperChatSessionReact } from './hooks/usePaperChatSessionReact'
import { usePaperChatStreamReact } from './hooks/usePaperChatStreamReact'
import PaperChatInput, { type PaperChatQuickReply } from './PaperChatInput'
import PaperChatMessageList, { type PaperChatMessageListHandle } from './PaperChatMessageList'
import PaperChatPlanDock from './PaperChatPlanDock'
import styles from './PaperChatPanel.module.css'

interface PaperChatPanelProps {
  paper: PaperDocument
}

/** 从消息列表中获取最后一条有实际内容的 assistant 消息（跳过流式未完成的） */
function getLatestAssistantMessage(messages: Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && !message.isStreaming && message.content.trim()) {
      return message
    }
  }
  return null
}

/** 论文对话主面板组件，管理会话生命周期、消息流式传输和快速回复 */
export default function PaperChatPanel({ paper }: PaperChatPanelProps) {
  const notify = useNotification()
  const { scrollToQuote } = usePaperQuoteContext()
  const [dismissedQuickReplyIds, setDismissedQuickReplyIds] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const composerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const messageListRef = useRef<PaperChatMessageListHandle>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)

  const setPaperChatPanelOpen = useUIStateStore((s) => s.setPaperChatPanelOpen)
  const showUserInteraction = usePaperChatStreamStore((s) => s.showUserInteraction)
  const userInteractionInfo = usePaperChatStreamStore((s) => s.userInteractionInfo)
  const hideUserInteraction = usePaperChatStreamStore((s) => s.hideUserInteraction)
  const showCapabilitySuggestion = usePaperChatStreamStore((s) => s.showCapabilitySuggestion)
  const capabilitySuggestion = usePaperChatStreamStore((s) => s.capabilitySuggestion)
  const hideCapabilitySuggestion = usePaperChatStreamStore((s) => s.hideCapabilitySuggestion)

  const sessionState = usePaperChatSessionReact(paper)
  const streamState = usePaperChatStreamReact({
    session: sessionState.session,
    paperId: paper.id,
    messagesRef: sessionState.messagesRef,
    setMessages: sessionState.setMessages,
    selectedModel: sessionState.selectedModel,
    selectedMCPTools: sessionState.selectedMCPTools,
    selectedKnowledgeBases: sessionState.selectedKnowledgeBases,
    enableLabTools: sessionState.enableLabTools,
    enablePaperWebSearch: sessionState.enablePaperWebSearch,
    saveCurrentSession: sessionState.saveCurrentSession,
    setError: sessionState.setError,
    onRequestError: () => {
      notify.error('论文对话请求失败', '模型请求失败，请稍后重试或换一个模型。', {
        source: 'chat'
      })
    }
  })

  const currentPlanState = sessionState.sessionId
    ? usePaperChatStreamStore.getState().getSessionPlanState(sessionState.sessionId)
    : null

  const quickReply = useMemo<PaperChatQuickReply | null>(() => {
    const latestMessage = getLatestAssistantMessage(sessionState.messages)
    if (!latestMessage || dismissedQuickReplyIds.has(latestMessage.id)) {
      return null
    }

    // 如果最新消息之前有工具调用（搜索、ReAct 等），跳过 option 解析，直接展示工具结果
    const messages = sessionState.messages
    const latestIndex = messages.findIndex((m) => m.id === latestMessage.id)
    if (latestIndex > 0) {
      const prevMessage = messages[latestIndex - 1]
      if (prevMessage && prevMessage.role === 'tool') {
        return null
      }
    }

    const parsed = parseMessageOptions(latestMessage.content)
    if (!parsed.hasOptions) {
      return null
    }

    return {
      messageId: latestMessage.id,
      question: parsed.question,
      options: parsed.options,
      suffix: parsed.suffix
    }
  }, [dismissedQuickReplyIds, sessionState.messages])

  useEffect(() => {
    setDismissedQuickReplyIds(new Set())
    void sessionState.loadSessionWithContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id])

  useEffect(() => {
    setDismissedQuickReplyIds((current) => {
      if (current.size === 0) return current
      const messageIds = new Set(sessionState.messages.map((message) => message.id))
      const next = new Set([...current].filter((id) => messageIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [sessionState.messages])

  // 监听输入区域高度变化，通过 CSS 变量动态补偿消息列表底部内边距，防止内容被输入区遮挡
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
      notify.warning('论文对话', '请先停止当前回复，再清空上下文。', { source: 'chat' })
      return
    }

    const confirmed = await notify.confirm('聊天记录会被清空。', {
      title: '清空当前论文聊天上下文？',
      danger: true
    })
    if (!confirmed) return

    const success = await sessionState.clearContext()
    if (success && sessionState.sessionId) {
      usePaperChatStreamStore.getState().resetPlanState(sessionState.sessionId)
      setDismissedQuickReplyIds(new Set())
      notify.success('论文对话', '上下文已清空', { source: 'chat' })
    }
  }

  const handleEnablePaperWebSearch = useCallback(async (): Promise<boolean> => {
    try {
      const envInfo = await window.api.paperWebSearch.checkEnvironment()
      if (!envInfo.available) {
        notify.warning(
          '联网搜索不可用',
          envInfo.error || 'Electron 搜索运行时不可用，请重启应用后重试。',
          { source: 'chat' }
        )
        return false
      }
      return true
    } catch {
      notify.warning('联网搜索不可用', '环境检查失败，请稍后重试。', { source: 'chat' })
      return false
    }
  }, [notify])

  return (
    <section ref={panelRef} className={styles['paper-chat-panel']}>
      <header className={styles['paper-chat-panel__header']}>
        <div className={styles['paper-chat-panel__title-group']}>
          <h2>论文对话</h2>
          <span title={paper.fileName}>{paper.fileName}</span>
        </div>

        <div className={styles['paper-chat-panel__actions']}>
          <button
            className={styles['paper-chat-panel__icon-button']}
            type="button"
            title="清空上下文"
            aria-label="清空上下文"
            disabled={sessionState.loading}
            onClick={() => void handleClearContext()}
          >
            <SvgIcon name="trash" size={15} />
          </button>
          <button
            className={styles['paper-chat-panel__icon-button']}
            type="button"
            title="关闭"
            aria-label="关闭"
            onClick={() => setPaperChatPanelOpen(false)}
          >
            <SvgIcon name="close" size={16} />
          </button>
        </div>
      </header>

      {sessionState.error && (
        <div className={styles['paper-chat-panel__status-bar']} role="status">
          {sessionState.error}
        </div>
      )}

      {sessionState.loading ? (
        <div className={styles['paper-chat-panel__loading-state']}>正在加载论文对话...</div>
      ) : (
        <PaperChatMessageList
          ref={messageListRef}
          messages={sessionState.messages}
          currentChatId={sessionState.sessionId}
          onQuoteClick={scrollToQuote || undefined}
          onScrollButtonChange={setShowScrollButton}
        />
      )}

      <div
        ref={composerRef}
        className={[
          styles['paper-chat-panel__composer'],
          isDragging ? styles['paper-chat-panel__composer--dragging'] : ''
        ]
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
            className={styles['paper-chat-panel__scroll-button']}
            type="button"
            aria-label="滚动到底部"
            onClick={() => messageListRef.current?.scrollToBottom()}
          >
            <SvgIcon name="arrow-down" size={16} />
          </button>
        )}
        <PaperChatPlanDock planState={currentPlanState} />
        <PaperChatInput
          sessionId={sessionState.sessionId || 'temp'}
          inputMessage={sessionState.inputMessage}
          selectedModel={sessionState.selectedModel}
          selectedMCPTools={sessionState.selectedMCPTools}
          selectedKnowledgeBases={sessionState.selectedKnowledgeBases}
          enableLabTools={sessionState.enableLabTools}
          enablePaperWebSearch={sessionState.enablePaperWebSearch}
          isSending={streamState.isSending}
          disabled={sessionState.loading || !sessionState.session}
          isDragging={isDragging}
          quickReply={quickReply}
          userInteraction={userInteractionInfo}
          showUserInteraction={showUserInteraction}
          showCapabilitySuggestion={showCapabilitySuggestion}
          capabilitySuggestion={capabilitySuggestion}
          onUpdateInput={sessionState.updateInputMessage}
          onUpdateSelectedModel={sessionState.updateSelectedModel}
          onUpdateSelectedTools={sessionState.updateSelectedTools}
          onUpdateSelectedKnowledgeBases={sessionState.updateSelectedKnowledgeBases}
          onUpdateEnableLabTools={sessionState.updateEnableLabTools}
          onUpdateEnablePaperWebSearch={sessionState.updateEnablePaperWebSearch}
          onEnablePaperWebSearch={handleEnablePaperWebSearch}
          onDismissQuickReply={(messageId) => {
            if (!messageId) return
            setDismissedQuickReplyIds((current) => new Set(current).add(messageId))
          }}
          onHideUserInteraction={hideUserInteraction}
          onHideCapabilitySuggestion={hideCapabilitySuggestion}
          onSend={streamState.sendMessage}
          onStop={streamState.stopRequest}
        />
      </div>
    </section>
  )
}
