import { useTranslation } from 'react-i18next'
import { SUPPORTED_DOCUMENT_ACCEPT, SUPPORTED_DOCUMENT_LABEL } from '@shared/constants/document'
import { useFileUpload, type UploadResult } from '../../hooks/useFileUpload'
import styles from './FileUploadZone.module.css'

/** 文件拖拽/点击上传区域，支持自动挂载到知识库 */
interface FileUploadZoneProps {
  variant?: 'default' | 'compact'
  autoLinkToKB?: boolean
  kbId?: string
  onUploadComplete?: (result: UploadResult) => void
}

export default function FileUploadZone({
  variant = 'default',
  autoLinkToKB,
  kbId,
  onUploadComplete
}: FileUploadZoneProps) {
  const { t } = useTranslation()
  const { isDragging, isUploading, handleDragOver, handleDragLeave, handleDrop, handleFileSelect } =
    useFileUpload({
      autoLinkToKB,
      kbId,
      onUploadComplete
    })

  const zoneClass = [
    styles['upload-zone'],
    variant === 'compact' && styles['upload-zone--compact'],
    isDragging && styles.dragging,
    isUploading && styles.uploading
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={zoneClass}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!isUploading ? (
        <div className={styles['upload-content']}>
          <p className={styles['upload-text']}>
            {variant === 'compact'
              ? t('knowledge.upload.dropHintActive')
              : t('knowledge.upload.dropHint')}
          </p>
          {variant === 'default' ? (
            <p className={styles['upload-hint']}>{t('knowledge.upload.autoValidate')}</p>
          ) : null}
          <p className={styles['upload-types']}>
            {t('knowledge.upload.supportedTypes', { types: SUPPORTED_DOCUMENT_LABEL })}
          </p>
        </div>
      ) : (
        <div className={styles['uploading-content']}>
          <span className="sm-spinner sm-spinner--large"></span>
          <p>{t('knowledge.upload.uploading')}</p>
        </div>
      )}
      <input
        type="file"
        multiple
        accept={SUPPORTED_DOCUMENT_ACCEPT}
        className={styles['upload-file-input']}
        onChange={handleFileSelect}
      />
    </div>
  )
}
