export const PAPER_CHAT_REVEAL_CHUNK_SIZE = 3
export const PAPER_CHAT_REVEAL_INTERVAL_MS = 18

export interface PaperChatRevealState {
  displayedContent: string
  isRevealing: boolean
}

export function getNextPaperChatRevealLength(
  currentLength: number,
  contentLength: number,
  chunkSize = PAPER_CHAT_REVEAL_CHUNK_SIZE
): number {
  const safeCurrentLength = Math.max(0, Math.min(currentLength, contentLength))
  return Math.min(contentLength, safeCurrentLength + chunkSize)
}

export function derivePaperChatRevealState(
  content: string,
  revealedLength: number,
  hasEverStreamed: boolean
): PaperChatRevealState {
  const safeRevealedLength = Math.max(0, Math.min(revealedLength, content.length))
  return {
    displayedContent: content.slice(0, safeRevealedLength),
    isRevealing: hasEverStreamed && safeRevealedLength < content.length
  }
}
