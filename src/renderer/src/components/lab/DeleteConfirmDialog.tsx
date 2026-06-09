import { useMemo, type ReactNode } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import ModalPortal from '@renderer/components/ui/ModalPortal'
import type { LabCreationType } from '@renderer/types/lab'
import { getDeleteDialogConfig } from '@renderer/utils/labPermissions'
import styles from './DeleteConfirmDialog.module.css'

/** 删除确认对话框，根据实验室类型展示不同的警告文案和操作按钮 */
interface LabItem {
  labId: string
  name: string
  creationType?: LabCreationType
}

interface DeleteConfirmDialogProps {
  visible: boolean
  lab?: LabItem | null
  isDeleting?: boolean
  onClose: () => void
  onConfirm: (labId: string) => void
}

/** 高亮消息文本中的实验室名称（「xxx」）为粗体 */
function highlightLabName(text: string, labName: string): ReactNode {
  if (!labName) return text
  const marker = `「${labName}」`
  const index = text.indexOf(marker)
  if (index === -1) return text
  return (
    <>
      {text.slice(0, index)}
      <strong className={styles['lab-name']}>{marker}</strong>
      {text.slice(index + marker.length)}
    </>
  )
}

/** 将对话框消息按双换行分割为多个段落，每段高亮实验室名称 */
function renderMessageParagraphs(message: string, labName: string): ReactNode {
  const paragraphs = message.split(/\n\n+/).filter((part) => part.trim().length > 0)
  return paragraphs.map((paragraph, index) => (
    <p key={index}>{highlightLabName(paragraph.trim(), labName)}</p>
  ))
}

export default function DeleteConfirmDialog({
  visible,
  lab,
  isDeleting,
  onClose,
  onConfirm
}: DeleteConfirmDialogProps) {
  const dialogConfig = useMemo(() => {
    if (!lab) return null
    return getDeleteDialogConfig(lab.creationType || 'ssh', 0, lab.name)
  }, [lab])

  if (!visible || !lab || !dialogConfig) return null

  const confirmLabel = isDeleting ? '删除中…' : dialogConfig.confirmButtonText

  return (
    <ModalPortal
      className={styles.overlay}
      onBackdropClick={isDeleting ? undefined : onClose}
    >
      <div
        className={`sm-modal__surface ${styles.dialog}`}
        data-accent={dialogConfig.typeTheme}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lab-delete-dialog-title"
        aria-describedby="lab-delete-dialog-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.title}>
            <SvgIcon name="warning" size={20} aria-hidden="true" />
            <h3 id="lab-delete-dialog-title">{dialogConfig.title}</h3>
          </div>
        </header>

        <div className={styles.body} id="lab-delete-dialog-desc">
          <div className={styles.message}>{renderMessageParagraphs(dialogConfig.message, lab.name)}</div>
          {dialogConfig.warningMessage ? (
            <p className={styles['warning-callout']}>{dialogConfig.warningMessage}</p>
          ) : null}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className="sm-button sm-button--secondary"
            onClick={onClose}
            disabled={isDeleting}
          >
            取消
          </button>
          <button
            type="button"
            className="sm-button sm-button--danger"
            disabled={isDeleting}
            onClick={() => onConfirm(lab.labId)}
          >
            {isDeleting ? <span className="sm-spinner" aria-hidden="true"></span> : confirmLabel}
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}
