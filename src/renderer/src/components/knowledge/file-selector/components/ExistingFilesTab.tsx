import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import { filterFilesByQuery } from '@renderer/utils/filterFilesByQuery'
import FileUploadZone from '../../shared/components/FileUploadZone'
import type { UploadResult } from '../../hooks/useFileUpload'
import FileItemRow from './FileItemRow'
import FileSelectorBottomBar from './FileSelectorBottomBar'
import styles from './ExistingFilesTab.module.css'

/** 文件选择器「已有文件」Tab：列出可挂载文件，支持搜索、筛选和多选 */
interface ExistingFilesTabProps {
  kbId: string
  linkedFileIds: string[]
  selectedFileIds: Set<string>
  linkingFileIds: Set<string>
  onToggle: (fileId: string) => void
  onSelectAll: (files: FileItem[]) => void
  onDeselectAll: () => void
  onLinkSelected: () => void
  onUploadComplete: (result: UploadResult) => void
  onClose: () => void
}

export default function ExistingFilesTab({
  kbId,
  linkedFileIds,
  selectedFileIds,
  linkingFileIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onLinkSelected,
  onUploadComplete,
  onClose
}: ExistingFilesTabProps) {
  const { t } = useTranslation()
  const files = useFileStore((s) => s.files)
  const searchQuery = useFileStore((s) => s.searchQuery)
  const searchFiles = useFileStore((s) => s.searchFiles)
  const loading = useFileStore((s) => s.loading)

  const availableFiles = useMemo(() => {
    const linkedSet = new Set(linkedFileIds)
    const unlinked = files.filter((f) => !linkedSet.has(f.id))
    return filterFilesByQuery(unlinked, searchQuery)
  }, [files, linkedFileIds, searchQuery])

  const hasSelectedFiles = selectedFileIds.size > 0
  const selectedCount = selectedFileIds.size

  return (
    <div className={styles['tab-content']}>
      <div className={styles['upload-section']}>
        <FileUploadZone
          variant="compact"
          autoLinkToKB
          kbId={kbId}
          onUploadComplete={onUploadComplete}
        />
      </div>

      <div className={styles['search-bar']}>
        <div className={styles['search-bar__copy']}>
          <span className={styles['search-bar__label']}>{t('knowledge.common.poolLabel')}</span>
          <span className={styles['search-bar__count']}>
            {t('knowledge.fileSelector.availableCount', { count: availableFiles.length })}
          </span>
        </div>
        <input
          value={searchQuery}
          type="text"
          className={`sm-input ${styles['search-input']}`}
          placeholder={t('knowledge.common.searchPlaceholder')}
          onChange={(e) => searchFiles(e.target.value)}
        />
      </div>

      <div className={styles['file-list']}>
        {loading ? (
          <div className={styles['state-message']}>
            <span className="sm-spinner sm-spinner--large"></span>
            <p>{t('common.loading')}</p>
          </div>
        ) : availableFiles.length === 0 ? (
          <div className={`sm-empty ${styles['state-message']}`}>
            {searchQuery ? (
              <p>{t('knowledge.common.noMatchingFiles')}</p>
            ) : (
              <p>{t('knowledge.fileSelector.emptyAvailable')}</p>
            )}
          </div>
        ) : (
          <div className={styles['file-items']}>
            {availableFiles.map((file) => (
              <FileItemRow
                key={file.id}
                file={file}
                selected={selectedFileIds.has(file.id)}
                linking={linkingFileIds.has(file.id)}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </div>

      <FileSelectorBottomBar
        selectedCount={selectedCount}
        hasSelectedFiles={hasSelectedFiles}
        availableFiles={availableFiles}
        onSelectAll={() => onSelectAll(availableFiles)}
        onDeselectAll={onDeselectAll}
        onLinkSelected={onLinkSelected}
        onClose={onClose}
      />
    </div>
  )
}
