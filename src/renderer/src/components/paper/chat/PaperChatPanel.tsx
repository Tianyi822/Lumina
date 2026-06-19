import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useUIStateStore } from '@renderer/stores/uiStateStore'
import { usePaperChatStreamStore } from '@renderer/stores'
import { useConfigStore } from '@renderer/stores/configStore'
import { useLabListStore } from '@renderer/stores/lab/labListStore'
import { LAB_DISCIPLINE_PRESETS, isLabDisciplineEnabled } from '@shared/utils/labFeatures'
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
  // 从后向前遍历，找到第一条非流式且有内容的 assistant 消息
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
    activeLabDiscipline: sessionState.activeLabDiscipline,
    activeLabId: sessionState.activeLabId,
    saveCurrentSession: sessionState.saveCurrentSession,
    setError: sessionState.setError,
    onRequestError: () => {
      notify.error('论文对话请求失败', '模型请求失败，请稍后重试或换一个模型。', {
        source: 'chat'
      })
    }
  })

  // 实验室学科与已连接实验室数据源（供 LabSessionPanel）
  const labFeatures = useConfigStore((s) => s.labFeatures)
  const enabledDisciplines = useMemo(
    () =>
      LAB_DISCIPLINE_PRESETS.filter((d) => isLabDisciplineEnabled(labFeatures, d.id)).map(
        (d) => d.id
      ),
    [labFeatures]
  )
  const allLabs = useLabListStore((s) => s.labList)
  const connectedLabs = useMemo(() => allLabs.filter((lab) => lab.status === 'running'), [allLabs])

  // 论文聊天入口可能未经过实验室页面，挂载时确保实验室列表已加载（供 LabSessionPanel）
  useEffect(() => {
    void useLabListStore.getState().loadLabList()
  }, [])

  // 只有存在有效会话时才查询计划状态，否则保持 null
  const currentPlanState = sessionState.sessionId
    ? usePaperChatStreamStore.getState().getSessionPlanState(sessionState.sessionId)
    : null

  const quickReply = useMemo<PaperChatQuickReply | null>(() => {
    // 没有最新消息或已被用户关闭，则不展示快速回复
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

  // 切换论文时重置快速回复状态并重新加载会话
  useEffect(() => {
    setDismissedQuickReplyIds(new Set())
    void sessionState.loadSessionWithContext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id])

  // 清理已消失消息对应的快速回复关闭状态，避免内存泄漏
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
    // 流式回复进行中时禁止清空，防止中断异常
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

  // 开启联网搜索前先检查环境是否可用，不可用时弹出警告而非静默失败
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
        // 使用计数器而非简单布尔值处理拖拽，避免子元素 dragEnter/Leave 闪烁
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
          // 只有计数器归零才真正退出拖拽态，防止子元素冒泡导致误关闭
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
          activeLabDiscipline={sessionState.activeLabDiscipline}
          activeLabId={sessionState.activeLabId}
          enabledDisciplines={enabledDisciplines}
          connectedLabs={connectedLabs}
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
          onLabSelectionChange={(next) =>
            sessionState.updateLabSelection(next.discipline, next.labId)
          }
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
