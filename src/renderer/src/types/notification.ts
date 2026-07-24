/** 通知类型 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error'

/** 通知操作按钮 */
export interface NotificationAction {
  /** 按钮文案 */
  label: string
  /** 点击回调 */
  handler: () => void
  /** 是否为主按钮样式（默认 false） */
  primary?: boolean
}

/** 通知来源模块 */
export type NotificationSource =
  | 'config'
  | 'settings'
  | 'knowledge'
  | 'paper'
  | 'chat'
  | 'file'
  | 'prompt'
  | 'system'
  | 'global'

/** 持久化策略 */
export type NotificationPersistence = 'auto' | 'sticky'

/** 单条通知数据结构 */
export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration: number
  source: NotificationSource
  timestamp: number
  persistence: NotificationPersistence
  dismissible: boolean
  dedupeKey?: string
  metadata?: Record<string, unknown>
  actions?: NotificationAction[]
}

/** 创建通知时的选项 */
export interface NotifyOptions {
  duration?: number
  source?: NotificationSource
  sticky?: boolean
  dismissible?: boolean
  dedupeKey?: string
  metadata?: Record<string, unknown>
  actions?: NotificationAction[]
}

/** 确认对话框选项 */
export interface ConfirmOptions {
  title?: string
  source?: NotificationSource
  danger?: boolean
}

/** 各类型默认显示时长(ms) */
export const TYPE_DURATION_MAP: Record<NotificationType, number> = {
  info: 5000,
  success: 3000,
  warning: 5000,
  error: 0
} as const

/** 默认配置 */
export const NOTIFICATION_DEFAULTS = {
  maxStack: 5,
  dedupWindowMs: 3000,
  defaultDuration: 5000,
  errorSticky: true
} as const
