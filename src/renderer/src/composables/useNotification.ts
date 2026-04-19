import { notificationLoggerBridge } from '@renderer/utils/notificationLoggerBridge'
import type { NotificationType, NotifyOptions, ConfirmOptions } from '@renderer/types/notification'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'

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
  const store = useNotificationCenterStore()

  function success(title: string, message?: string, options?: NotifyOptions): string {
    return store.add('success', title, message, options)
  }

  function error(title: string, message?: string, options?: NotifyOptions): string {
    return store.add('error', title, message, options)
  }

  function warning(title: string, message?: string, options?: NotifyOptions): string {
    return store.add('warning', title, message, options)
  }

  function info(title: string, message?: string, options?: NotifyOptions): string {
    return store.add('info', title, message, options)
  }

  function notify(
    type: NotificationType,
    title: string,
    message?: string,
    options?: NotifyOptions
  ): string {
    return store.add(type, title, message, options)
  }

  function dismiss(id: string): void {
    store.dismiss(id)
  }

  function dismissAll(): void {
    store.dismissAll()
  }

  function confirm(message: string, options?: ConfirmOptions): Promise<boolean> {
    return store.requestConfirm(message, options?.title ?? '确认操作', options?.danger ?? false)
  }

  function logOnly(
    type: NotificationType,
    title: string,
    message?: string,
    options?: NotifyOptions
  ): void {
    notificationLoggerBridge.log({
      id: `log-${Date.now()}`,
      type,
      title,
      message,
      duration: 0,
      source: options?.source ?? 'global',
      timestamp: Date.now(),
      persistence: 'auto',
      dismissible: true,
      metadata: options?.metadata
    })
  }

  return {
    success,
    error,
    warning,
    info,
    notify,
    dismiss,
    dismissAll,
    confirm,
    logOnly
  }
}
