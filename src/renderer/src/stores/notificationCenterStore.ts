import { create } from 'zustand'
import type {
  Notification,
  NotificationType,
  NotificationSource,
  NotifyOptions
} from '@renderer/types/notification'
import { NOTIFICATION_DEFAULTS, TYPE_DURATION_MAP } from '@renderer/types/notification'
import { notificationLoggerBridge } from '@renderer/utils/notificationLoggerBridge'

let idCounter = 0

export interface ConfirmState {
  visible: boolean
  message: string
  title: string
  danger: boolean
  resolve: ((value: boolean) => void) | null
}

interface NotificationCenterState {
  notifications: Notification[]
  confirmState: ConfirmState

  hasNotifications: () => boolean

  add: (type: NotificationType, title: string, message?: string, options?: NotifyOptions) => string
  dismiss: (id: string) => void
  dismissAll: () => void
  clearByType: (type: NotificationType) => void
  clearBySource: (source: NotificationSource) => void
  requestConfirm: (message: string, title: string, danger: boolean) => Promise<boolean>
  resolveConfirm: (result: boolean) => void
}

const recentDedupeKeys = new Map<string, number>()
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearTimer(id: string): void {
  const timer = dismissTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    dismissTimers.delete(id)
  }
}

/**
 * 通知中心 Store
 * 管理应用内通知消息的添加、去重、自动关闭，以及确认对话框状态
 */
export const useNotificationCenterStore = create<NotificationCenterState>()((set, get) => ({
  notifications: [],
  confirmState: {
    visible: false,
    message: '',
    title: '',
    danger: false,
    resolve: null
  },

  hasNotifications: () => get().notifications.length > 0,

  /** 添加通知（自动去重、自动关闭、限制最大堆叠数） */
  add: (type, title, message, options) => {
    // 生成唯一 ID 和去重 key
    const id = `notif-${++idCounter}-${Date.now()}`
    const now = Date.now()
    const dedupeKey = options?.dedupeKey ?? `${type}:${title}:${message ?? ''}`

    // 去重窗口内相同通知不重复显示
    const lastShown = recentDedupeKeys.get(dedupeKey)
    if (lastShown && now - lastShown < NOTIFICATION_DEFAULTS.dedupWindowMs) {
      return ''
    }
    recentDedupeKeys.set(dedupeKey, now)

    const sticky = options?.sticky ?? (type === 'error' && NOTIFICATION_DEFAULTS.errorSticky)
    const duration = options?.duration ?? (sticky ? 0 : TYPE_DURATION_MAP[type])

    const notification: Notification = {
      id,
      type,
      title,
      message,
      duration,
      source: options?.source ?? 'global',
      timestamp: now,
      persistence: sticky ? 'sticky' : 'auto',
      dismissible: options?.dismissible ?? true,
      dedupeKey,
      metadata: options?.metadata,
      actions: options?.actions
    }

    // 超过最大堆叠数时移除最早的非 sticky 通知
    set((state) => {
      const next = [...state.notifications]

      if (next.length >= NOTIFICATION_DEFAULTS.maxStack) {
        const removableIndex = [...next].reverse().findIndex((n) => n.persistence !== 'sticky')
        if (removableIndex !== -1) {
          const actualIndex = next.length - 1 - removableIndex
          const removed = next[actualIndex]
          clearTimer(removed.id)
          next.splice(actualIndex, 1)
        } else {
          const removed = next[next.length - 1]
          clearTimer(removed.id)
          next.pop()
        }
      }

      next.unshift(notification)
      return { notifications: next }
    })

    notificationLoggerBridge.log(notification)

    if (duration > 0) {
      const timer = setTimeout(() => {
        get().dismiss(id)
      }, duration)
      dismissTimers.set(id, timer)
    }

    return id
  },

  /** 根据 ID 关闭通知 */
  dismiss: (id) => {
    const state = get()
    const index = state.notifications.findIndex((n) => n.id === id)
    if (index === -1) return
    clearTimer(id)
    set({ notifications: state.notifications.filter((n) => n.id !== id) })
  },

  /** 关闭所有通知 */
  dismissAll: () => {
    dismissTimers.forEach((timer) => clearTimeout(timer))
    dismissTimers.clear()
    recentDedupeKeys.clear()
    set({ notifications: [] })
  },

  /** 按类型清除通知 */
  clearByType: (type) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => {
        if (n.type === type) {
          clearTimer(n.id)
          return false
        }
        return true
      })
    }))
  },

  /** 按来源清除通知 */
  clearBySource: (source) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => {
        if (n.source === source) {
          clearTimer(n.id)
          return false
        }
        return true
      })
    }))
  },

  /** 请求用户确认（返回 Promise 等待用户操作） */
  requestConfirm: (message, title, danger) => {
    return new Promise((resolve) => {
      set({
        confirmState: {
          visible: true,
          message,
          title,
          danger,
          resolve
        }
      })
    })
  },

  resolveConfirm: (result) => {
    const { confirmState } = get()
    confirmState.resolve?.(result)
    set({
      confirmState: {
        visible: false,
        message: '',
        title: '',
        danger: false,
        resolve: null
      }
    })
  }
}))
