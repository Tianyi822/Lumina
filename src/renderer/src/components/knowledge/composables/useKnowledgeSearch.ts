import { ref, watch } from 'vue'
import type { ComputedRef } from 'vue'
import type { KnowledgeBase, KnowledgeSearchHit } from '@renderer/types'

export function useKnowledgeSearch(currentKB: ComputedRef<KnowledgeBase | undefined>) {
  const searchQuery = ref('')
  const searchResults = ref<KnowledgeSearchHit[]>([])
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
          window.api.logger.error('[KnowledgeSearch] 搜索失败', { error: result.error })
        }
      }
    } catch (error) {
      window.api.logger.error('[KnowledgeSearch] 搜索失败', {
        error: error instanceof Error ? error.message : String(error)
      })
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
