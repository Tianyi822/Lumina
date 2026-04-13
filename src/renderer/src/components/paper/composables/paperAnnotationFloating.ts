const FLOATING_PANEL_MARGIN = 16
const FLOATING_PANEL_OFFSET = 12

export const SELECTION_MENU_WIDTH = 248
export const SELECTION_MENU_HEIGHT = 176
export const NOTE_EDITOR_WIDTH = 420
export const NOTE_EDITOR_HEIGHT = 420
export const HOVER_POPOVER_WIDTH = 336
export const HOVER_POPOVER_HEIGHT = 248

function clamp(value: number, min: number, max: number): number {
  if (max <= min) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

export function computeFloatingPosition(
  rect: DOMRect,
  width: number,
  height: number
): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: FLOATING_PANEL_MARGIN, y: FLOATING_PANEL_MARGIN }
  }

  const x = clamp(
    rect.left + rect.width / 2 - width / 2,
    FLOATING_PANEL_MARGIN,
    window.innerWidth - width - FLOATING_PANEL_MARGIN
  )
  const preferredBottom = rect.bottom + FLOATING_PANEL_OFFSET
  const fitsBelow = preferredBottom + height + FLOATING_PANEL_MARGIN <= window.innerHeight
  const y = fitsBelow
    ? preferredBottom
    : clamp(
        rect.top - height - FLOATING_PANEL_OFFSET,
        FLOATING_PANEL_MARGIN,
        window.innerHeight - height - FLOATING_PANEL_MARGIN
      )

  return { x, y }
}
