import { useState, useEffect, useMemo } from 'react'
import type { DeleteLabOptions, LabCreationType } from '@renderer/types/lab'
import { getDeleteDialogConfig } from '@renderer/utils/labPermissions'
import styles from './DeleteConfirmDialog.module.css'

interface LabItem {
  labId: string
  name: string
  creationType?: LabCreationType
  containerIds?: string[]
  composeProjectName?: string
  hasWorkspace?: boolean
  workspaceName?: string
  metadataOnlyDelete?: boolean
}

interface DeleteConfirmDialogProps {
  visible: boolean
  lab?: LabItem | null
  isDeleting?: boolean
  onClose: () => void
  onConfirm: (labId: string, options: DeleteLabOptions) => void
}

export default function DeleteConfirmDialog({
  visible,
  lab,
  isDeleting,
  onClose,
  onConfirm
}: DeleteConfirmDialogProps) {
  const [deleteContainers, setDeleteContainers] = useState(false)

  useEffect(() => {
    if (visible) setDeleteContainers(false)
  }, [visible])

  const dialogConfig = useMemo(() => {
    if (!lab) return null
    return getDeleteDialogConfig(
      lab.creationType || 'existing',
      lab.containerIds?.length || 0,
      lab.name,
      { metadataOnly: lab.metadataOnlyDelete }
    )
  }, [lab])

  if (!visible || !lab) return null

  return (
    <div className={`sm-modal__overlay ${styles['delete-confirm-overlay']}`}>
      <div className={`sm-modal__surface ${styles['delete-confirm-dialog']}`}>
        <h3>{dialogConfig?.title || '确认删除'}</h3>
        <p>{dialogConfig?.message}</p>
        {dialogConfig?.showDeleteOption && (
          <label className={styles['delete-option']}>
            <input
              type="checkbox"
              checked={deleteContainers}
              onChange={(e) => setDeleteContainers(e.target.checked)}
            />
            <span>{dialogConfig.deleteOptionLabel}</span>
          </label>
        )}
        <div className={styles['dialog-footer']}>
          <button
            className="sm-button sm-button--secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            取消
          </button>
          <button
            className="sm-button sm-button--danger"
            disabled={isDeleting}
            onClick={() => onConfirm(lab.labId, { deleteContainers })}
          >
            {isDeleting ? <span className="sm-spinner"></span> : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}
