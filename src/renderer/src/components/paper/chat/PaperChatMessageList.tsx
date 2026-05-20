import { useEffect, useMemo, useRef, useState } from 'react'
import type { Message } from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import PaperChatMessage from './message/PaperChatMessage'
import styles from './PaperChatMessageList.module.css'

interface PaperChatMessageListProps {
  messages: Message[]
  currentModelName?: string
  currentChatId?: string
  onQuoteClick?: (quote: PaperQuote) => void
}

export default function PaperChatMessageList({
  messages,
  currentModelName,
  currentChatId,
  onQuoteClick
}: PaperChatMessageListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set())

  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (message) => !message.hidden && message.role !== 'system' && message.role !== 'tool'
      ),
    [messages]
  )
  const latestVisibleMessageContent = visibleMessages.at(-1)?.content

  useEffect(() => {
    const element = listRef.current
    if (!element) return
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight
    })
  }, [visibleMessages.length, latestVisibleMessageContent])

  function toggleReasoning(messageId: string): void {
    setExpandedReasoningIds((current) => {
      const next = new Set(current)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  return (
    <div ref={listRef} className={styles['paper-chat-message-list']}>
      {visibleMessages.length === 0 ? (
        <div className="paper-chat-message-list__empty">开始针对这篇论文提问吧</div>
      ) : (
        <div className="paper-chat-message-list__items">
          {visibleMessages.map((message) => (
            <PaperChatMessage
              key={message.id}
              message={message}
              currentModelName={currentModelName}
              currentChatId={currentChatId}
              isReasoningExpanded={expandedReasoningIds.has(message.id)}
              onToggleReasoning={toggleReasoning}
              onQuoteClick={onQuoteClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
