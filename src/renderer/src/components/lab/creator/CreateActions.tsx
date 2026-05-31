import type { LabCreateType } from '@renderer/stores/lab/types'
import styles from './CreateActions.module.css'

interface CreateActionsProps {
  isCreating: boolean
  canCreate: boolean
  createType: LabCreateType
  createPhaseText: string
  onClose: () => void
  onCreate: () => void
}

export default function CreateActions({
  isCreating,
  canCreate,
  createType,
  createPhaseText,
  onClose,
  onCreate
}: CreateActionsProps) {
  return (
    <div className={styles['creator-footer']}>
      <button className={styles['btn']} onClick={onClose} disabled={isCreating}>
        取消
      </button>
      <button
        className={styles['btn-primary']}
        disabled={!canCreate || isCreating}
        onClick={onCreate}
      >
        {isCreating
          ? createPhaseText || '创建中...'
          : createType === 'existing'
            ? '选择并使用'
            : createType === 'ssh'
              ? '连接 SSH'
              : '创建并运行'}
      </button>
    </div>
  )
}
