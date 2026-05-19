import styles from './creator/CreateActions.module.css'

interface CreateActionsProps {
  isCreating: boolean
  canCreate: boolean
  createPhaseText: string
  onClose: () => void
  onCreate: () => void
}

export default function CreateActions({
  isCreating,
  canCreate,
  createPhaseText,
  onClose,
  onCreate
}: CreateActionsProps) {
  return (
    <div className={styles['create-actions']}>
      <button className="sm-button sm-button--secondary" onClick={onClose} disabled={isCreating}>
        取消
      </button>
      <button
        className="sm-button sm-button--primary"
        disabled={!canCreate || isCreating}
        onClick={onCreate}
      >
        {isCreating ? createPhaseText || '创建中...' : '创建实验室'}
      </button>
    </div>
  )
}
