import type { FileItem } from '@renderer/types'
import { useFileStore } from '@renderer/stores'
import FileIcon from '../../shared/components/FileIcon'
import { getFileSourceClass, getFileSourceLabel, getFileSubtitle } from '../../utils/fileSource'
import styles from './FileItemRow.module.css'

/** 文件选择器中的单行文件条目，包含选择框、图标、元信息和挂载状态 */
interface FileItemRowProps {
  file: FileItem
  selected?: boolean
  linking?: boolean
  onToggle: (fileId: string) => void
}

export default function FileItemRow({ file, selected, linking, onToggle }: FileItemRowProps) {
  const fileStore = useFileStore()

  return (
    <div
      className={`${styles['file-item']} ${selected ? styles.selected : ''} ${linking ? styles.linking : ''}`}
      onClick={() => onToggle(file.id)}
    >
      <div className={styles['file-checkbox']}>
        <input
          type="checkbox"
          checked={selected}
          readOnly
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggle(file.id)}
        />
      </div>

      <FileIcon fileType={file.fileType} size={24} />

      <div className={styles['file-details']}>
        <div className={styles['file-title-line']}>
          <div className={styles['file-name']}>{file.name}</div>
          <span className={`${styles['source-badge']} ${styles[getFileSourceClass(file)]}`}>
            {getFileSourceLabel(file)}
          </span>
        </div>
        <div className={styles['file-subtitle']} title={getFileSubtitle(file)}>
          {getFileSubtitle(file)}
        </div>
        <div className={styles['file-meta']}>
          <span className="badge">{file.fileType.toUpperCase()}</span>
          <span>{fileStore.formatFileSize(file.size)}</span>
          <span>{fileStore.formatDate(file.uploadedAt)}</span>
        </div>
      </div>

      {linking && (
        <div className={styles['linking-indicator']}>
          <span className="sm-spinner"></span>
        </div>
      )}
    </div>
  )
}
