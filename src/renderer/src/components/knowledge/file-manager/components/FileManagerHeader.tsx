import { useTranslation } from 'react-i18next'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './FileManagerHeader.module.css'

/** 文件管理器头部区域，包含标题和关闭按钮 */
interface FileManagerHeaderProps {
  onClose: () => void
}

export default function FileManagerHeader({ onClose }: FileManagerHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className={`sm-pane-header ${styles['file-manager-header']}`}>
      <h2>{t('knowledge.fileManager.title')}</h2>
      <button className="sm-icon-button close-btn" onClick={onClose}>
        <SvgIcon name="close" size={16} />
      </button>
    </div>
  )
}
