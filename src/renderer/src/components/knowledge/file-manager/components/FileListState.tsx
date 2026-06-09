import { type ReactNode } from 'react'
import { useFileStore } from '@renderer/stores'
import { useFilteredFiles } from '../../hooks/useFilteredFiles'
import styles from './FileListState.module.css'

/** 文件列表状态容器：处理加载中、空列表和正常列表三种状态的展示 */
interface FileListStateProps {
  children: ReactNode
}

export default function FileListState({ children }: FileListStateProps) {
  const loading = useFileStore((s) => s.loading)
  const searchQuery = useFileStore((s) => s.searchQuery)
  const filteredFiles = useFilteredFiles()

  return (
    <div className={styles['file-list-container']}>
      {loading ? (
        <div className={styles['loading-state']}>
          <span className="sm-spinner sm-spinner--large"></span>
          <p>加载中...</p>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className={`sm-empty ${styles['empty-state']}`}>
          {searchQuery ? <p>未找到匹配的文件</p> : <p>暂无文件，请上传文件</p>}
        </div>
      ) : (
        <div className={styles['file-list']}>{children}</div>
      )}
    </div>
  )
}
