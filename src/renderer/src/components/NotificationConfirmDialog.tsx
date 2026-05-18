import { useEffect } from 'react'

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
    <div className="sm-confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="sm-confirm-surface" role="dialog" aria-label={title}>
        <div className="sm-confirm-surface__title">{title}</div>
        <div className="sm-confirm-surface__message">{message}</div>
        <div className="sm-confirm-surface__actions">
          <button className="sm-confirm-surface__btn" onClick={onCancel}>
            取消
          </button>
          <button
            className={[
              'sm-confirm-surface__btn',
              danger && 'sm-confirm-surface__btn--danger'
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={onConfirm}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
