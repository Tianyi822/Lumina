import { ref, computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useKnowledgeIndexStore } from '@renderer/stores'
import type { KnowledgeBase, FileItem } from '@renderer/types'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useReindex(
  currentKB: ComputedRef<KnowledgeBase | undefined>,
  linkedFiles: Ref<FileItem[]>,
  onStatsNeedUpdate: () => Promise<void>
) {
  const indexStore = useKnowledgeIndexStore()
  const reindexProgress = ref({ current: 0, total: 0, currentFile: '' })

  const reindexing = computed(() => {
    if (!currentKB.value) return false
    return indexStore.isKBReindexing(currentKB.value.id)
  })

  async function handleReindex(): Promise<void> {
    if (!currentKB.value) return

    if (linkedFiles.value.length === 0) {
      alert('没有文件需要索引')
      return
    }

    if (!confirm('确定要重新索引整个知识库吗？这将删除现有索引并重新构建。')) {
      return
    }

    const kbId = currentKB.value.id
    indexStore.setKBReindexing(kbId, true)
    reindexProgress.value = { current: 0, total: linkedFiles.value.length, currentFile: '' }

    indexStore.setFilesIndexing(
      kbId,
      linkedFiles.value.map((f) => ({ fileId: f.id, fileName: f.name }))
    )

    indexStore.startRefresh()

    try {
      const files = linkedFiles.value.map((f) => ({
        fileId: f.id,
        filePath: f.absolutePath,
        fileName: f.name
      }))

      const result = await window.api.knowledge.reindex(kbId, files)

      if (result.success) {
        alert(`重新索引完成！成功索引 ${result.data?.indexedCount || 0} 个文件`)
      } else {
        const failedCount = result.data?.failedFiles?.length || 0
        if (failedCount > 0) {
          const errorDetails =
            result.data?.failedErrors?.join('\n') || result.data?.failedFiles.join('\n')
          alert(`重新索引完成，但有 ${failedCount} 个文件失败：\n${errorDetails}`)
        } else {
          alert('重新索引失败: ' + (result.error || '未知错误'))
        }
      }
    } catch (error) {
      alert('重新索引失败: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      indexStore.setKBReindexing(kbId, false)
      reindexProgress.value = { current: 0, total: 0, currentFile: '' }
      await onStatsNeedUpdate()
    }
  }

  return {
    reindexProgress,
    reindexing,
    handleReindex
  }
}
