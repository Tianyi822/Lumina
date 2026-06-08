import { useCallback, useEffect } from 'react'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import type { UploadResult } from './hooks/useFileUpload'
import FileSelectorHeader from './file-selector/components/FileSelectorHeader'
import ExistingFilesTab from './file-selector/components/ExistingFilesTab'
import { useFileSelection } from './hooks/useFileSelection'
import ModalPortal from '@renderer/components/ui/ModalPortal'
import styles from './FileSelectorModal.module.css'

interface FileSelectorModalProps {
  kbId: string
  linkedFileIds: string[]
  onClose: () => void
  onFilesLinked: (files: FileItem[]) => void
}

export default function FileSelectorModal({
  kbId,
  linkedFileIds,
  onClose,
  onFilesLinked
}: FileSelectorModalProps) {
  const files = useFileStore((s) => s.files)
  const loadFiles = useFileStore((s) => s.loadFiles)

  const {
    selectedFileIds,
    linkingFileIds,
    toggleSelection,
    selectAll,
    deselectAll,
    linkSelectedFiles
  } = useFileSelection(files, kbId)

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  const handleToggle = useCallback((fileId: string) => toggleSelection(fileId), [toggleSelection])

  const handleLinkSelected = useCallback(async () => {
    const linkedFiles = await linkSelectedFiles()
    if (linkedFiles.length > 0) {
      onFilesLinked(linkedFiles)
    }
  }, [linkSelectedFiles, onFilesLinked])

  const handleUploadComplete = useCallback(
    (result: UploadResult) => {
      const newFiles = [...result.uploaded, ...result.duplicates]
      if (newFiles.length > 0) {
        onFilesLinked(newFiles)
      }
    },
    [onFilesLinked]
  )

  return (
    <ModalPortal onBackdropClick={onClose}>
      <div
        className={`sm-modal__surface ${styles['file-selector-container']}`}
        onClick={(e) => e.stopPropagation()}
      >
        <FileSelectorHeader onClose={onClose} />

        <ExistingFilesTab
          kbId={kbId}
          linkedFileIds={linkedFileIds}
          selectedFileIds={selectedFileIds}
          linkingFileIds={linkingFileIds}
          onToggle={handleToggle}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          onLinkSelected={handleLinkSelected}
          onUploadComplete={handleUploadComplete}
          onClose={onClose}
        />
      </div>
    </ModalPortal>
  )
}
