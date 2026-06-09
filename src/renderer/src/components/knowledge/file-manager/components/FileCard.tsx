import type { FileItem } from '@renderer/types'
import { useFileStore } from '@renderer/stores'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import FileIcon from '../../shared/components/FileIcon'
import {
  canDeleteFile,
  getFileSourceClass,
  getFileSourceLabel,
  getFileSubtitle
} from '../../utils/fileSource'
import styles from './FileCard.module.css'

/** 文件资源池中的单行卡片，展示文件信息、来源标签和删除操作 */
interface FileCardProps {
  file: FileItem
  isDeleting?: boolean
  onDelete: (file: FileItem) => void
  onPreview: (file: FileItem) => void
}

/** 从文件名中去除扩展名 */
function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex > 0) return fileName.substring(0, lastDotIndex)
  return fileName
}

export default function FileCard({ file, isDeleting, onDelete, onPreview }: FileCardProps) {
  const fileStore = useFileStore()

  return (
    <div className={styles['file-row']} onClick={() => onPreview(file)}>
      <div className={styles['file-row__main']}>
        <div className={styles['file-row__title-line']}>
          <FileIcon fileType={file.fileType} size={14} className={styles['file-row__icon']} />
          <div className={styles['file-name']} title={file.name}>
            {getFileNameWithoutExtension(file.name)}
          </div>
          <span className={`${styles['source-badge']} ${styles[getFileSourceClass(file)]}`}>
            {getFileSourceLabel(file)}
          </span>
          <div className={styles['file-meta']}>
            <span className={`badge ${styles['file-type-badge']}`}>
              {file.fileType.toUpperCase()}
            </span>
            <span>{fileStore.formatFileSize(file.size)}</span>
            <span>{fileStore.formatDate(file.uploadedAt)}</span>
          </div>
          {file.usedByKBIds.length > 0 && <div className={styles['usage-badge']}>使用中</div>}
          {canDeleteFile(file) && (
            <button
              className={styles['delete-btn']}
              disabled={isDeleting}
              title={file.usedByKBIds.length > 0 ? '文件被知识库使用，删除需谨慎' : '删除文件'}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(file)
              }}
            >
              {isDeleting ? (
                <span className="sm-spinner"></span>
              ) : (
                <SvgIcon name="trash" size={14} />
              )}
            </button>
          )}
        </div>
        <div className={styles['file-subtitle']} title={getFileSubtitle(file)}>
          {getFileSubtitle(file)}
        </div>
      </div>
    </div>
  )
}
