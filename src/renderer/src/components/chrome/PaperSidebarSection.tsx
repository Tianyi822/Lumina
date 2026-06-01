import { useState, useMemo, useCallback, memo } from 'react'
import PaperSidebar from '@renderer/components/paper/PaperSidebar'
import { usePaperListStore } from '@renderer/stores/paper'
import { usePaperTranslationStore } from '@renderer/stores/paper'
import { usePaperAnnotationStore } from '@renderer/stores/paper'
import { openPaper, deletePaper, retryPaper } from '@renderer/stores/paper'
import { useNotification } from '@renderer/composables/useNotification'
import { summarizeTranslationAnnotations } from '@shared/utils/paperTranslationAnnotations'
import styles from './WorkspaceSidebarHost.module.css'

const PaperSidebarSection = memo(function PaperSidebarSection() {
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

  const handleSelectPaper = useCallback(
    async (paperId: string): Promise<void> => {
      const openedPaper = await openPaper(paperId)
      if (!openedPaper) {
        window.api.logger.warn('[PaperSidebarSection] 打开论文失败', { paperId })
      }
    },
    [openPaper]
  )

  const handleDeletePaper = useCallback(
    async (paperId: string): Promise<void> => {
      const confirmed = await notify.confirm('此操作不可撤销。', {
        title: '删除论文',
        source: 'paper',
        danger: true
      })
      if (!confirmed) return

      const success = await deletePaper(paperId)
      if (!success) {
        notify.error('删除论文失败', '请稍后重试或查看日志获取更多信息。', { source: 'paper' })
      }
    },
    [deletePaper, notify]
  )

  const handleRetryPaper = useCallback(
    async (paperId: string): Promise<void> => {
      const result = await retryPaper(paperId)
      if (!result.success) {
        notify.error('重试失败', result.error || '未知错误', { source: 'paper' })
      }
    },
    [notify, retryPaper]
  )

  const handleDeleteTranslation = useCallback(
    async (paperId: string): Promise<void> => {
      const cachedAnnotations = annotationsByPaperId[paperId]
      const annotations = cachedAnnotations ?? (await loadAnnotations(paperId))
      const translationSummary = summarizeTranslationAnnotations(annotations)

      if (translationSummary.totalCount > 0) {
        const confirmLines = [
          '当前译文里已经有标注内容。',
          `其中包含 ${translationSummary.totalCount} 条译文标注。`
        ]

        if (translationSummary.noteCount > 0) {
          confirmLines.push(`笔记 ${translationSummary.noteCount} 条`)
        }

        if (translationSummary.highlightCount > 0) {
          confirmLines.push(`标记 ${translationSummary.highlightCount} 条`)
        }

        confirmLines.push('删除译文后，这些译文标注也会一起删除。')
        confirmLines.push('确定继续删除译文吗？')

        const confirmed = await notify.confirm(confirmLines.join('\n'), {
          title: '删除译文',
          source: 'paper',
          danger: true
        })

        if (!confirmed) return
      }

      const result = await deleteTranslation(paperId)
      if (!result.success) {
        notify.error('删除译文失败', result.error || '未知错误', { source: 'paper' })
      }
    },
    [annotationsByPaperId, deleteTranslation, loadAnnotations, notify]
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
          placeholder="搜索论文"
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
