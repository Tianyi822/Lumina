import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from '../WorkspaceToolbar.module.css'

/** 「PDF 原件」切换按钮，点击在阅读器中切换 PDF 视图 */
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
      <SvgIcon name="file-pdf" size={18} />
    </button>
  )
}
