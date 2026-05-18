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

  add: (type, title, message, options) => {
    const id = `notif-${++idCounter}-${Date.now()}`
    const now = Date.now()
    const dedupeKey = options?.dedupeKey ?? `${type}:${title}:${message ?? ''}`

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

  dismiss: (id) => {
    const state = get()
    const index = state.notifications.findIndex((n) => n.id === id)
    if (index === -1) return
    clearTimer(id)
    set({ notifications: state.notifications.filter((n) => n.id !== id) })
  },

  dismissAll: () => {
    dismissTimers.forEach((timer) => clearTimeout(timer))
    dismissTimers.clear()
    recentDedupeKeys.clear()
    set({ notifications: [] })
  },

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
