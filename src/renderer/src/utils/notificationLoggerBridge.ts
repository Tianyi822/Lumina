import type { Notification, NotificationType } from '@renderer/types/notification'

type LoggerMethod = 'info' | 'warn' | 'error'

const TYPE_LEVEL_MAP: Record<NotificationType, LoggerMethod> = {
  info: 'info',
  success: 'info',
  warning: 'warn',
  error: 'error'
}

function buildContext(notification: Notification): Record<string, unknown> {
  return {
    notificationId: notification.id,
    notificationType: notification.type,
    source: notification.source,
    duration: notification.duration,
    persistence: notification.persistence,
    timestamp: new Date(notification.timestamp).toISOString(),
    ...(notification.metadata ?? {})
  }
}

export const notificationLoggerBridge = {
  log(notification: Notification): void {
    const method = TYPE_LEVEL_MAP[notification.type]
    const message = notification.message
      ? `[Notification] ${notification.title}: ${notification.message}`
      : `[Notification] ${notification.title}`
    const context = buildContext(notification)

    try {
      window.api.logger[method](message, context)
    } catch {
      // 日志写入失败不影响通知显示
    }
  }
}
