import type { Notification, NotificationType } from '@renderer/types/notification'

type LoggerMethod = 'info' | 'warn' | 'error'

const TYPE_LEVEL_MAP: Record<NotificationType, LoggerMethod> = {
  info: 'info',
  success: 'info',
  warning: 'warn',
  error: 'error'
}

function hasUnreadableText(value: string): boolean {
  return value.includes('\uFFFD') || value.includes('锟斤拷') || value.includes('���')
}

function sanitizeLogText(value: string): string {
  if (!hasUnreadableText(value)) {
    return value
  }

  if (value.includes('docker')) {
    return 'Docker 命令执行失败：系统返回了无法正确解码的输出，请检查 Docker 是否已安装并加入 PATH。'
  }

  return '系统返回了无法正确解码的输出，已隐藏原始乱码。'
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
    const title = sanitizeLogText(notification.title)
    const notificationMessage = notification.message
      ? sanitizeLogText(notification.message)
      : undefined
    const message = notification.message
      ? `[Notification] ${title}: ${notificationMessage}`
      : `[Notification] ${title}`
    const context = buildContext(notification)

    try {
      window.api.logger[method](message, context)
    } catch {
      // 日志写入失败不影响通知显示
    }
  }
}
