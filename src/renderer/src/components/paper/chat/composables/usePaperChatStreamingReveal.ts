import { ref, watch, onBeforeUnmount, type Ref } from 'vue'
import type { Message } from '@renderer/types'

const STREAM_REVEAL_INTERVAL = 32
const STREAM_REVEAL_MIN_CHARS = 6
const STREAM_REVEAL_MAX_CHARS = 48

export function usePaperChatStreamingReveal(message: Ref<Message>): {
  displayedContent: Ref<string>
  stopRevealLoop: () => void
} {
  const displayedContent = ref(message.value.content)
  let revealFrameId: number | null = null
  let lastRevealTimestamp = 0

  /**
   * 获取当前帧应当推进的字符数
   */
  function getRevealStep(pendingLength: number): number {
    if (pendingLength > 320) return STREAM_REVEAL_MAX_CHARS
    if (pendingLength > 160) return 32
    if (pendingLength > 64) return 18
    return STREAM_REVEAL_MIN_CHARS
  }

  /**
   * 停止流式内容显示循环
   */
  function stopRevealLoop(): void {
    if (revealFrameId !== null) {
      window.cancelAnimationFrame(revealFrameId)
      revealFrameId = null
    }
  }

  /**
   * 逐帧平滑追赶最新内容，避免每个 token 都触发一次完整重渲染
   */
  function revealNextFrame(timestamp: number): void {
    revealFrameId = null

    const fullContent = message.value.content || ''

    if (message.value.role !== 'assistant' || !message.value.isStreaming) {
      displayedContent.value = fullContent
      lastRevealTimestamp = 0
      return
    }

    if (displayedContent.value.length > fullContent.length) {
      displayedContent.value = fullContent
    }

    if (displayedContent.value.length >= fullContent.length) {
      return
    }

    if (timestamp - lastRevealTimestamp < STREAM_REVEAL_INTERVAL) {
      revealFrameId = window.requestAnimationFrame(revealNextFrame)
      return
    }

    const pendingLength = fullContent.length - displayedContent.value.length
    const nextLength = Math.min(
      fullContent.length,
      displayedContent.value.length + getRevealStep(pendingLength)
    )

    displayedContent.value = fullContent.slice(0, nextLength)
    lastRevealTimestamp = timestamp

    if (displayedContent.value.length < fullContent.length) {
      revealFrameId = window.requestAnimationFrame(revealNextFrame)
    }
  }

  /**
   * 确保流式内容显示循环已启动
   */
  function ensureRevealLoop(): void {
    if (revealFrameId === null) {
      revealFrameId = window.requestAnimationFrame(revealNextFrame)
    }
  }

  watch(
    () => [message.value.role, message.value.content, message.value.isStreaming] as const,
    ([role, content, isStreaming]) => {
      if (role !== 'assistant') {
        stopRevealLoop()
        displayedContent.value = content
        lastRevealTimestamp = 0
        return
      }

      if (!isStreaming) {
        stopRevealLoop()
        displayedContent.value = content
        lastRevealTimestamp = 0
        return
      }

      if (displayedContent.value.length > content.length) {
        displayedContent.value = content
      }

      if (!displayedContent.value && content.length > 0) {
        displayedContent.value = content.slice(0, Math.min(content.length, STREAM_REVEAL_MIN_CHARS))
        lastRevealTimestamp = 0
      }

      if (displayedContent.value.length < content.length) {
        ensureRevealLoop()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stopRevealLoop()
  })

  return {
    displayedContent,
    stopRevealLoop
  }
}
