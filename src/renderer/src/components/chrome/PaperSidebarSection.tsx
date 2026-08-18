import { useState, useMemo, useCallback, memo } from 'react'
import { useTranslation } from 'react-i18next'
import PaperSidebar from '@renderer/components/paper/PaperSidebar'
import { usePaperListStore } from '@renderer/stores/paper'
import { usePaperTranslationStore } from '@renderer/stores/paper'
import { usePaperAnnotationStore } from '@renderer/stores/paper'
import { openPaper, deletePaper, retryPaper } from '@renderer/stores/paper'
import { useNotification } from '@renderer/composables/useNotification'
import { summarizeTranslationAnnotations } from '@shared/utils/paperTranslationAnnotations'
import styles from './WorkspaceSidebarHost.module.css'

/**
 * 论文侧边栏内容组件
 * 提供论文搜索、列表展示、选中/删除/重试以及译文删除等功能
 */
const PaperSidebarSection = memo(function PaperSidebarSection() {
  const { t } = useTranslation()
  const papers = usePaperListStore((s) => s.papers)
  const currentPaperId = usePaperListStore((s) => s.currentPaperId)
  const renderProgressByPaperId = usePaperListStore((s) => s.renderProgressByPaperId)
  const ocrProgressByPaperId = usePaperListStore((s) => s.ocrProgressByPaperId)
  const hasTranslationByPaperId = usePaperTranslationStore((s) => s.hasTranslationByPaperId)
  const annotationsByPaperId = usePaperAnnotationStore((s) => s.annotationsByPaperId)

  const loadAnnotations = usePaperAnnotationStore((s) => s.loadAnnotations)
  const deleteTranslation = usePaperTranslationStore((s) => s.deleteTranslation)

  const [paperSearchQuery, setPaperSearchQuery] = useState('')
  const notify = useNotification()

  const filteredPapers = useMemo(() => {
    if (!paperSearchQuery.trim()) return papers
    const query = paperSearchQuery.toLowerCase()
    return papers.filter((paper) => paper.fileName.toLowerCase().includes(query))
  }, [papers, paperSearchQuery])

  const handleSelectPaper = useCallback(async (paperId: string): Promise<void> => {
    // 打开论文并处理失败情况
    const openedPaper = await openPaper(paperId)
    if (!openedPaper) {
      window.api.logger.warn('[PaperSidebarSection] 打开论文失败', { paperId })
    }
  }, [])

  const handleDeletePaper = useCallback(
    async (paperId: string): Promise<void> => {
      // 删除前确认用户意图
      const confirmed = await notify.confirm(t('notifications.paper.confirmIrreversible'), {
        title: t('notifications.paper.confirmTitle'),
        source: 'paper',
        danger: true
      })
      if (!confirmed) return

      const success = await deletePaper(paperId)
      if (!success) {
        notify.error(
          t('notifications.paper.deleteFailedTitle'),
          t('notifications.paper.deleteFailedMessage'),
          { source: 'paper' }
        )
      }
    },
    [notify, t]
  )

  const handleRetryPaper = useCallback(
    async (paperId: string): Promise<void> => {
      const result = await retryPaper(paperId)
      if (!result.success) {
        notify.error(
          t('notifications.paper.retryFailedTitle'),
          result.error || t('notifications.paper.unknownError'),
          { source: 'paper' }
        )
      }
    },
    [notify, t]
  )

  const handleDeleteTranslation = useCallback(
    async (paperId: string): Promise<void> => {
      // 删除译文前检查是否有标注，提示用户标注也会一并删除
      const cachedAnnotations = annotationsByPaperId[paperId]
      const annotations = cachedAnnotations ?? (await loadAnnotations(paperId))
      const translationSummary = summarizeTranslationAnnotations(annotations)

      if (translationSummary.totalCount > 0) {
        const confirmLines = [
          t('notifications.paper.translationAnnotatedLine1'),
          t('notifications.paper.translationAnnotatedLine2', {
            count: translationSummary.totalCount
          })
        ]

        if (translationSummary.noteCount > 0) {
          confirmLines.push(
            t('notifications.paper.translationNotes', { count: translationSummary.noteCount })
          )
        }

        if (translationSummary.highlightCount > 0) {
          confirmLines.push(
            t('notifications.paper.translationHighlights', {
              count: translationSummary.highlightCount
            })
          )
        }

        confirmLines.push(t('notifications.paper.translationAnnotatedLine3'))
        confirmLines.push(t('notifications.paper.translationAnnotatedLine4'))

        const confirmed = await notify.confirm(confirmLines.join('\n'), {
          title: t('notifications.paper.deleteTranslationTitle'),
          source: 'paper',
          danger: true
        })

        if (!confirmed) return
      }

      const result = await deleteTranslation(paperId)
      if (!result.success) {
        notify.error(
          t('notifications.paper.deleteTranslationFailedTitle'),
          result.error || t('notifications.paper.unknownError'),
          { source: 'paper' }
        )
      }
    },
    [annotationsByPaperId, deleteTranslation, loadAnnotations, notify, t]
  )

  return (
    <>
      <div
        className={['sm-sidebar-shell__search', styles['sm-workspace-sidebar-host__search']]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          type="text"
          className="sm-input"
          placeholder={t('chrome.sidebar.searchPaper')}
          value={paperSearchQuery}
          onChange={(e) => setPaperSearchQuery(e.target.value)}
        />
      </div>

      <div
        className={[
          'sm-sidebar-shell__body',
          'sm-sidebar-shell__body--flush',
          styles['sm-workspace-sidebar-host__body']
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <PaperSidebar
          papers={filteredPapers}
          currentPaperId={currentPaperId}
          renderProgressByPaperId={renderProgressByPaperId}
          ocrProgressByPaperId={ocrProgressByPaperId}
          hasTranslationByPaperId={hasTranslationByPaperId}
          onSelectPaper={handleSelectPaper}
          onDeletePaper={handleDeletePaper}
          onDeleteTranslation={handleDeleteTranslation}
          onRetryPaper={handleRetryPaper}
        />
      </div>
    </>
  )
})

export default PaperSidebarSection
