import { useEffect, useMemo, useRef, useState } from 'react'
import {
  derivePaperChatRevealState,
  getNextPaperChatRevealLength,
  PAPER_CHAT_REVEAL_INTERVAL_MS,
  type PaperChatRevealState
} from './paperChatStreamingRevealCore'

/** 流式文本逐字符揭示动画 Hook，通过定时器逐步增加显示长度模拟打字效果 */
export function usePaperChatStreamingReveal(
  content: string,
  isStreaming?: boolean
): PaperChatRevealState {
  const [revealedLength, setRevealedLength] = useState(() => (isStreaming ? 0 : content.length))
  // 追踪该消息是否曾经处于流式状态，用于区分"实时完成"与"历史消息加载"
  const wasStreamingRef = useRef(Boolean(isStreaming))
  // 用 ref 保持最新 content 引用，避免 interval 因 content 变化被重复清除
  const contentRef = useRef(content)
  contentRef.current = content

  useEffect(() => {
    if (!isStreaming && !wasStreamingRef.current) {
      setRevealedLength(content.length)
    }
  }, [content.length, isStreaming])

  useEffect(() => {
    // 如果从未处于流式状态（如加载历史消息），直接显示全部内容
    if (!isStreaming && !wasStreamingRef.current) {
      setRevealedLength(content.length)
      return
    }

    if (isStreaming) {
      wasStreamingRef.current = true
    }

    // 确保 revealedLength 不超过当前内容长度（切换会话时内容可能变短）
    setRevealedLength((current) => Math.min(current, content.length))

    const timer = window.setInterval(() => {
      setRevealedLength((current) => {
        const latestContent = contentRef.current
        if (current >= latestContent.length) {
          // 流式仍在进行时继续等待后续 IPC 增量；流式结束后追完即可停止计时器。
          if (!isStreaming) {
            window.clearInterval(timer)
          }
          return current
        }
        const nextLength = getNextPaperChatRevealLength(current, latestContent.length)
        if (!isStreaming && nextLength >= latestContent.length) {
          window.clearInterval(timer)
        }
        return nextLength
      })
    }, PAPER_CHAT_REVEAL_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
    }
    // 关键修改：effect 只依赖 isStreaming，不依赖 content。
    // contentRef 确保 interval 回调始终读取最新 content，但 interval 不会被 content 变化清除和重建。
  }, [isStreaming])

  return useMemo(
    () => derivePaperChatRevealState(content, revealedLength, wasStreamingRef.current),
    [content, revealedLength]
  )
}
