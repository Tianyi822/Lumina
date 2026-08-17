import { Trans, useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()

  if (!show) return null

  return (
    <ModalPortal className={styles['confirm-dialog-overlay']}>
      <div className={`sm-modal__surface ${styles['confirm-dialog']}`}>
        <div className={styles['confirm-dialog-header']}>
          <div className={styles['confirm-dialog-title']}>
            <SvgIcon name="warning" size={20} />
            <h3>{t('knowledge.fileManager.confirmDeleteTitle')}</h3>
          </div>
          <p className={styles['confirm-dialog-subtitle']}>
            {t('knowledge.fileManager.confirmDeleteSubtitle')}
          </p>
        </div>
        <div className={styles['confirm-dialog-body']}>
          {file && (
            <p>
              <Trans
                i18nKey="knowledge.fileManager.deleteUsage"
                values={{ name: file.name, count: file.usedByKBIds.length }}
                components={{ strong: <strong /> }}
              />
            </p>
          )}
          <p>{t('knowledge.fileManager.confirmDeleteWarning')}</p>
        </div>
        <div className={styles['confirm-dialog-actions']}>
          <button className="sm-button sm-button--secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            className="sm-button sm-button--danger"
            disabled={isDeleting}
            onClick={() => onConfirm(true)}
          >
            {isDeleting ? (
              <span className="sm-spinner"></span>
            ) : (
              <span>{t('knowledge.fileManager.forceDelete')}</span>
            )}
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}
