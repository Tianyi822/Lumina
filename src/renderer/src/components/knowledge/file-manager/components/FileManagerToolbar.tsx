import { useFileStore } from '@renderer/stores'
import styles from './FileManagerToolbar.module.css'

export default function FileManagerToolbar() {
  const searchQuery = useFileStore((s) => s.searchQuery)
  const searchFiles = useFileStore((s) => s.searchFiles)
  const filteredFiles = useFileStore((s) => s.filteredFiles())

  return (
    <div className={styles['file-manager-toolbar']}>
      <div className={styles['toolbar-search']}>
        <input
          value={searchQuery}
          type="text"
          className={`sm-input ${styles['search-input']}`}
          placeholder="搜索文件..."
          onChange={(e) => searchFiles(e.target.value)}
        />
      </div>
      <div className={styles['file-stats']}>
        <span className={styles['file-stats__label']}>文件资源池</span>
        <span className={styles['file-stats__count']}>{filteredFiles.length} 个文件</span>
      </div>
    </div>
  )
}
