import { useState, useCallback } from 'react'
import { useKnowledgeIndexStore } from '@renderer/stores'
import { useNotification } from '@renderer/composables/useNotification'
import type { FileItem } from '@renderer/types'

export function useReindex(
  kbId: string | undefined,
  linkedFiles: FileItem[],
  onStatsNeedUpdate: () => Promise<void>,
  onKnowledgeBaseNeedUpdate?: () => Promise<void> | void
) {
  const indexStore = useKnowledgeIndexStore()
  const notify = useNotification()
  const [reindexProgress, setReindexProgress] = useState({ current: 0, total: 0, currentFile: '' })

  const reindexing = kbId ? indexStore.isKBReindexing(kbId) : false

  const handleReindex = useCallback(async () => {
    if (!kbId) return

    if (linkedFiles.length === 0) {
      notify.info('没有文件需要索引', undefined, { source: 'knowledge' })
      return
    }

    const confirmed = await notify.confirm('这将删除现有索引并重新构建。', {
      title: '重新索引整个知识库',
      source: 'knowledge',
      danger: true
    })

    if (!confirmed) return

    indexStore.setKBReindexing(kbId, true)
    setReindexProgress({ current: 0, total: linkedFiles.length, currentFile: '' })

    indexStore.setFilesIndexing(
      kbId,
      linkedFiles.map((f) => ({ fileId: f.id, fileName: f.name }))
    )

    indexStore.startRefresh()

    for (const file of linkedFiles) {
      indexStore.markIndexCallStarted(kbId, file.id)
    }

    try {
      const fileIds = linkedFiles.map((file) => file.id)
      const result = await window.api.knowledge.reindex(kbId, fileIds)

      if (result.success) {
        notify.success('重新索引完成', `成功索引 ${result.data?.indexedCount || 0} 个文件`, {
          source: 'knowledge'
        })
        await onKnowledgeBaseNeedUpdate?.()
      } else {
        const failedCount = result.data?.failedFiles?.length || 0
        if (failedCount > 0) {
          const errorDetails =
            result.data?.failedErrors?.join('\n') || result.data?.failedFiles.join('\n')
          notify.warning('重新索引完成', `有 ${failedCount} 个文件失败：\n${errorDetails}`, {
            source: 'knowledge',
            sticky: true
          })
        } else {
          notify.error('重新索引失败', result.error || '未知错误', { source: 'knowledge' })
        }
      }
    } catch (error) {
      notify.error('重新索引失败', error instanceof Error ? error.message : String(error), {
        source: 'knowledge'
      })
    } finally {
      indexStore.setKBReindexing(kbId, false)
      setReindexProgress({ current: 0, total: 0, currentFile: '' })
      for (const file of linkedFiles) {
        indexStore.markIndexCallFinished(kbId, file.id)
      }
      await onStatsNeedUpdate()
    }
  }, [kbId, linkedFiles, notify, indexStore, onStatsNeedUpdate, onKnowledgeBaseNeedUpdate])

  return {
    reindexProgress,
    reindexing,
    handleReindex
  }
}
