import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WriterExportFormat } from '@shared/types/writer'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import { useNotification } from '@renderer/composables/useNotification'
import styles from '../WorkspaceToolbar.module.css'

interface WriterExportButtonProps {
  documentId: string | null
  disabled?: boolean
}

const EXPORT_OPTIONS: ReadonlyArray<{ format: WriterExportFormat; label: string }> = [
  { format: 'markdown', label: 'Markdown' },
  { format: 'docx', label: 'DOCX' },
  { format: 'pdf', label: 'PDF' }
]

/** 写作导出按钮：侧栏弹出格式菜单 */
export default function WriterExportButton({ documentId, disabled }: WriterExportButtonProps) {
  const { t } = useTranslation()
  const notify = useNotification()
  const [menuOpen, setMenuOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (containerRef.current && !containerRef.current.contains(target)) {
        closeMenu()
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMenu()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closeMenu, menuOpen])

  const handleExport = useCallback(
    async (format: WriterExportFormat) => {
      if (!documentId || exporting) return
      closeMenu()
      setExporting(true)
      try {
        const result = await window.api.writer.exportDocument(documentId, format)
        if (!result.success) {
          notify.error(
            t('notifications.writer.exportFailedTitle'),
            result.error || t('notifications.writer.exportFailedFallback'),
            { source: 'chat' }
          )
          return
        }
        if (result.data?.canceled) return
        notify.success(
          t('notifications.writer.exportDoneTitle'),
          t('notifications.writer.exportDoneMessage', { format: format.toUpperCase() }),
          { source: 'chat' }
        )
      } catch (exportError) {
        notify.error(
          t('notifications.writer.exportFailedTitle'),
          exportError instanceof Error
            ? exportError.message
            : t('notifications.writer.exportFailedFallback'),
          { source: 'chat' }
        )
      } finally {
        setExporting(false)
      }
    },
    [closeMenu, documentId, exporting, notify, t]
  )

  const isDisabled = disabled || !documentId || exporting

  return (
    <div ref={containerRef} className={styles['sm-workspace-toolbar__item-wrap']}>
      <button
        className={[
          'sm-icon-button',
          styles['sm-workspace-toolbar__button'],
          menuOpen && styles['is-active']
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={t('chrome.toolbar.exportDocument')}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        type="button"
        disabled={isDisabled}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <SvgIcon name="export" size={18} />
      </button>
      <span className={styles['sm-workspace-toolbar__tooltip']} role="tooltip">
        {t('chrome.toolbar.exportDocument')}
      </span>
      {menuOpen ? (
        <div
          className={styles['sm-workspace-toolbar__writer-export-menu']}
          role="menu"
          aria-label={t('chrome.toolbar.exportFormats')}
        >
          {EXPORT_OPTIONS.map((option) => (
            <button
              key={option.format}
              type="button"
              role="menuitem"
              className={styles['sm-workspace-toolbar__writer-export-item']}
              disabled={exporting}
              onClick={() => void handleExport(option.format)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
