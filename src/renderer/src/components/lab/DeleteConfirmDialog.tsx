import { useState, useEffect, useMemo, type ReactNode } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
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
  const [deleteContainers, setDeleteContainers] = useState(false)

  const dialogConfig = useMemo(() => {
    if (!lab) return null
    return getDeleteDialogConfig(
      lab.creationType || 'existing',
      lab.containerIds?.length || 0,
      lab.name,
      { metadataOnly: lab.metadataOnlyDelete }
    )
  }, [lab])

  useEffect(() => {
    if (!visible) return
    setDeleteContainers(dialogConfig?.defaultDeleteContainers ?? false)
  }, [visible, dialogConfig?.defaultDeleteContainers])

  if (!visible || !lab || !dialogConfig) return null

  const confirmLabel = isDeleting ? '删除中…' : dialogConfig.confirmButtonText
  const accentTheme = lab.metadataOnlyDelete ? 'danger' : dialogConfig.typeTheme

  return (
    <div
      className={`sm-modal__overlay ${styles.overlay}`}
      onClick={isDeleting ? undefined : onClose}
      role="presentation"
    >
      <div
        className={`sm-modal__surface ${styles.dialog}`}
        data-accent={accentTheme}
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
          {lab.metadataOnlyDelete ? (
            <p className={styles.subtitle}>无法确认关联容器，将仅移除 Lumina 中的记录</p>
          ) : null}
        </header>

        <div className={styles.body} id="lab-delete-dialog-desc">
          {lab.metadataOnlyDelete ? (
            <div className={`${styles.notice} ${styles['notice--danger']}`}>
              <SvgIcon name="warning" size={16} aria-hidden="true" />
              <span>不会停止或删除 Docker 中的容器</span>
            </div>
          ) : null}
          <div className={styles.message}>{renderMessageParagraphs(dialogConfig.message, lab.name)}</div>
          {dialogConfig.showDeleteOption ? (
            <label className={styles['delete-option']}>
              <input
                type="checkbox"
                checked={deleteContainers}
                onChange={(event) => setDeleteContainers(event.target.checked)}
              />
              <span>{dialogConfig.deleteOptionLabel}</span>
            </label>
          ) : null}
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
            onClick={() => onConfirm(lab.labId, { deleteContainers })}
          >
            {isDeleting ? <span className="sm-spinner" aria-hidden="true"></span> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
