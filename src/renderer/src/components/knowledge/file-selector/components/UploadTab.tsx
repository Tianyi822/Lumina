import { useState, useCallback } from 'react'
import FileUploadZone from '../../shared/components/FileUploadZone'
import type { UploadResult } from '../../hooks/useFileUpload'
import type { FileItem } from '@renderer/types'
import styles from './UploadTab.module.css'

interface UploadTabProps {
  kbId: string
  onClose: () => void
  onUploadComplete: (result: UploadResult) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function UploadTab({ kbId, onClose, onUploadComplete }: UploadTabProps) {
  const [uploadedFiles, setUploadedFiles] = useState<FileItem[]>([])

  const handleUploadComplete = useCallback(
    (result: UploadResult) => {
      const newFiles = [...result.uploaded, ...result.duplicates]
      setUploadedFiles((prev) => [...prev, ...newFiles])
      onUploadComplete(result)
    },
    [onUploadComplete]
  )

  return (
    <div className={styles['tab-content']}>
      <div className={styles['upload-copy']}>
        <p>
          新文件会先进入文件资源池，再自动挂载到当前知识库。文件删除需重建索引，请在知识库中操作。
        </p>
      </div>

      <div className={styles['upload-wrapper']}>
        <FileUploadZone autoLinkToKB={true} kbId={kbId} onUploadComplete={handleUploadComplete} />
      </div>

      {uploadedFiles.length > 0 && (
        <div className={styles['upload-result-list']}>
          {uploadedFiles.map((file) => (
            <div key={file.id} className={styles['upload-result-item']}>
              <span className={styles['upload-result-item__name']}>{file.name}</span>
              <span className={styles['upload-result-item__size']}>{formatSize(file.size)}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles['upload-actions']}>
        <button className="sm-button sm-button--secondary" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
