import { createPortal } from 'react-dom'
import { useNotificationCenterStore } from '@renderer/stores/notificationCenterStore'
import { getRuntimePlatform } from '@renderer/composables/runtimePlatformCore'
import NotificationItem from './NotificationItem'
import NotificationConfirmDialog from './NotificationConfirmDialog'

export default function NotificationCenter() {
  const notifications = useNotificationCenterStore((s) => s.notifications)
  const confirmState = useNotificationCenterStore((s) => s.confirmState)
  const dismiss = useNotificationCenterStore((s) => s.dismiss)
  const resolveConfirm = useNotificationCenterStore((s) => s.resolveConfirm)

  const { isWindows } = getRuntimePlatform()

  const content = (
    <>
      {notifications.length > 0 && (
        <div
          className={[
            'sm-notification-center',
            isWindows && 'sm-notification-center--windows'
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}

      {confirmState.visible && (
        <NotificationConfirmDialog
          message={confirmState.message}
          title={confirmState.title}
          danger={confirmState.danger}
          onConfirm={() => resolveConfirm(true)}
          onCancel={() => resolveConfirm(false)}
        />
      )}
    </>
  )

  return createPortal(content, document.body)
}
