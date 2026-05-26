import { useEffect, useMemo, useState } from 'react'

const STREAMING_REVEAL_CHUNK_SIZE = 3
const STREAMING_REVEAL_INTERVAL_MS = 18

export function usePaperChatStreamingReveal(content: string, isStreaming?: boolean): string {
  const [revealedLength, setRevealedLength] = useState(content.length)

  useEffect(() => {
    if (!isStreaming) {
      setRevealedLength(content.length)
      return
    }

    setRevealedLength((current) => Math.min(current, content.length))
    const timer = window.setInterval(() => {
      setRevealedLength((current) => {
        if (current >= content.length) {
          window.clearInterval(timer)
          return current
        }
        return Math.min(content.length, current + STREAMING_REVEAL_CHUNK_SIZE)
      })
    }, STREAMING_REVEAL_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [content, isStreaming])

  return useMemo(() => content.slice(0, revealedLength), [content, revealedLength])
}
