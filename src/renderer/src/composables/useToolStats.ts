/**
 * 工具统计 composable
 * 提供工具调用统计数据的查询、过滤和聚合功能
 */

import { ref, computed, watch, onMounted, type Ref } from 'vue'
import type { ToolStatsSummary, ToolStatsCategory, TimeRange } from '@shared/types/tool-stats'

/** 时间范围快捷键 */
export type TimeRangeKey = 'today' | '7d' | '30d'

/** 类别过滤器 */
export type CategoryFilter = 'all' | ToolStatsCategory

/** 排序字段 */
export type SortKey = 'totalCalls' | 'successRate' | 'avgDurationMs'

/** 排序方向 */
export type SortOrder = 'asc' | 'desc'

/** 概览指标 */
interface OverviewMetrics {
  totalCalls: number
  successRate: number
  avgDurationMs: number
  p95DurationMs: number
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useToolStats() {
  // 状态
  const timeRange: Ref<TimeRangeKey> = ref('7d')
  const categoryFilter: Ref<CategoryFilter> = ref('all')
  const sortKey: Ref<SortKey> = ref('totalCalls')
  const sortOrder: Ref<SortOrder> = ref('desc')
  const expandedTool: Ref<string | null> = ref(null)
  const toolDetail: Ref<ToolStatsSummary | null> = ref(null)
  const stats: Ref<ToolStatsSummary[]> = ref([])
  const loading: Ref<boolean> = ref(false)
  const error: Ref<string | null> = ref(null)

  /**
   * 构建时间范围
   */
  function buildTimeRange(key: TimeRangeKey): TimeRange {
    const now = new Date()
    const from = new Date()

    switch (key) {
      case 'today':
        // 今天 00:00:00
        from.setHours(0, 0, 0, 0)
        break
      case '7d':
        // 7 天前
        from.setDate(now.getDate() - 7)
        break
      case '30d':
        // 30 天前
        from.setDate(now.getDate() - 30)
        break
    }

    return { from, to: now }
  }

  /**
   * 获取统计数据
   */
  async function fetchStats(): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const range = buildTimeRange(timeRange.value)

      let data: ToolStatsSummary[]
      if (categoryFilter.value === 'all') {
        data = await window.api.toolStats.getAll(range)
      } else {
        data = await window.api.toolStats.getByCategory(categoryFilter.value, range)
      }

      stats.value = data
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取单个工具详情
   */
  async function fetchToolDetail(toolName: string): Promise<void> {
    try {
      const range = buildTimeRange(timeRange.value)
      const detail = await window.api.toolStats.getByTool(toolName, range)
      toolDetail.value = detail
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  /**
   * 清空统计数据
   */
  async function clearStats(): Promise<void> {
    try {
      await window.api.toolStats.clear()
      stats.value = []
      expandedTool.value = null
      toolDetail.value = null
      await fetchStats()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  /**
   * 切换展开状态
   */
  function toggleExpand(toolName: string): void {
    if (expandedTool.value === toolName) {
      expandedTool.value = null
      toolDetail.value = null
    } else {
      expandedTool.value = toolName
      fetchToolDetail(toolName)
    }
  }

  /**
   * 切换排序
   */
  function toggleSort(key: SortKey): void {
    if (sortKey.value === key) {
      // 翻转排序方向
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      // 新字段，默认降序
      sortKey.value = key
      sortOrder.value = 'desc'
    }
  }

  /**
   * 概览指标（计算属性）
   */
  const overviewMetrics = computed<OverviewMetrics>(() => {
    if (stats.value.length === 0) {
      return { totalCalls: 0, successRate: 0, avgDurationMs: 0, p95DurationMs: 0 }
    }

    let totalCalls = 0
    let weightedSuccessRate = 0
    let weightedDuration = 0
    let maxP95 = 0

    for (const item of stats.value) {
      totalCalls += item.totalCalls
      weightedSuccessRate += item.successRate * item.totalCalls
      weightedDuration += item.avgDurationMs * item.totalCalls
      if (item.p95DurationMs > maxP95) {
        maxP95 = item.p95DurationMs
      }
    }

    return {
      totalCalls,
      successRate: totalCalls > 0 ? weightedSuccessRate / totalCalls : 0,
      avgDurationMs: totalCalls > 0 ? weightedDuration / totalCalls : 0,
      p95DurationMs: maxP95
    }
  })

  /**
   * 排序后的统计数据（计算属性）
   */
  const sortedStats = computed<ToolStatsSummary[]>(() => {
    const sorted = [...stats.value]
    const key = sortKey.value
    const order = sortOrder.value === 'asc' ? 1 : -1

    sorted.sort((a, b) => {
      const aVal = a[key]
      const bVal = b[key]
      return (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) * order
    })

    return sorted
  })

  // 监听时间范围和类别变化，自动重新获取数据
  watch([timeRange, categoryFilter], () => {
    fetchStats()
  })

  // 组件挂载时获取数据
  onMounted(() => {
    fetchStats()
  })

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
    buildTimeRange,
    fetchStats,
    fetchToolDetail,
    clearStats,
    toggleExpand,
    toggleSort
  }
}
