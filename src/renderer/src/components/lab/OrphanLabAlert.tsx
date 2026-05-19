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

  return (
    <div className={styles['orphan-alert']}>
      <div className={styles['orphan-copy']}>
        <strong>{lab.name} — 容器已丢失</strong>
        <p>
          关联的 Docker 容器可能已被手动删除。
          {canRecover ? '可以尝试基于工作区重建运行容器。' : '请检查容器状态后重试。'}
        </p>
      </div>
      <div className={styles['orphan-actions']}>
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
        <button className="sm-button sm-button--secondary" onClick={() => onCleanup(lab.labId)}>
          清理记录
        </button>
      </div>
    </div>
  )
}
