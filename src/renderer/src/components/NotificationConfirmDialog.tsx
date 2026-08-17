import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** 通知系统确认对话框：带标题、消息和确认/取消按钮，支持危险操作高亮 */
interface NotificationConfirmDialogProps {
  message: string
  title: string
  danger: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function NotificationConfirmDialog({
  message,
  title,
  danger,
  onConfirm,
  onCancel
}: NotificationConfirmDialogProps) {
  const { t } = useTranslation()

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeydown)
    return () => {
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [onCancel])

  return (
    <div
      className="sm-confirm-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="sm-confirm-surface" role="dialog" aria-label={title}>
        <div className="sm-confirm-surface__title">{title}</div>
        <div className="sm-confirm-surface__message">{message}</div>
        <div className="sm-confirm-surface__actions">
          <button className="sm-confirm-surface__btn" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            className={['sm-confirm-surface__btn', danger && 'sm-confirm-surface__btn--danger']
              .filter(Boolean)
              .join(' ')}
            onClick={onConfirm}
          >
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
