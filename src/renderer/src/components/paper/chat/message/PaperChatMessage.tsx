import { useMemo } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
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
  const displayedContent = usePaperChatStreamingReveal(message.content, message.isStreaming)
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
    !!message.isStreaming &&
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
        message.isStreaming &&
        message.suppressWaitingPlaceholder &&
        !message.content?.trim() &&
        !displayedContent?.trim() &&
        !standaloneReasoning &&
        !structuredReact &&
        !toolActivity
      ) &&
      (message.isStreaming ||
        standaloneReasoning ||
        structuredReact ||
        toolActivity ||
        !!message.content?.trim()))

  const shouldShowBubble =
    message.role === 'user' ||
    showWaitingPlaceholder ||
    Boolean(message.content?.trim() || displayedContent?.trim())

  const userTokenUsageLabel =
    message.role === 'user' && !message.isStreaming
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
      } ${message.isStreaming ? styles['is-streaming'] || '' : ''}`}
    >
      <div className={styles['paper-chat-message__header']}>
        <div className={styles['paper-chat-message__avatar']}>
          <div
            className={`${styles['paper-chat-message__avatar-frame']} ${
              message.role === 'user'
                ? styles['paper-chat-message__avatar-frame--user']
                : styles['paper-chat-message__avatar-frame--assistant']
            }`}
          >
            <SvgIcon name={message.role === 'user' ? 'avatar-user' : 'avatar-ai'} size={18} />
          </div>
        </div>

        <div className={styles['paper-chat-message__sender']}>
          <span className={styles['paper-chat-message__sender-name']}>{senderName}</span>
          {message.timestamp && !message.isStreaming && (
            <span className={styles['paper-chat-message__sender-time']}>{formattedTime}</span>
          )}
          {structuredReact && (
            <span className={styles['paper-chat-message__thinking-indicator']}>
              <SvgIcon name="thinking" size={12} />
              分阶段推理
            </span>
          )}
          {!structuredReact && standaloneReasoning && (
            <span className={styles['paper-chat-message__thinking-indicator']}>
              <SvgIcon name="thinking" size={12} />
              已思考
            </span>
          )}
        </div>
      </div>

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
              message.isStreaming ? styles['is-streaming'] || '' : ''
            }`}
          >
            {showWaitingPlaceholder ? (
              <PaperChatStreamingContent />
            ) : (
              <PaperChatMessageContent
                content={displayedContent}
                isStreaming={message.isStreaming}
                role={message.role}
              />
            )}
          </div>
        )}

        {!message.isStreaming && (
          <div className={styles['paper-chat-message__meta-row']}>
            <PaperChatTokenStats
              usage={message.role === 'assistant' ? message.usage : undefined}
              userTokenLabel={message.role === 'user' ? userTokenUsageLabel : undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}
