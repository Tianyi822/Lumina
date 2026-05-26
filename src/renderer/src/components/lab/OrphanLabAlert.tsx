import { useState, useEffect, useMemo } from 'react'
import styles from './OrphanLabAlert.module.css'

interface LabItem {
  labId: string
  name: string
  creationType?: string
  composeProjectName?: string
  frontend?: { volumeName?: string }
}

interface OrphanLabAlertProps {
  visible: boolean
  lab?: LabItem | null
  isReloading?: boolean
  canRecover?: boolean
  recoverLabel?: string
  onRecover: (labId: string) => void
  onCleanup: (labId: string) => void
}

export default function OrphanLabAlert({
  visible,
  lab,
  isReloading,
  canRecover,
  recoverLabel,
  onRecover,
  onCleanup
}: OrphanLabAlertProps) {
  const [isRecovering, setIsRecovering] = useState(false)

  useEffect(() => {
    if (!visible) setIsRecovering(false)
  }, [visible])

  useEffect(() => {
    if (!isReloading) setIsRecovering(false)
  }, [isReloading])

  const recoveringLabel = useMemo(
    () => (recoverLabel?.includes('重建') ? '重建中...' : '重新关联中...'),
    [recoverLabel]
  )

  if (!visible || !lab) return null

  const metaItems = [
    lab.composeProjectName ? `Compose ${lab.composeProjectName}` : null,
    lab.frontend?.volumeName ? `工作区 Volume ${lab.frontend.volumeName}` : null
  ].filter((item): item is string => Boolean(item))

  return (
    <div className={styles['orphan-alert']}>
      <div className={styles['alert-content']}>
        <div className={styles['alert-message']}>
          <span className={styles['alert-eyebrow']}>运行异常</span>
          <h4>容器已丢失</h4>
          <p>
            实验室「{lab.name}」关联的容器不再可用。这通常意味着容器被手动删除，或 Docker
            服务在重启后未恢复到原状态。
          </p>
          {metaItems.length > 0 && (
            <div className={styles['alert-meta']}>
              {metaItems.map((item) => (
                <span key={item} className={styles['alert-meta-item']}>
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className={styles['alert-actions']}>
          {canRecover && (
            <button
              className="sm-button sm-button--primary"
              disabled={isRecovering || isReloading}
              onClick={() => {
                setIsRecovering(true)
                onRecover(lab.labId)
              }}
            >
              {isRecovering || isReloading ? recoveringLabel : recoverLabel || '恢复'}
            </button>
          )}
          <button className="sm-button sm-button--danger" onClick={() => onCleanup(lab.labId)}>
            清理实验室
          </button>
        </div>
      </div>
    </div>
  )
}
