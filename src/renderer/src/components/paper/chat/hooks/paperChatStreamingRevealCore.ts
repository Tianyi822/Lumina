export const PAPER_CHAT_REVEAL_CHUNK_SIZE = 3
export const PAPER_CHAT_REVEAL_INTERVAL_MS = 18

export interface PaperChatRevealState {
  displayedContent: string
  isRevealing: boolean
}

/** 计算下一次揭示字符时应该展示到的长度（逐块递增，不超过总长度） */
export function getNextPaperChatRevealLength(
  currentLength: number,
  contentLength: number,
  chunkSize = PAPER_CHAT_REVEAL_CHUNK_SIZE
): number {
  const safeCurrentLength = Math.max(0, Math.min(currentLength, contentLength))
  return Math.min(contentLength, safeCurrentLength + chunkSize)
}

/** 根据当前揭示进度推导应该显示的文本内容和是否仍在揭示中 */
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
