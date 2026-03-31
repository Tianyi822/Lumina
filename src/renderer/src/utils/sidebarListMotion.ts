import type { CSSProperties } from 'vue'

export type SidebarListItemMotionStyle = CSSProperties

const SIDEBAR_ITEM_ENTER_BASE_DELAY_MS = 220
const SIDEBAR_ITEM_ENTER_STAGGER_MS = 35
const SIDEBAR_ITEM_ENTER_DURATION_MS = 320
const SIDEBAR_ITEM_OPACITY_DELAY_MS = 36

export function getSidebarListItemMotionStyle(index: number): SidebarListItemMotionStyle {
  const enterBaseDelay = SIDEBAR_ITEM_ENTER_BASE_DELAY_MS + index * SIDEBAR_ITEM_ENTER_STAGGER_MS

  return {
    '--sm-sidebar-item-enter-base-delay': `${enterBaseDelay}ms`,
    '--sm-sidebar-item-enter-duration': `${SIDEBAR_ITEM_ENTER_DURATION_MS}ms`,
    '--sm-sidebar-item-opacity-delay': `${SIDEBAR_ITEM_OPACITY_DELAY_MS}ms`
  }
}
