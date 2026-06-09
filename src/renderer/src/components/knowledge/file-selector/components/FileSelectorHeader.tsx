import SvgIcon from '@renderer/components/icons/SvgIcon'
import styles from './FileSelectorHeader.module.css'

/** 文件选择器头部区域 */
interface FileSelectorHeaderProps {
  onClose: () => void
}

export default function FileSelectorHeader({ onClose }: FileSelectorHeaderProps) {
  return (
    <div className={`sm-pane-header ${styles['file-selector-header']}`}>
      <div className={styles['file-selector-header__copy']}>
        <h2>添加文件</h2>
      </div>
      <button className="sm-icon-button close-btn" onClick={onClose}>
        <SvgIcon name="close" size={16} />
      </button>
    </div>
  )
}
