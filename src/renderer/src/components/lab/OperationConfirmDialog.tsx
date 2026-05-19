import { useMemo } from 'react'
import styles from './OperationConfirmDialog.module.css'

type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface OperationConfirmRequest {
  id: string
  operation: string
  title: string
  message: string
  details: Record<string, unknown>
  riskLevel: RiskLevel
  labName?: string
  labType?: string
}

interface OperationConfirmDialogProps {
  visible: boolean
  request?: OperationConfirmRequest | null
  onConfirm: (requestId: string) => void
  onCancel: (requestId: string) => void
}

const riskConfigs: Record<RiskLevel, { color: string; icon: string; title: string }> = {
  low: { color: 'var(--sm-color-status-info)', icon: 'ℹ️', title: '确认操作' },
  medium: { color: 'var(--sm-color-status-warning)', icon: '⚠️', title: '确认操作' },
  high: { color: 'var(--sm-color-status-danger)', icon: '⚠️', title: '危险操作' },
  critical: { color: 'var(--sm-color-status-danger)', icon: '🚨', title: '不可逆操作' }
}

export default function OperationConfirmDialog({
  visible,
  request,
  onConfirm,
  onCancel
}: OperationConfirmDialogProps) {
  const riskConfig = useMemo(() => {
    if (!request) return null
    return riskConfigs[request.riskLevel]
  }, [request])

  if (!visible || !request) return null

  return (
    <div className={`sm-modal__overlay ${styles['confirm-overlay']}`}>
      <div className={`sm-modal__surface ${styles['confirm-dialog']}`}>
        <div className={styles['confirm-header']}>
          <span>
            {riskConfig?.icon} {riskConfig?.title}
          </span>
        </div>
        <div className={styles['confirm-body']}>
          <h3>{request.title}</h3>
          <p>{request.message}</p>
        </div>
        <div className={styles['confirm-actions']}>
          <button className="sm-button sm-button--secondary" onClick={() => onCancel(request.id)}>
            取消
          </button>
          <button className="sm-button sm-button--primary" onClick={() => onConfirm(request.id)}>
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
