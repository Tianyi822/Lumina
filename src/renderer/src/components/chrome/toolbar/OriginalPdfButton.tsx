import { useTranslation } from 'react-i18next'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from '../WorkspaceToolbar.module.css'

/** 「PDF 原件」切换按钮，点击在阅读器中切换 PDF 视图 */
interface OriginalPdfButtonProps {
  isActive: boolean
  onClick: () => void
}

export default function OriginalPdfButton({ isActive, onClick }: OriginalPdfButtonProps) {
  const { t } = useTranslation()
  return (
    <div className={styles['sm-workspace-toolbar__item-wrap']}>
      <button
        className={[
          'sm-icon-button',
          styles['sm-workspace-toolbar__button'],
          isActive && styles['is-active']
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={t('chrome.toolbar.originalPdf')}
        type="button"
        onClick={onClick}
      >
        <SvgIcon name="file-pdf" size={18} />
      </button>
      <span className={styles['sm-workspace-toolbar__tooltip']} role="tooltip">
        {t('chrome.toolbar.originalPdf')}
      </span>
    </div>
  )
}
