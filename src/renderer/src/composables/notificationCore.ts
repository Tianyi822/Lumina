import type { NotificationType, NotifyOptions } from '@renderer/types/notification'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import { notificationLoggerBridge } from '@renderer/utils/notificationLoggerBridge'

export function notifySuccess(title: string, message?: string, options?: NotifyOptions): string {
  return useNotificationCenterStore.getState().add('success', title, message, options)
}

export function notifyError(title: string, message?: string, options?: NotifyOptions): string {
  return useNotificationCenterStore.getState().add('error', title, message, options)
}

export function notifyWarning(title: string, message?: string, options?: NotifyOptions): string {
  return useNotificationCenterStore.getState().add('warning', title, message, options)
}

export function notifyInfo(title: string, message?: string, options?: NotifyOptions): string {
  return useNotificationCenterStore.getState().add('info', title, message, options)
}

export function notifyLog(
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
