export interface PaperChatComposerAnchorScrollOptions {
  anchorOffsetTop: number
  viewportHeight: number
  composerHeight: number
  composerBottomInset: number
  anchorGap: number
  maxScrollTop: number
}

export function parseCssPixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function calculateComposerAnchoredScrollTop({
  anchorOffsetTop,
  viewportHeight,
  composerHeight,
  composerBottomInset,
  anchorGap,
  maxScrollTop
}: PaperChatComposerAnchorScrollOptions): number {
  const anchorViewportTop = Math.max(
    0,
    viewportHeight - composerHeight - composerBottomInset - anchorGap
  )
  const targetScrollTop = anchorOffsetTop - anchorViewportTop
  return Math.max(0, Math.min(targetScrollTop, maxScrollTop))
}
