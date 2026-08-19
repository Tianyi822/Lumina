import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import type { Notification, NotificationAction } from '@renderer/types/notification'
import styles from './NotificationItem.module.css'

/** 单条通知项：根据通知类型显示对应图标、标题、消息和操作按钮 */
interface NotificationItemProps {
  notification: Notification
  onDismiss: (id: string) => void
}

export default function NotificationItem({ notification, onDismiss }: NotificationItemProps) {
  const { t } = useTranslation()

  const icon = useMemo(() => {
    switch (notification.type) {
      case 'error':
        return 'close'
      case 'warning':
        return 'warning'
      case 'success':
        return 'check'
      case 'info':
        return 'info'
      default:
        return 'info'
    }
  }, [notification.type])

  const typeClass = `message-${notification.type}`
  const liveRole = notification.type === 'error' ? 'alert' : 'status'
  const liveMode = notification.type === 'error' ? 'assertive' : 'polite'

  function handleAction(action: NotificationAction): void {
    action.handler()
  }

  return (
    <div
      className={[styles['sm-notification-item'], 'sm-notification-item', typeClass].join(' ')}
      role={liveRole}
      aria-live={liveMode}
      aria-atomic="true"
    >
      <div className={[styles['message-icon'], 'message-icon'].join(' ')}>
        <SvgIcon name={icon} size={14} />
      </div>
      <div className={[styles['message-content'], 'message-content'].join(' ')}>
        <div className={[styles['message-title'], 'message-title'].join(' ')}>
          {notification.title}
        </div>
        {notification.message && (
          <div className={[styles['message-text'], 'message-text'].join(' ')}>
            {notification.message}
          </div>
        )}
        {notification.actions && notification.actions.length > 0 && (
          <div className={[styles['message-actions'], 'message-actions'].join(' ')}>
            {notification.actions.map((action, index) => (
              <button
                key={index}
                type="button"
                className={[
                  'sm-button',
                  'sm-button--small',
                  action.primary ? 'sm-button--primary' : 'sm-button--secondary'
                ].join(' ')}
                onClick={() => handleAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {notification.dismissible && (
        <button
          type="button"
          className={[styles['message-close'], 'message-close'].join(' ')}
          aria-label={t('notifications.dismiss')}
          onClick={() => onDismiss(notification.id)}
        >
          <SvgIcon name="close" size={14} />
        </button>
      )}
    </div>
  )
}
