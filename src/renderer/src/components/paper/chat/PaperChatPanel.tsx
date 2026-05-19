import { useCallback, useEffect, useMemo, useState } from 'react'
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
import PaperChatMessageList from './PaperChatMessageList'
import PaperChatPlanDock from './PaperChatPlanDock'
import styles from './PaperChatPanel.module.css'

interface PaperChatPanelProps {
  paper: PaperDocument
}

function getLatestAssistantMessage(messages: Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && !message.isStreaming && message.content.trim()) {
      return message
    }
  }
  return null
}

export default function PaperChatPanel({ paper }: PaperChatPanelProps) {
  const notify = useNotification()
  const { scrollToQuote } = usePaperQuoteContext()
  const [dismissedQuickReplyIds, setDismissedQuickReplyIds] = useState<Set<string>>(new Set())

  const setPaperChatPanelOpen = useUIStateStore((s) => s.setPaperChatPanelOpen)
  const showUserInteraction = usePaperChatStreamStore((s) => s.showUserInteraction)
  const userInteractionInfo = usePaperChatStreamStore((s) => s.userInteractionInfo)
  const hideUserInteraction = usePaperChatStreamStore((s) => s.hideUserInteraction)

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
    setError: sessionState.setError
  })

  const currentPlanState = sessionState.sessionId
    ? usePaperChatStreamStore.getState().getSessionPlanState(sessionState.sessionId)
    : null

  const quickReply = useMemo<PaperChatQuickReply | null>(() => {
    const latestMessage = getLatestAssistantMessage(sessionState.messages)
    if (!latestMessage || dismissedQuickReplyIds.has(latestMessage.id)) {
      return null
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
    <section className={styles['paper-chat-panel']}>
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

      {sessionState.loading ? (
        <div className={styles['paper-chat-panel__loading']}>正在加载论文对话...</div>
      ) : (
        <PaperChatMessageList
          messages={sessionState.messages}
          currentModelName={sessionState.selectedModel}
          currentChatId={sessionState.sessionId}
          onQuoteClick={scrollToQuote || undefined}
        />
      )}

      {sessionState.error && (
        <div className={styles['paper-chat-panel__loading']}>{sessionState.error}</div>
      )}

      <div className={styles['paper-chat-panel__composer']}>
        <PaperChatPlanDock planState={currentPlanState} sending={streamState.isSending} />
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
          compact
          quickReply={quickReply}
          userInteraction={userInteractionInfo}
          showUserInteraction={showUserInteraction}
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
          onSend={streamState.sendMessage}
          onStop={streamState.stopRequest}
        />
      </div>
    </section>
  )
}
