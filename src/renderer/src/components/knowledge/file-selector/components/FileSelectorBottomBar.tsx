import type { FileItem } from '@renderer/types'
import styles from './FileSelectorBottomBar.module.css'

/** 文件选择器底部操作栏：显示选中数量、全选/取消全选和挂载按钮 */
interface FileSelectorBottomBarProps {
  selectedCount: number
  hasSelectedFiles: boolean
  availableFiles: FileItem[]
  onClose: () => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onLinkSelected: () => void
}

export default function FileSelectorBottomBar({
  selectedCount,
  hasSelectedFiles,
  onClose,
  onSelectAll,
  onDeselectAll,
  onLinkSelected
}: FileSelectorBottomBarProps) {
  return (
    <div className={styles['bottom-bar']}>
      <div className={styles['left-actions']}>
        <span className={styles['selection-count']}>已选择 {selectedCount} 个文件</span>
        <div className={styles['selection-actions']}>
          <button className={styles['btn-link']} onClick={onSelectAll}>
            全选
          </button>
          <button className={styles['btn-link']} onClick={onDeselectAll}>
            取消全选
          </button>
        </div>
      </div>
      <div className={styles['actions']}>
        <button className="sm-button sm-button--secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="sm-button sm-button--primary"
          disabled={!hasSelectedFiles}
          onClick={onLinkSelected}
        >
          添加到知识库
        </button>
      </div>
    </div>
  )
}
