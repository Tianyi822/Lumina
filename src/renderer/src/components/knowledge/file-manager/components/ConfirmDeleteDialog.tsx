import SvgIcon from '@renderer/components/icons/SvgIcon'
import ModalPortal from '@renderer/components/ui/ModalPortal'
import type { FileItem } from '@renderer/types'
import styles from './ConfirmDeleteDialog.module.css'

/** 文件删除确认弹出框，警告文件正被多个知识库使用并要求强制确认 */
interface ConfirmDeleteDialogProps {
  show: boolean
  file: FileItem | null
  isDeleting?: boolean
  onConfirm: (forceDelete: boolean) => void
  onCancel: () => void
}

export default function ConfirmDeleteDialog({
  show,
  file,
  isDeleting,
  onConfirm,
  onCancel
}: ConfirmDeleteDialogProps) {
  if (!show) return null

  return (
    <ModalPortal className={styles['confirm-dialog-overlay']}>
      <div className={`sm-modal__surface ${styles['confirm-dialog']}`}>
        <div className={styles['confirm-dialog-header']}>
          <div className={styles['confirm-dialog-title']}>
            <SvgIcon name="warning" size={20} />
            <h3>确认删除文件</h3>
          </div>
          <p className={styles['confirm-dialog-subtitle']}>此操作会同时影响已关联的知识库。</p>
        </div>
        <div className={styles['confirm-dialog-body']}>
          {file && (
            <p>
              文件 &quot;<strong>{file.name}</strong>&quot; 正在被{' '}
              <strong>{file.usedByKBIds.length}</strong> 个知识库使用。
            </p>
          )}
          <p>删除此文件将从所有关联的知识库中移除。此操作不可撤销。</p>
        </div>
        <div className={styles['confirm-dialog-actions']}>
          <button className="sm-button sm-button--secondary" onClick={onCancel}>
            取消
          </button>
          <button
            className="sm-button sm-button--danger"
            disabled={isDeleting}
            onClick={() => onConfirm(true)}
          >
            {isDeleting ? <span className="sm-spinner"></span> : <span>强制删除</span>}
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}
