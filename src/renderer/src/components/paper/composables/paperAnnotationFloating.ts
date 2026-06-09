const FLOATING_PANEL_MARGIN = 16
const FLOATING_PANEL_OFFSET = 12

export const SELECTION_MENU_WIDTH = 220
export const SELECTION_MENU_HEIGHT = 44
export const NOTE_EDITOR_WIDTH = 420
export const NOTE_EDITOR_HEIGHT = 420
export const HOVER_POPOVER_WIDTH = 180
export const HOVER_POPOVER_HEIGHT = 44

interface FloatingAnchorRect {
  left: number
  top: number
  bottom: number
  width: number
}

/** 将数值限制在 [min, max] 范围内，若 max <= min 则仅返回 min */
function clamp(value: number, min: number, max: number): number {
  if (max <= min) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

/** 将浮动面板位置限制在视窗边界内，确保不超出屏幕边缘 */
export function clampFloatingPosition(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x, y }
  }

  return {
    x: clamp(x, FLOATING_PANEL_MARGIN, window.innerWidth - width - FLOATING_PANEL_MARGIN),
    y: clamp(y, FLOATING_PANEL_MARGIN, window.innerHeight - height - FLOATING_PANEL_MARGIN)
  }
}

/** 计算浮动面板的最佳出现位置，优先显示在选区下方，下方空间不足时显示在上方 */
export function computeFloatingPosition(
  rect: FloatingAnchorRect,
  width: number,
  height: number
): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: FLOATING_PANEL_MARGIN, y: FLOATING_PANEL_MARGIN }
  }

  const preferredX = rect.left + rect.width / 2 - width / 2
  const preferredBottom = rect.bottom + FLOATING_PANEL_OFFSET
  const preferredTop = rect.top - height - FLOATING_PANEL_OFFSET
  const fitsBelow = preferredBottom + height + FLOATING_PANEL_MARGIN <= window.innerHeight
  const fitsAbove = preferredTop >= FLOATING_PANEL_MARGIN
  const availableBelow = window.innerHeight - rect.bottom - FLOATING_PANEL_MARGIN
  const availableAbove = rect.top - FLOATING_PANEL_MARGIN
  const preferredY = fitsBelow
    ? preferredBottom
    : fitsAbove || availableAbove >= availableBelow
      ? preferredTop
      : preferredBottom

  return clampFloatingPosition(preferredX, preferredY, width, height)
}
