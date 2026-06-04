import { useMemo } from 'react'
import type { Message } from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import { estimateTokenCount, formatTokenCount } from '@renderer/utils/tokenEstimate'
import { usePaperChatStreamingReveal } from '../hooks/usePaperChatStreamingReveal'
import PaperChatMessageAttachments from './PaperChatMessageAttachments'
import PaperChatMessageContent from './PaperChatMessageContent'
import PaperChatReActSteps from './PaperChatReActSteps'
import PaperChatReasoningPanel from './PaperChatReasoningPanel'
import PaperChatStreamingContent from './PaperChatStreamingContent'
import PaperChatTokenStats from './PaperChatTokenStats'
import styles from './PaperChatMessage.module.css'

interface PaperChatMessageProps {
  message: Message
  currentModelName?: string
  isReasoningExpanded?: boolean
  currentChatId?: string
  onToggleReasoning: (messageId: string) => void
  onQuoteClick?: (quote: PaperQuote) => void
}

function hasStructuredReact(message: Message): boolean {
  return (
    message.reactIterations?.some(
      (iteration) =>
        iteration.isActive ||
        iteration.reasoning.trim().length > 0 ||
        iteration.steps.length > 0 ||
        (iteration.content?.trim().length ?? 0) > 0
    ) || false
  )
}

function hasActiveIteration(message: Message): boolean {
  return (
    message.reactIterations?.some(
      (iteration) => iteration.isActive && !iteration.reasoning && iteration.steps.length === 0
    ) || false
  )
}

function hasToolActivity(message: Message): boolean {
  const iterationHasSteps =
    message.reactIterations?.some((iteration) => iteration.steps.length > 0) || false
  return iterationHasSteps || (message.reactSteps?.length || 0) > 0 || !!message.tool_calls?.length
}

export default function PaperChatMessage({
  message,
  currentModelName,
  isReasoningExpanded,
  onToggleReasoning,
  onQuoteClick
}: PaperChatMessageProps) {
  const { displayedContent, isRevealing } = usePaperChatStreamingReveal(
    message.content,
    message.isStreaming
  )
  const isVisuallyStreaming = Boolean(message.isStreaming || isRevealing)
  const formattedTime = useMemo(() => {
    if (!message.timestamp) return ''
    return new Date(message.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }, [message.timestamp])

  const structuredReact = hasStructuredReact(message)
  const standaloneReasoning = Boolean(message.reasoning) && !structuredReact
  const toolActivity = hasToolActivity(message)
  const activeIteration = hasActiveIteration(message)
  const hasAttachments =
    (message.attachedDocuments?.length || 0) > 0 ||
    (message.attachedImages?.length || 0) > 0 ||
    (message.attachedQuotes?.length || 0) > 0

  const showWaitingPlaceholder =
    message.role === 'assistant' &&
    isVisuallyStreaming &&
    !message.suppressWaitingPlaceholder &&
    !message.content &&
    !displayedContent &&
    !standaloneReasoning &&
    !structuredReact &&
    !toolActivity &&
    !activeIteration

  const shouldRender =
    message.role === 'user' ||
    (message.role === 'assistant' &&
      !(
        isVisuallyStreaming &&
        message.suppressWaitingPlaceholder &&
        !message.content?.trim() &&
        !displayedContent?.trim() &&
        !standaloneReasoning &&
        !structuredReact &&
        !toolActivity
      ) &&
      (isVisuallyStreaming ||
        standaloneReasoning ||
        structuredReact ||
        toolActivity ||
        !!message.content?.trim()))

  const shouldShowBubble =
    message.role === 'user' ||
    showWaitingPlaceholder ||
    Boolean(message.content?.trim() || displayedContent?.trim())

  const userTokenUsageLabel =
    message.role === 'user' && !isVisuallyStreaming
      ? `输入: 约 ${formatTokenCount(estimateTokenCount(message.content))}`
      : ''

  const senderName =
    message.role === 'user' ? '用户' : message.modelName || currentModelName || 'AI'

  if (!shouldRender) {
    return null
  }

  return (
    <div
      className={`${styles['paper-chat-message']} ${
        styles[`paper-chat-message--${message.role}`] || ''
      } ${isVisuallyStreaming ? styles['is-streaming'] || '' : ''}`}
    >
      <div className={styles['paper-chat-message__body']}>
        {standaloneReasoning && (
          <PaperChatReasoningPanel
            content={message.reasoning || ''}
            isExpanded={isReasoningExpanded}
            reasoningTokens={message.usage?.reasoning_tokens}
            onToggle={() => onToggleReasoning(message.id)}
          />
        )}

        <PaperChatReActSteps
          steps={message.reactSteps}
          iterations={message.reactIterations}
          isStreaming={message.isStreaming}
        />

        {hasAttachments && (
          <div className={styles['paper-chat-message__attachments']}>
            <PaperChatMessageAttachments
              attachments={{
                documents: message.attachedDocuments,
                images: message.attachedImages,
                quotes: message.attachedQuotes
              }}
              onQuoteClick={onQuoteClick}
            />
          </div>
        )}

        {shouldShowBubble && (
          <div
            className={`${styles['paper-chat-message__bubble']} ${
              isVisuallyStreaming ? styles['is-streaming'] || '' : ''
            }`}
          >
            {showWaitingPlaceholder ? (
              <PaperChatStreamingContent />
            ) : (
              <PaperChatMessageContent
                content={displayedContent}
                isStreaming={isVisuallyStreaming}
                role={message.role}
              />
            )}
          </div>
        )}

        {!isVisuallyStreaming && (
          <div className={styles['paper-chat-message__meta-row']}>
            {message.role === 'assistant' && (
              <span className={styles['paper-chat-message__meta-sender']}>{senderName}</span>
            )}
            <PaperChatTokenStats
              usage={message.role === 'assistant' ? message.usage : undefined}
              userTokenLabel={message.role === 'user' ? userTokenUsageLabel : undefined}
            />
            {message.timestamp && (
              <span className={styles['paper-chat-message__meta-time']}>{formattedTime}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
