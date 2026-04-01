import { ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { KnowledgeBase } from '@renderer/types'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useKnowledgeSearch(currentKB: ComputedRef<KnowledgeBase | undefined>) {
  const searchQuery = ref('')
  const searchResults = ref<
    Array<{
      chunkId: number
      fileId: string
      fileName: string
      content: string
      chunkIndex: number
      totalChunks: number
      similarity: number
    }>
  >([])
  const searching = ref(false)
  const searchPerformed = ref(false)

  // 切换知识库时清空搜索结果
  watch(
    () => currentKB.value?.id,
    () => {
      searchQuery.value = ''
      searchResults.value = []
      searchPerformed.value = false
    }
  )

  async function handleSearch(): Promise<void> {
    if (!currentKB.value || !searchQuery.value.trim()) return

    searching.value = true
    searchPerformed.value = false

    try {
      const result = await window.api.knowledge.search(
        currentKB.value.id,
        searchQuery.value.trim(),
        5
      )

      searchPerformed.value = true
      if (result.success && result.data?.results) {
        searchResults.value = result.data.results
      } else {
        searchResults.value = []
        if (result.error) {
          console.error('搜索失败:', result.error)
        }
      }
    } catch (error) {
      console.error('搜索失败:', error)
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }

  function closeSearchResults(): void {
    searchQuery.value = ''
    searchResults.value = []
    searchPerformed.value = false
  }

  return {
    searchQuery,
    searchResults,
    searching,
    searchPerformed,
    handleSearch,
    closeSearchResults
  }
}
