import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()

  return (
    <div className={styles['bottom-bar']}>
      <div className={styles['left-actions']}>
        <span className={styles['selection-count']}>
          {t('knowledge.fileSelector.selectedCount', { count: selectedCount })}
        </span>
        <div className={styles['selection-actions']}>
          <button className={styles['btn-link']} onClick={onSelectAll}>
            {t('knowledge.fileSelector.selectAll')}
          </button>
          <button className={styles['btn-link']} onClick={onDeselectAll}>
            {t('knowledge.fileSelector.deselectAll')}
          </button>
        </div>
      </div>
      <div className={styles['actions']}>
        <button className="sm-button sm-button--secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          className="sm-button sm-button--primary"
          disabled={!hasSelectedFiles}
          onClick={onLinkSelected}
        >
          {t('knowledge.fileSelector.addToKnowledge')}
        </button>
      </div>
    </div>
  )
}
