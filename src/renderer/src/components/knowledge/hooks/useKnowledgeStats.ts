import { useState, useEffect, useCallback } from 'react'
import type { KnowledgeBaseStats } from '@renderer/types'

export function useKnowledgeStats(kbId: string | undefined) {
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null)
  const [loading, setLoading] = useState(false)

  const loadStats = useCallback(async () => {
    if (!kbId) return
    setLoading(true)
    try {
      const res = await window.api.knowledge.getStats(kbId)
      if (res.success && res.data) setStats(res.data)
    } catch (e) {
      window.api.logger.error('[KnowledgeMain] 加载统计失败', {
        error: e instanceof Error ? e.message : String(e),
        kbId
      })
    } finally {
      setLoading(false)
    }
  }, [kbId])

  useEffect(() => {
    if (kbId) {
      loadStats()
    } else {
      setStats(null)
    }
  }, [kbId, loadStats])

  return { stats, loading, loadStats }
}
