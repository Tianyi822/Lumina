import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useKnowledgeIndexStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { FileItem } from '@renderer/types'

/** 知识库重新索引管理：支持部分索引（仅失效文件）或全局重新构建 */
export function useReindex(
  kbId: string | undefined,
  linkedFiles: FileItem[],
  invalidatedFileIds: string[],
  onStatsNeedUpdate: () => Promise<void>,
  onKnowledgeBaseNeedUpdate?: () => Promise<void> | void
) {
  const { t } = useTranslation()
  const indexStore = useKnowledgeIndexStore()
  const notify = useNotification()
  const [reindexProgress, setReindexProgress] = useState({ current: 0, total: 0, currentFile: '' })

  const reindexing = kbId ? indexStore.isKBReindexing(kbId) : false

  const handleReindex = useCallback(async () => {
    if (!kbId) return

    const invalidatedFileIdSet = new Set(invalidatedFileIds)
    const filesToReindex =
      invalidatedFileIdSet.size > 0
        ? linkedFiles.filter((file) => invalidatedFileIdSet.has(file.id))
        : linkedFiles
    const isPartialReindex = invalidatedFileIdSet.size > 0

    if (filesToReindex.length === 0) {
      notify.info(t('notifications.knowledge.nothingToIndex'), undefined, { source: 'knowledge' })
      return
    }

    const confirmed = await notify.confirm(
      isPartialReindex
        ? t('notifications.knowledge.reindexConfirmPartial', { count: filesToReindex.length })
        : t('notifications.knowledge.reindexConfirmFull'),
      {
        title: isPartialReindex
          ? t('notifications.knowledge.reindexConfirmPartialTitle')
          : t('notifications.knowledge.reindexConfirmFullTitle'),
        source: 'knowledge',
        danger: !isPartialReindex
      }
    )

    if (!confirmed) return

    indexStore.setKBReindexing(kbId, true)
    setReindexProgress({ current: 0, total: filesToReindex.length, currentFile: '' })

    indexStore.setFilesIndexing(
      kbId,
      filesToReindex.map((f) => ({ fileId: f.id, fileName: f.name }))
    )

    indexStore.startRefresh()

    for (const file of filesToReindex) {
      indexStore.markIndexCallStarted(kbId, file.id)
    }

    try {
      const fileIds = filesToReindex.map((file) => file.id)
      const result = await window.api.knowledge.reindex(kbId, fileIds, {
        scope: isPartialReindex ? 'files' : 'full'
      })

      if (result.success) {
        notify.success(
          t('notifications.knowledge.reindexDoneTitle'),
          t('notifications.knowledge.reindexSuccess', { count: result.data?.indexedCount || 0 }),
          { source: 'knowledge' }
        )
        await onKnowledgeBaseNeedUpdate?.()
      } else {
        const failedCount = result.data?.failedFiles?.length || 0
        if (failedCount > 0) {
          const errorDetails =
            result.data?.failedErrors?.join('\n') || result.data?.failedFiles.join('\n')
          notify.warning(
            t('notifications.knowledge.reindexDoneTitle'),
            t('notifications.knowledge.reindexPartial', {
              count: failedCount,
              details: errorDetails
            }),
            { source: 'knowledge', sticky: true }
          )
          await onKnowledgeBaseNeedUpdate?.()
        } else {
          notify.error(
            t('notifications.knowledge.reindexFailedTitle'),
            result.error || t('common.unknownError'),
            { source: 'knowledge' }
          )
        }
      }
    } catch (error) {
      notify.error(
        t('notifications.knowledge.reindexFailedTitle'),
        error instanceof Error ? error.message : String(error),
        { source: 'knowledge', sticky: true }
      )
    } finally {
      indexStore.setKBReindexing(kbId, false)
      setReindexProgress({ current: 0, total: 0, currentFile: '' })
      for (const file of filesToReindex) {
        indexStore.markIndexCallFinished(kbId, file.id)
      }
      await onStatsNeedUpdate()
    }
  }, [
    kbId,
    linkedFiles,
    invalidatedFileIds,
    notify,
    indexStore,
    onStatsNeedUpdate,
    onKnowledgeBaseNeedUpdate,
    t
  ])

  return {
    reindexProgress,
    reindexing,
    handleReindex
  }
}
