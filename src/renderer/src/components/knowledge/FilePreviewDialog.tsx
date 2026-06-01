import { useState, useEffect, useCallback } from 'react'
import type { FileItem, FilePreviewData } from '@renderer/types'
import { useFileStore } from '@renderer/stores'
import FileIcon from './shared/components/FileIcon'
import {
  canOpenFileExternally,
  getFileSourceClass,
  getFileSourceLabel,
  getFileSubtitle
} from './utils/fileSource'
import styles from './FilePreviewDialog.module.css'

interface FilePreviewDialogProps {
  visible: boolean
  file: FileItem | null
  onClose: () => void
}

export default function FilePreviewDialog({ visible, file, onClose }: FilePreviewDialogProps) {
  const fileStore = useFileStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewData, setPreviewData] = useState<FilePreviewData | null>(null)

  const loadPreview = useCallback(async () => {
    if (!file) return
    setLoading(true)
    setError('')
    setPreviewData(null)

    const result = await window.api.file.preview(file.id)
    if (result.success && result.data) {
      setPreviewData(result.data)
    } else {
      setError(result.error || '未知错误')
    }
    setLoading(false)
  }, [file])

  useEffect(() => {
    if (visible && file) {
      loadPreview()
    }
  }, [visible, file, loadPreview])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && visible) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible, onClose])

  const handleOpenExternal = useCallback(async () => {
    if (!file) return
    const result = await window.api.file.openExternal(file.id)
    if (!result.success) {
      setError(result.error || '打开文件失败')
    }
  }, [file])

  if (!visible || !file) return null

  return (
    <div className={styles['file-preview-overlay']} onClick={onClose}>
      <div
        className={styles['file-preview-dialog']}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles['file-preview-header']}>
          <div className={styles['file-preview-meta']}>
            <div className={styles['file-preview-title']}>
              <FileIcon fileType={file.fileType} size={18} />
              <span className={styles['file-preview-name']}>{file.name}</span>
            </div>
            <div className={styles['file-preview-info']}>
              <span
                className={`${styles['file-preview-badge']} ${styles[getFileSourceClass(file)]}`}
              >
                {getFileSourceLabel(file)}
              </span>
              <span className={styles['file-preview-badge']}>{file.fileType.toUpperCase()}</span>
              <span>{fileStore.formatFileSize(file.size)}</span>
              <span>{fileStore.formatDate(file.uploadedAt)}</span>
            </div>
            <div className={styles['file-preview-subtitle']}>{getFileSubtitle(file)}</div>
          </div>
          <div className={styles['file-preview-actions']}>
            {canOpenFileExternally(file) && (
              <button
                type="button"
                className={styles['preview-action-btn']}
                onClick={handleOpenExternal}
              >
                外部打开
              </button>
            )}
            <button type="button" className={styles['preview-action-btn']} onClick={onClose}>
              关闭
            </button>
          </div>
        </div>

        <div className={styles['file-preview-body']}>
          {loading ? (
            <div className={styles['file-preview-loading']}>
              <span className="sm-spinner sm-spinner--large"></span>
              <span>正在加载文件内容...</span>
            </div>
          ) : error ? (
            <div className={styles['file-preview-error']}>
              <div className={styles['error-title']}>文件预览失败</div>
              <div className={styles['error-text']}>{error}</div>
            </div>
          ) : previewData ? (
            <div className={styles['file-preview-content-wrapper']}>
              {previewData.isTruncated && (
                <div className={styles['file-preview-notice']}>
                  文件内容较长，已截断显示。如需查看完整内容，请点击&quot;外部打开&quot;使用系统程序查看。
                </div>
              )}
              <pre className={styles['file-preview-content']}>{previewData.content}</pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
