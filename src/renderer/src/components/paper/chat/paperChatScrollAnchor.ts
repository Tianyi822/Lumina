export interface PaperChatComposerAnchorScrollOptions {
  anchorOffsetTop: number
  viewportHeight: number
  composerHeight: number
  composerBottomInset: number
  anchorGap: number
  maxScrollTop: number
}

/** 将 CSS 像素值字符串（如 '100px'）解析为数字，解析失败返回默认值 */
export function parseCssPixelValue(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * 计算以输入区域为锚点的自动滚动位置，使最新消息始终显示在输入区上方
 */
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
