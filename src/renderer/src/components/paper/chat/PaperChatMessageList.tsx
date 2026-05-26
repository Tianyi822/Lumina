import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useRef,
  useState
} from 'react'
import type { Message } from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import PaperChatMessage from './message/PaperChatMessage'
import styles from './PaperChatMessageList.module.css'

// 距底部小于此阈值视为"贴底"，允许自动滚动
const SCROLL_BOTTOM_THRESHOLD = 80

export interface PaperChatMessageListHandle {
  scrollToBottom: () => void
}

interface PaperChatMessageListProps {
  messages: Message[]
  currentModelName?: string
  currentChatId?: string
  onQuoteClick?: (quote: PaperQuote) => void
  onScrollButtonChange?: (visible: boolean) => void
}

const PaperChatMessageList = forwardRef<PaperChatMessageListHandle, PaperChatMessageListProps>(
  function PaperChatMessageList(
    { messages, currentModelName, currentChatId, onQuoteClick, onScrollButtonChange },
    ref
  ) {
    const listRef = useRef<HTMLDivElement>(null)
    const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set())
    // 用户是否主动向上滚动（不贴底）
    const isUserScrolledUpRef = useRef(false)
    // 用于检测程序性滚动的标记
    const isProgrammaticScrollRef = useRef(false)
    // 是否显示"回到底部"浮动按钮
    const [showScrollButton, setShowScrollButton] = useState(false)

    const visibleMessages = useMemo(
      () =>
        messages.filter(
          (message) => !message.hidden && message.role !== 'system' && message.role !== 'tool'
        ),
      [messages]
    )

    const isStreaming = visibleMessages.some((message) => message.isStreaming)

    const scrollToBottom = useCallback(() => {
      const element = listRef.current
      if (!element) return
      isProgrammaticScrollRef.current = true
      element.scrollTop = element.scrollHeight
      isUserScrolledUpRef.current = false
      setShowScrollButton(false)
      // 程序性滚动完成后重置标记
      requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false
      })
    }, [])

    // 暴露 scrollToBottom 给父组件
    useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom])

    // 通知父组件按钮可见性变化
    useEffect(() => {
      onScrollButtonChange?.(showScrollButton)
    }, [showScrollButton, onScrollButtonChange])

    // 检查用户是否贴底
    const checkIsNearBottom = useCallback(() => {
      const element = listRef.current
      if (!element) return true
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
      return distanceFromBottom < SCROLL_BOTTOM_THRESHOLD
    }, [])

    // 监听滚动事件，检测用户是否主动向上滚动
    const handleScroll = useCallback(() => {
      // 程序性滚动不改变用户状态
      if (isProgrammaticScrollRef.current) return
      const nearBottom = checkIsNearBottom()
      const scrolledUp = !nearBottom
      isUserScrolledUpRef.current = scrolledUp
      setShowScrollButton(scrolledUp)
    }, [checkIsNearBottom])

    // 新消息到来时，仅在贴底状态下自动滚动
    useEffect(() => {
      // 新消息加入（消息数量变化）时重置用户滚动状态
      isUserScrolledUpRef.current = false
      scrollToBottom()
    }, [visibleMessages.length, scrollToBottom])

    // 流式内容更新时，仅在用户未主动上滚时自动滚动到底部
    useEffect(() => {
      if (isUserScrolledUpRef.current) return
      scrollToBottom()
    }, [visibleMessages, isStreaming, scrollToBottom])

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
      <div ref={listRef} className={styles['paper-chat-message-list']} onScroll={handleScroll}>
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
)

export default PaperChatMessageList
