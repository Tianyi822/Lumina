import { useMemo } from 'react'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
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
  const files = useFileStore((s) => s.files)
  const searchQuery = useFileStore((s) => s.searchQuery)
  const searchFiles = useFileStore((s) => s.searchFiles)
  const loading = useFileStore((s) => s.loading)

  const availableFiles = useMemo(() => {
    const linkedSet = new Set(linkedFileIds)
    let result = files.filter((f) => !linkedSet.has(f.id))

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((file) => {
        const searchableText = [
          file.name,
          file.sourceKind,
          file.origin?.paperName,
          file.origin?.displayName,
          file.origin?.summary
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return searchableText.includes(query)
      })
    }

    return result
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
          <span className={styles['search-bar__label']}>文件资源池</span>
          <span className={styles['search-bar__count']}>{availableFiles.length} 个可挂载文件</span>
        </div>
        <input
          value={searchQuery}
          type="text"
          className={`sm-input ${styles['search-input']}`}
          placeholder="搜索文件..."
          onChange={(e) => searchFiles(e.target.value)}
        />
      </div>

      <div className={styles['file-list']}>
        {loading ? (
          <div className={styles['state-message']}>
            <span className="sm-spinner sm-spinner--large"></span>
            <p>加载中...</p>
          </div>
        ) : availableFiles.length === 0 ? (
          <div className={`sm-empty ${styles['state-message']}`}>
            {searchQuery ? (
              <p>未找到匹配的文件</p>
            ) : (
              <p>没有可添加的文件，请在上方拖放或选择文件上传</p>
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
