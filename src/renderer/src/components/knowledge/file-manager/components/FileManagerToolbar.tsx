import { useTranslation } from 'react-i18next'
import { useFileStore } from '@renderer/stores'
import { useFilteredFiles } from '../../hooks/useFilteredFiles'
import styles from './FileManagerToolbar.module.css'

/** 文件管理器工具栏：包含搜索输入框和文件总数统计 */
export default function FileManagerToolbar() {
  const { t } = useTranslation()
  const searchQuery = useFileStore((s) => s.searchQuery)
  const searchFiles = useFileStore((s) => s.searchFiles)
  const filteredFiles = useFilteredFiles()

  return (
    <div className={styles['file-manager-toolbar']}>
      <div className={styles['toolbar-search']}>
        <input
          value={searchQuery}
          type="text"
          className={`sm-input ${styles['search-input']}`}
          placeholder={t('knowledge.common.searchPlaceholder')}
          onChange={(e) => searchFiles(e.target.value)}
        />
      </div>
      <div className={styles['file-stats']}>
        <span className={styles['file-stats__label']}>{t('knowledge.common.poolLabel')}</span>
        <span className={styles['file-stats__count']}>
          {t('knowledge.fileManager.fileCount', { count: filteredFiles.length })}
        </span>
      </div>
    </div>
  )
}
