/**
 * 工具统计 React Hook
 *
 * 从 Vue composable useToolStats.ts 翻译而来，保持完全相同的逻辑和状态结构。
 * 消费 toolStatsCore.ts 的 buildTimeRange / computeOverviewMetrics 纯函数。
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { ToolStatsSummary, ToolStatsCategory, TimeRange } from '@shared/types/tool-stats'
import { buildTimeRange, computeOverviewMetrics } from '@renderer/composables/toolStatsCore'

/** 时间范围快捷键 */
export type TimeRangeKey = 'today' | '7d' | '30d'

/** 类别过滤器 */
export type CategoryFilter = 'all' | ToolStatsCategory

/** 排序字段 */
export type SortKey = 'totalCalls' | 'successRate' | 'avgDurationMs'

/** 排序方向 */
export type SortOrder = 'asc' | 'desc'

/** 概览指标 */
export interface OverviewMetrics {
  totalCalls: number
  successRate: number
  avgDurationMs: number
  p95DurationMs: number
}

export function useToolStats() {
  // 状态（对应 Vue ref）
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('7d')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('totalCalls')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [expandedTool, setExpandedTool] = useState<string | null>(null)
  const [toolDetail, setToolDetail] = useState<ToolStatsSummary | null>(null)
  const [stats, setStats] = useState<ToolStatsSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 用于 fetchToolDetail 中的最新 timeRange 引用
  const timeRangeRef = useRef(timeRange)
  timeRangeRef.current = timeRange

  /**
   * 获取统计数据
   */
  const fetchStats = useCallback(
    async (range?: TimeRangeKey, category?: CategoryFilter) => {
      setLoading(true)
      setError(null)

      try {
        const key = range ?? timeRangeRef.current
        const cat = category ?? categoryFilter
        const timeRangeObj: TimeRange = buildTimeRange(key)

        let data: ToolStatsSummary[]
        if (cat === 'all') {
          data = await window.api.toolStats.getAll(timeRangeObj)
        } else {
          data = await window.api.toolStats.getByCategory(cat, timeRangeObj)
        }

        setStats(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [categoryFilter]
  )

  /**
   * 获取单个工具详情
   */
  const fetchToolDetail = useCallback(async (toolName: string) => {
    try {
      const range: TimeRange = buildTimeRange(timeRangeRef.current)
      const detail = await window.api.toolStats.getByTool(toolName, range)
      setToolDetail(detail)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  /**
   * 清空统计数据
   */
  const clearStats = useCallback(async () => {
    try {
      await window.api.toolStats.clear()
      setStats([])
      setExpandedTool(null)
      setToolDetail(null)
      await fetchStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [fetchStats])

  /**
   * 切换展开状态
   */
  const toggleExpand = useCallback(
    (toolName: string) => {
      if (expandedTool === toolName) {
        setExpandedTool(null)
        setToolDetail(null)
      } else {
        setExpandedTool(toolName)
        void fetchToolDetail(toolName)
      }
    },
    [expandedTool, fetchToolDetail]
  )

  /**
   * 切换排序
   */
  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        // 同字段 → 翻转排序方向
        setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
      } else {
        // 新字段，默认降序
        setSortOrder('desc')
      }
      return key
    })
  }, [])

  /**
   * 概览指标（computed → useMemo）
   */
  const overviewMetrics = useMemo<OverviewMetrics>(() => computeOverviewMetrics(stats), [stats])

  /**
   * 排序后的统计数据（computed → useMemo）
   */
  const sortedStats = useMemo<ToolStatsSummary[]>(() => {
    const sorted = [...stats]
    const key = sortKey
    const order = sortOrder === 'asc' ? 1 : -1

    sorted.sort((a, b) => {
      const aVal = a[key]
      const bVal = b[key]
      return (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) * order
    })

    return sorted
  }, [stats, sortKey, sortOrder])

  // 监听时间范围和类别变化，自动重新获取数据（对应 Vue watch + onMounted）
  useEffect(() => {
    void fetchStats(timeRange, categoryFilter)
  }, [timeRange, categoryFilter, fetchStats])

  return {
    // 状态
    timeRange,
    categoryFilter,
    sortKey,
    sortOrder,
    expandedTool,
    toolDetail,
    stats,
    loading,
    error,
    // 计算属性
    overviewMetrics,
    sortedStats,
    // 方法
    fetchStats,
    fetchToolDetail,
    clearStats,
    toggleExpand,
    toggleSort,
    // setter
    setTimeRange,
    setCategoryFilter
  }
}
