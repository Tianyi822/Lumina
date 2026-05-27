import styles from '../WorkspaceToolbar.module.css'

interface OriginalPdfButtonProps {
  isActive: boolean
  onClick: () => void
}

export default function OriginalPdfButton({ isActive, onClick }: OriginalPdfButtonProps) {
  return (
    <button
      className={[
        'sm-icon-button',
        styles['sm-workspace-toolbar__button'],
        isActive && styles['is-active']
      ]
        .filter(Boolean)
        .join(' ')}
      title="PDF 原件"
      aria-label="PDF 原件"
      type="button"
      onClick={onClick}
    >
      <span className={styles['sm-workspace-toolbar__original-text']}>原</span>
    </button>
  )
}
