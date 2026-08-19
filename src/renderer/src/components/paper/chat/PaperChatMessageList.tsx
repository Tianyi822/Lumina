import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  memo,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import { calculateComposerAnchoredScrollTop, parseCssPixelValue } from './paperChatScrollAnchor'
import PaperChatMessage from './message/PaperChatMessage'
import styles from './PaperChatMessageList.module.css'

// 距输入框上沿锚点小于此阈值视为仍在自动滚动区
const SCROLL_ANCHOR_THRESHOLD = 80
const DEFAULT_COMPOSER_BOTTOM_INSET = 12
const DEFAULT_STREAM_ANCHOR_GAP = 12

export interface PaperChatMessageListHandle {
  scrollToBottom: () => void
}

interface PaperChatMessageListProps {
  messages: Message[]
  currentChatId?: string
  onQuoteClick?: (quote: PaperQuote) => void
  onScrollButtonChange?: (visible: boolean) => void
}

/** 论文聊天消息列表组件，支持自动滚动锚定、推理过程折叠和滚动按钮状态管理 */
const PaperChatMessageList = memo(
  forwardRef<PaperChatMessageListHandle, PaperChatMessageListProps>(function PaperChatMessageList(
    { messages, currentChatId, onQuoteClick, onScrollButtonChange },
    ref
  ) {
    const { t } = useTranslation()
    const listRef = useRef<HTMLDivElement>(null)
    const itemsRef = useRef<HTMLDivElement>(null)
    const streamAnchorRef = useRef<HTMLDivElement>(null)
    const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set())
    // 用户是否主动向上滚动离开了输入框锚点区域
    const isUserScrolledUpRef = useRef(false)
    // 标记当前滚动由代码触发（而非用户手动），避免影响 isUserScrolledUpRef
    const isProgrammaticScrollRef = useRef(false)
    const programmaticScrollFrameRef = useRef<number | null>(null)
    const autoScrollFrameRef = useRef<number | null>(null)
    // 是否显示"回到底部"浮动按钮
    const [showScrollButton, setShowScrollButton] = useState(false)

    const visibleMessages = useMemo(
      () =>
        messages.filter(
          (message) => !message.hidden && message.role !== 'system' && message.role !== 'tool'
        ),
      [messages]
    )

    const getComposerAnchoredScrollTop = useCallback(() => {
      const element = listRef.current
      const anchor = streamAnchorRef.current
      if (!element || !anchor) return null

      const elementRect = element.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      const computedStyle = window.getComputedStyle(element)
      const composerHeight = parseCssPixelValue(
        computedStyle.getPropertyValue('--composer-height'),
        0
      )
      const composerBottomInset = parseCssPixelValue(
        computedStyle.getPropertyValue('--paper-chat-composer-bottom-inset'),
        DEFAULT_COMPOSER_BOTTOM_INSET
      )
      const anchorGap = parseCssPixelValue(
        computedStyle.getPropertyValue('--paper-chat-stream-anchor-gap'),
        DEFAULT_STREAM_ANCHOR_GAP
      )

      return calculateComposerAnchoredScrollTop({
        anchorOffsetTop: anchorRect.top - elementRect.top + element.scrollTop,
        viewportHeight: element.clientHeight,
        composerHeight,
        composerBottomInset,
        anchorGap,
        maxScrollTop: Math.max(0, element.scrollHeight - element.clientHeight)
      })
    }, [])

    const resetProgrammaticScrollFlag = useCallback(() => {
      if (programmaticScrollFrameRef.current !== null) {
        cancelAnimationFrame(programmaticScrollFrameRef.current)
      }
      programmaticScrollFrameRef.current = requestAnimationFrame(() => {
        programmaticScrollFrameRef.current = requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false
          programmaticScrollFrameRef.current = null
        })
      })
    }, [])

    const scrollToBottom = useCallback(() => {
      const element = listRef.current
      if (!element) return
      const nextScrollTop = getComposerAnchoredScrollTop()
      if (nextScrollTop === null) return

      isProgrammaticScrollRef.current = true
      element.scrollTop = nextScrollTop
      isUserScrolledUpRef.current = false
      setShowScrollButton(false)
      resetProgrammaticScrollFlag()
    }, [getComposerAnchoredScrollTop, resetProgrammaticScrollFlag])

    const scheduleComposerAnchoredScroll = useCallback(() => {
      if (isUserScrolledUpRef.current || autoScrollFrameRef.current !== null) return
      autoScrollFrameRef.current = requestAnimationFrame(() => {
        autoScrollFrameRef.current = null
        if (!isUserScrolledUpRef.current) {
          scrollToBottom()
        }
      })
    }, [scrollToBottom])

    // 暴露 scrollToBottom 给父组件
    useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom])

    useEffect(() => {
      return () => {
        if (programmaticScrollFrameRef.current !== null) {
          cancelAnimationFrame(programmaticScrollFrameRef.current)
        }
        if (autoScrollFrameRef.current !== null) {
          cancelAnimationFrame(autoScrollFrameRef.current)
        }
      }
    }, [])

    // 通知父组件按钮可见性变化
    useEffect(() => {
      onScrollButtonChange?.(showScrollButton)
    }, [showScrollButton, onScrollButtonChange])

    // 检查用户是否仍贴着输入框上沿锚点
    const checkIsNearComposerAnchor = useCallback(() => {
      const element = listRef.current
      if (!element) return true
      const targetScrollTop = getComposerAnchoredScrollTop()
      if (targetScrollTop === null) return true
      return Math.abs(element.scrollTop - targetScrollTop) < SCROLL_ANCHOR_THRESHOLD
    }, [getComposerAnchoredScrollTop])

    // 监听滚动事件，检测用户是否主动向上滚动
    const handleScroll = useCallback(() => {
      // 程序性滚动不改变用户状态
      if (isProgrammaticScrollRef.current) return
      const nearAnchor = checkIsNearComposerAnchor()
      const scrolledUp = !nearAnchor
      isUserScrolledUpRef.current = scrolledUp
      setShowScrollButton(scrolledUp)
    }, [checkIsNearComposerAnchor])

    // 新消息到来时，仅在贴底状态下自动滚动
    useEffect(() => {
      // 新消息加入（消息数量变化）时重置用户滚动状态
      isUserScrolledUpRef.current = false
      scrollToBottom()
    }, [visibleMessages.length, scrollToBottom])

    // 流式内容更新时，使用 ResizeObserver 监听消息内容高度变化并自动滚动。
    // 不能用 visibleMessages 作为依赖：rAF 节流后 setMessages 调用频率降低，
    // 而 usePaperChatStreamingReveal 在 IPC 事件间隙持续揭示字符导致 DOM 高度增长，
    // 此时 visibleMessages 引用不变，scrollToBottom 不会被触发。
    // ResizeObserver 直接监听消息内容高度变化，无论增长来源是什么都能及时滚动。
    useEffect(() => {
      if (visibleMessages.length === 0) return
      const element = itemsRef.current
      if (!element) return

      let lastHeight = element.getBoundingClientRect().height
      const observer = new ResizeObserver(() => {
        if (isUserScrolledUpRef.current) return
        const newHeight = element.getBoundingClientRect().height
        if (newHeight > lastHeight) {
          lastHeight = newHeight
          scheduleComposerAnchoredScroll()
        }
      })

      observer.observe(element)
      return () => observer.disconnect()
    }, [visibleMessages.length, scheduleComposerAnchoredScroll])

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
          <div className={styles['paper-chat-message-list__empty']}>
            {t('paper.chat.emptyGreeting')}
          </div>
        ) : (
          <div ref={itemsRef} className={styles['paper-chat-message-list__items']}>
            {visibleMessages.map((message) => (
              <PaperChatMessage
                key={message.id}
                message={message}
                currentChatId={currentChatId}
                isReasoningExpanded={expandedReasoningIds.has(message.id)}
                onToggleReasoning={toggleReasoning}
                onQuoteClick={onQuoteClick}
              />
            ))}
            <div ref={streamAnchorRef} className={styles['paper-chat-message-list__anchor']} />
          </div>
        )}
      </div>
    )
  })
)

export default PaperChatMessageList
