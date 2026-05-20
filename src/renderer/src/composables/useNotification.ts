import type { NotificationType, NotifyOptions, ConfirmOptions } from '@renderer/types/notification'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import {
  notifySuccess,
  notifyError,
  notifyWarning,
  notifyInfo,
  notifyLog
} from './notificationCore'

export function useNotification(): {
  success: (title: string, message?: string, options?: NotifyOptions) => string
  error: (title: string, message?: string, options?: NotifyOptions) => string
  warning: (title: string, message?: string, options?: NotifyOptions) => string
  info: (title: string, message?: string, options?: NotifyOptions) => string
  notify: (
    type: NotificationType,
    title: string,
    message?: string,
    options?: NotifyOptions
  ) => string
  dismiss: (id: string) => void
  dismissAll: () => void
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
  logOnly: (
    type: NotificationType,
    title: string,
    message?: string,
    options?: NotifyOptions
  ) => void
} {
  return {
    success: notifySuccess,
    error: notifyError,
    warning: notifyWarning,
    info: notifyInfo,
    notify: (type, title, message, options) =>
      useNotificationCenterStore.getState().add(type, title, message, options),
    dismiss: (id) => useNotificationCenterStore.getState().dismiss(id),
    dismissAll: () => useNotificationCenterStore.getState().dismissAll(),
    confirm: (message, options) =>
      useNotificationCenterStore
        .getState()
        .requestConfirm(message, options?.title ?? '确认操作', options?.danger ?? false),
    logOnly: notifyLog
  }
}
