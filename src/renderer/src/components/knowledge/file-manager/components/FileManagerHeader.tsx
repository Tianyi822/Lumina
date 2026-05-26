import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './FileManagerHeader.module.css'

interface FileManagerHeaderProps {
  onClose: () => void
}

export default function FileManagerHeader({ onClose }: FileManagerHeaderProps) {
  return (
    <div className={`sm-pane-header ${styles['file-manager-header']}`}>
      <h2>文件管理</h2>
      <button className="sm-icon-button close-btn" onClick={onClose}>
        <SvgIcon name="close" size={16} />
      </button>
    </div>
  )
}
