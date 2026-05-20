import { useState, useCallback, useEffect, useRef } from 'react'
import type { KnowledgeSearchHit } from '@renderer/types'

export function useKnowledgeSearch(kbId: string | undefined) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KnowledgeSearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchPerformed, setSearchPerformed] = useState(false)

  const prevKbIdRef = useRef(kbId)

  useEffect(() => {
    if (prevKbIdRef.current !== kbId) {
      prevKbIdRef.current = kbId
      setSearchQuery('')
      setSearchResults([])
      setSearchPerformed(false)
    }
  }, [kbId])

  const handleSearch = useCallback(async () => {
    if (!kbId || !searchQuery.trim()) return

    setSearching(true)
    setSearchPerformed(false)

    try {
      const result = await window.api.knowledge.search(kbId, searchQuery.trim(), 5)
      setSearchPerformed(true)
      if (result.success && result.data?.results) {
        setSearchResults(result.data.results)
      } else {
        setSearchResults([])
        if (result.error) {
          window.api.logger.error('[KnowledgeSearch] 搜索失败', { error: result.error })
        }
      }
    } catch (error) {
      window.api.logger.error('[KnowledgeSearch] 搜索失败', {
        error: error instanceof Error ? error.message : String(error)
      })
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }, [kbId, searchQuery])

  const closeSearchResults = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
    setSearchPerformed(false)
  }, [])

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    searching,
    searchPerformed,
    handleSearch,
    closeSearchResults
  }
}
