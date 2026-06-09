import { useState, useEffect, useCallback, memo } from 'react'
import { useFileStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { FileItem } from '@renderer/types'
import FileUploadZone from './shared/components/FileUploadZone'
import type { UploadResult } from './hooks/useFileUpload'
import FileManagerHeader from './file-manager/components/FileManagerHeader'
import FileManagerToolbar from './file-manager/components/FileManagerToolbar'
import FileCard from './file-manager/components/FileCard'
import FileListState from './file-manager/components/FileListState'
import ConfirmDeleteDialog from './file-manager/components/ConfirmDeleteDialog'
import { useFileDelete } from './hooks/useFileDelete'
import FilePreviewDialog from './FilePreviewDialog'
import ModalPortal from '@renderer/components/ui/ModalPortal'
import styles from './FileManagerModal.module.css'

interface FileManagerModalProps {
  onClose: () => void
}

/** 文件管理器弹窗：管理文件上传、列表展示、搜索、删除、预览等功能 */
function FileManagerModal({ onClose }: FileManagerModalProps) {
  const loadFiles = useFileStore((s) => s.loadFiles)
  const filteredFiles = useFileStore((s) => s.filteredFiles())

  const notify = useNotification()

  const {
    deletingFileId,
    showConfirmDialog,
    fileToDelete,
    handleDeleteClick,
    performDelete,
    cancelDelete
  } = useFileDelete()

  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  const handleUploadComplete = useCallback(
    (result: UploadResult) => {
      const messages: string[] = []

      if (result.duplicates.length > 0) {
        const names = result.duplicates.map((f) => f.name).join(', ')
        messages.push(`以下文件已存在，已自动关联：${names}`)
      }

      if (result.errors.length > 0) {
        notify.error('文件上传', `部分文件上传失败：${result.errors.join('；')}`, {
          source: 'file'
        })
        return
      }

      if (messages.length > 0) {
        notify.info('文件上传', messages.join(' '), { source: 'file' })
      }
    },
    [notify]
  )

  const handlePreview = useCallback((file: FileItem) => {
    setPreviewFile(file)
    setShowPreview(true)
  }, [])

  const handleClosePreview = useCallback(() => {
    setShowPreview(false)
    setTimeout(() => setPreviewFile(null), 300)
  }, [])

  return (
    <>
      <ModalPortal onBackdropClick={onClose}>
        <div
          className={`sm-modal__surface ${styles['file-manager-container']}`}
          onClick={(e) => e.stopPropagation()}
        >
        <FileManagerHeader onClose={onClose} />

        <FileManagerToolbar />

        <div className={styles['drop-zone-wrapper']}>
          <FileUploadZone onUploadComplete={handleUploadComplete} />
        </div>

        <FileListState>
          {filteredFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              isDeleting={deletingFileId === file.id}
              onDelete={handleDeleteClick}
              onPreview={handlePreview}
            />
          ))}
        </FileListState>
        </div>
      </ModalPortal>

      <ConfirmDeleteDialog
        show={showConfirmDialog}
        file={fileToDelete}
        isDeleting={!!deletingFileId}
        onConfirm={performDelete}
        onCancel={cancelDelete}
      />

      <FilePreviewDialog visible={showPreview} file={previewFile} onClose={handleClosePreview} />
    </>
  )
}

export default memo(FileManagerModal)
