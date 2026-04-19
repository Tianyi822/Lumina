import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
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

export const useNotificationCenterStore = defineStore('notificationCenter', () => {
  const notifications = ref<Notification[]>([])
  const recentDedupeKeys = new Map<string, number>()
  const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // 确认对话框共享状态
  const confirmState = ref<ConfirmState>({
    visible: false,
    message: '',
    title: '',
    danger: false,
    resolve: null
  })

  const hasNotifications = computed(() => notifications.value.length > 0)

  function add(
    type: NotificationType,
    title: string,
    message?: string,
    options?: NotifyOptions
  ): string {
    const id = `notif-${++idCounter}-${Date.now()}`
    const now = Date.now()
    const dedupeKey = options?.dedupeKey ?? `${type}:${title}:${message ?? ''}`

    // 去重检查
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
      metadata: options?.metadata
    }

    // 溢出处理：超出 maxStack 时移除最旧的非 sticky 通知
    if (notifications.value.length >= NOTIFICATION_DEFAULTS.maxStack) {
      const removableIndex = [...notifications.value]
        .reverse()
        .findIndex((n) => n.persistence !== 'sticky')
      if (removableIndex !== -1) {
        const actualIndex = notifications.value.length - 1 - removableIndex
        const removed = notifications.value[actualIndex]
        clearTimer(removed.id)
        notifications.value.splice(actualIndex, 1)
      } else {
        const removed = notifications.value[notifications.value.length - 1]
        clearTimer(removed.id)
        notifications.value.pop()
      }
    }

    // 新通知插入头部（最新的在顶部）
    notifications.value.unshift(notification)

    // 日志桥接
    notificationLoggerBridge.log(notification)

    // 自动消失
    if (duration > 0) {
      const timer = setTimeout(() => {
        dismiss(id)
      }, duration)
      dismissTimers.set(id, timer)
    }

    return id
  }

  function dismiss(id: string): void {
    const index = notifications.value.findIndex((n) => n.id === id)
    if (index === -1) return
    clearTimer(id)
    notifications.value.splice(index, 1)
  }

  function dismissAll(): void {
    dismissTimers.forEach((timer) => clearTimeout(timer))
    dismissTimers.clear()
    notifications.value = []
    recentDedupeKeys.clear()
  }

  function clearByType(type: NotificationType): void {
    notifications.value = notifications.value.filter((n) => {
      if (n.type === type) {
        clearTimer(n.id)
        return false
      }
      return true
    })
  }

  function clearBySource(source: NotificationSource): void {
    notifications.value = notifications.value.filter((n) => {
      if (n.source === source) {
        clearTimer(n.id)
        return false
      }
      return true
    })
  }

  function clearTimer(id: string): void {
    const timer = dismissTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      dismissTimers.delete(id)
    }
  }

  function requestConfirm(message: string, title: string, danger: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      confirmState.value = {
        visible: true,
        message,
        title,
        danger,
        resolve
      }
    })
  }

  function resolveConfirm(result: boolean): void {
    confirmState.value.resolve?.(result)
    confirmState.value = {
      visible: false,
      message: '',
      title: '',
      danger: false,
      resolve: null
    }
  }

  return {
    notifications,
    hasNotifications,
    confirmState,
    add,
    dismiss,
    dismissAll,
    clearByType,
    clearBySource,
    requestConfirm,
    resolveConfirm
  }
})
