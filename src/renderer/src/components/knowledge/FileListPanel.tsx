import { useState, useCallback, useMemo } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import FileIcon from './shared/components/FileIcon'
import FilePreviewDialog from './FilePreviewDialog'
import { getFileSourceClass, getFileSourceLabel } from './utils/fileSource'
import styles from './FileListPanel.module.css'

interface FileListPanelProps {
  linkedFiles: FileItem[]
  loadingFiles: boolean
  isDragging: boolean
  unlinkingFileId: string | null
  indexingStatus: boolean
  reindexing: boolean
  kbIndexingFiles: Record<string, { progress?: number }>
  invalidatedFileIds?: string[]
  onDragEnter: (event: React.DragEvent) => void
  onDragLeave: (event: React.DragEvent) => void
  onDragOver: (event: React.DragEvent) => void
  onDrop: (event: React.DragEvent) => void
  onAddFiles: () => void
  onReindex: () => void
  onUnlinkFile: (fileId: string) => void
}

function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex > 0) return fileName.substring(0, lastDotIndex)
  return fileName
}

export default function FileListPanel({
  linkedFiles,
  loadingFiles,
  isDragging,
  unlinkingFileId,
  indexingStatus,
  reindexing,
  kbIndexingFiles,
  invalidatedFileIds,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onAddFiles,
  onReindex,
  onUnlinkFile
}: FileListPanelProps) {
  const fileStore = useFileStore()
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const hasInvalidatedFiles = useMemo(
    () => (invalidatedFileIds?.length ?? 0) > 0,
    [invalidatedFileIds]
  )

  const isInvalidatedFile = useCallback(
    (file: FileItem) => invalidatedFileIds?.includes(file.id) === true,
    [invalidatedFileIds]
  )

  const handlePreviewFile = useCallback((file: FileItem) => {
    setPreviewFile(file)
    setShowPreview(true)
  }, [])

  const handleClosePreview = useCallback(() => {
    setShowPreview(false)
    setTimeout(() => setPreviewFile(null), 300)
  }, [])

  return (
    <section
      className={`${styles['documents-section']} ${isDragging ? styles['drag-over'] : ''}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className={styles['section-header']}>
        <div>
          <h3>关联文档</h3>
        </div>
        <div className={styles['section-header__actions']}>
          <span className={styles['document-count']}>{linkedFiles.length} 个文件</span>
          <button
            className={`sm-button sm-button--secondary ${styles['reindex-btn']} ${hasInvalidatedFiles ? styles['reindex-btn--warning'] : ''}`}
            disabled={indexingStatus || reindexing || linkedFiles.length === 0}
            onClick={onReindex}
          >
            {reindexing ? <span className="sm-spinner"></span> : null}
            {reindexing ? '索引中...' : '重新索引'}
          </button>
          <button
            className={`sm-button sm-button--primary ${styles['add-files-btn']}`}
            onClick={onAddFiles}
          >
            添加文档
          </button>
        </div>
      </div>

      {isDragging && (
        <div className={styles['drag-overlay']}>
          <div className={styles['drag-content']}>
            <span className={styles['drag-icon']}>+</span>
            <div className={styles['drag-copy']}>
              <strong>释放文件以上传并挂载</strong>
              <span>支持 TXT、Markdown、PDF、Word 和 CSV。</span>
            </div>
          </div>
        </div>
      )}

      {loadingFiles ? (
        <div className={styles['loading-state']}>
          <span className="sm-spinner sm-spinner--large"></span>
          <span>正在加载文档...</span>
        </div>
      ) : linkedFiles.length === 0 ? (
        <div className={`sm-empty ${styles['documents-empty']}`}>
          <h4>当前知识库还没有挂载文档</h4>
          <p>从文件资源池中选择已有文档，或直接拖拽文件到这里上传。</p>
          <button className="sm-button sm-button--primary" onClick={onAddFiles}>
            添加第一份文档
          </button>
        </div>
      ) : (
        <div className={styles['documents-grid']}>
          {linkedFiles.map((file) => (
            <article
              key={file.id}
              className={`${styles['document-card']} ${unlinkingFileId === file.id ? styles.unlinking : ''} ${indexingStatus ? styles['indexing-disabled'] : ''} ${isInvalidatedFile(file) ? styles['needs-reindex'] : ''}`}
              onClick={() => handlePreviewFile(file)}
            >
              <div className={styles['document-card__header']}>
                <FileIcon fileType={file.fileType} size={20} />
                <button
                  className={styles['document-remove-btn']}
                  disabled={unlinkingFileId === file.id || indexingStatus}
                  title="取消关联"
                  onClick={(e) => {
                    e.stopPropagation()
                    onUnlinkFile(file.id)
                  }}
                >
                  {unlinkingFileId === file.id ? (
                    <span className="sm-spinner"></span>
                  ) : (
                    <SvgIcon name="trash" size={12} />
                  )}
                </button>
              </div>

              <div className={styles['document-info']}>
                <div className={styles['document-name']} title={file.name}>
                  {getFileNameWithoutExtension(file.name)}
                </div>

                {kbIndexingFiles[file.id] && (
                  <div className={styles['file-progress']}>
                    <div className={styles['file-progress__meta']}>
                      <span>索引同步中</span>
                      <span>{kbIndexingFiles[file.id].progress || 0}%</span>
                    </div>
                    <div className={styles['progress-bar']}>
                      <div
                        className={styles['progress-fill']}
                        style={{ width: `${kbIndexingFiles[file.id].progress || 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles['document-meta']}>
                <span className={`${styles['source-badge']} ${styles[getFileSourceClass(file)]}`}>
                  {getFileSourceLabel(file)}
                </span>
                <span className={`badge ${styles['document-type']}`}>
                  {file.fileType.toUpperCase()}
                </span>
                <span>{fileStore.formatFileSize(file.size)}</span>
                <span>{fileStore.formatDate(file.uploadedAt)}</span>
              </div>
            </article>
          ))}

          <button className={styles['add-file-card']} onClick={onAddFiles}>
            <span className={styles['add-file-icon']} aria-hidden="true"></span>
            <span className={styles['add-file-text']}>添加更多文档或拖拽上传</span>
          </button>
        </div>
      )}

      <FilePreviewDialog visible={showPreview} file={previewFile} onClose={handleClosePreview} />
    </section>
  )
}
