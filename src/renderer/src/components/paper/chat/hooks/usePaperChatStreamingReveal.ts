import { useEffect, useMemo, useRef, useState } from 'react'

const STREAMING_REVEAL_CHUNK_SIZE = 3
const STREAMING_REVEAL_INTERVAL_MS = 18
// 流式结束后加速追赶参数：约 10000 字符/秒，确保 5000 字符积压在 0.5 秒内追完
const STREAMING_CATCHUP_CHUNK_SIZE = 50
const STREAMING_CATCHUP_INTERVAL_MS = 5

export function usePaperChatStreamingReveal(content: string, isStreaming?: boolean): string {
  const [revealedLength, setRevealedLength] = useState(content.length)
  // 追踪该消息是否曾经处于流式状态，用于区分"实时完成"与"历史消息加载"
  const wasStreamingRef = useRef(isStreaming)

  useEffect(() => {
    // 如果从未处于流式状态（如加载历史消息），直接显示全部内容
    if (!isStreaming && !wasStreamingRef.current) {
      setRevealedLength(content.length)
      return
    }

    wasStreamingRef.current = isStreaming

    // 确保 revealedLength 不超过当前内容长度（切换会话时内容可能变短）
    setRevealedLength((current) => Math.min(current, content.length))

    // 流式进行中使用正常速度；流式结束后切换到加速追赶速度
    const chunkSize = isStreaming ? STREAMING_REVEAL_CHUNK_SIZE : STREAMING_CATCHUP_CHUNK_SIZE
    const interval = isStreaming ? STREAMING_REVEAL_INTERVAL_MS : STREAMING_CATCHUP_INTERVAL_MS

    const timer = window.setInterval(() => {
      setRevealedLength((current) => {
        if (current >= content.length) {
          window.clearInterval(timer)
          return current
        }
        return Math.min(content.length, current + chunkSize)
      })
    }, interval)

    return () => {
      window.clearInterval(timer)
    }
  }, [content, isStreaming])

  return useMemo(() => content.slice(0, revealedLength), [content, revealedLength])
}
