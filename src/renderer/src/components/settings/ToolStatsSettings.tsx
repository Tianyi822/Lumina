import { useCallback } from 'react'
import { useToolStats } from './hooks/useToolStats'
import type { TimeRangeKey, CategoryFilter } from './hooks/useToolStats'
import styles from './ToolStatsSettings.module.css'

/** 格式化数字为中文千分位字符串 */
function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}

/** 格式化毫秒为可读时长（ms 或 s） */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** 格式化日期为 MM-DD HH:mm 字符串 */
function formatTime(date: Date | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function ToolStatsSettings() {
  const {
    timeRange,
    categoryFilter,
    sortKey,
    expandedTool,
    toolDetail,
    sortedStats,
    loading,
    overviewMetrics,
    clearStats,
    toggleExpand,
    toggleSort,
    setTimeRange,
    setCategoryFilter
  } = useToolStats()

  const handleClearStats = useCallback(() => {
    if (window.confirm('确定要清除所有工具调用统计数据吗？此操作不可撤销。')) {
      void clearStats()
    }
  }, [clearStats])

  return (
    <div className={['sm-settings-page', styles['tool-stats-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">工具调用统计</h2>
        <p className="sm-settings-page__description">查看工具调用量、成功率和耗时分布。</p>
      </header>

      <section className="sm-settings-page__section">
        <div className={styles['tool-stats-toolbar']}>
          <div className={styles['tool-stats-toolbar__filters']}>
            <div className={styles['tool-stats-btn-group']}>
              <button
                className={timeRange === 'today' ? styles['is-active'] : undefined}
                onClick={() => setTimeRange('today' as TimeRangeKey)}
              >
                今天
              </button>
              <button
                className={timeRange === '7d' ? styles['is-active'] : undefined}
                onClick={() => setTimeRange('7d' as TimeRangeKey)}
              >
                近 7 天
              </button>
              <button
                className={timeRange === '30d' ? styles['is-active'] : undefined}
                onClick={() => setTimeRange('30d' as TimeRangeKey)}
              >
                近 30 天
              </button>
            </div>

            <div className={styles['tool-stats-btn-group']}>
              <button
                className={categoryFilter === 'all' ? styles['is-active'] : undefined}
                onClick={() => setCategoryFilter('all' as CategoryFilter)}
              >
                全部
              </button>
              <button
                className={categoryFilter === 'lab' ? styles['is-active'] : undefined}
                onClick={() => setCategoryFilter('lab' as CategoryFilter)}
              >
                实验室
              </button>
              <button
                className={categoryFilter === 'knowledge' ? styles['is-active'] : undefined}
                onClick={() => setCategoryFilter('knowledge' as CategoryFilter)}
              >
                知识库
              </button>
              <button
                className={categoryFilter === 'mcp' ? styles['is-active'] : undefined}
                onClick={() => setCategoryFilter('mcp' as CategoryFilter)}
              >
                MCP
              </button>
            </div>
          </div>

          <button className="sm-button sm-button--danger" onClick={handleClearStats}>
            清除统计
          </button>
        </div>
      </section>

      <section className="sm-settings-page__section">
        <div className={styles['tool-stats-metrics']}>
          <div className={styles['tool-stats-metric']}>
            <span className={styles['tool-stats-metric__label']}>总调用</span>
            <span className={styles['tool-stats-metric__value']}>
              {formatNumber(overviewMetrics.totalCalls)}
            </span>
            <span className={styles['tool-stats-metric__unit']}>次</span>
          </div>
          <div className={styles['tool-stats-metric']}>
            <span className={styles['tool-stats-metric__label']}>成功率</span>
            <span className={styles['tool-stats-metric__value']}>
              {(overviewMetrics.successRate * 100).toFixed(1)}%
            </span>
          </div>
          <div className={styles['tool-stats-metric']}>
            <span className={styles['tool-stats-metric__label']}>平均耗时</span>
            <span className={styles['tool-stats-metric__value']}>
              {formatDuration(overviewMetrics.avgDurationMs)}
            </span>
          </div>
          <div className={styles['tool-stats-metric']}>
            <span className={styles['tool-stats-metric__label']}>P95 耗时</span>
            <span className={styles['tool-stats-metric__value']}>
              {formatDuration(overviewMetrics.p95DurationMs)}
            </span>
          </div>
        </div>
      </section>

      <section className="sm-settings-page__section">
        <div className={styles['tool-stats-sort-bar']}>
          <span>排序：</span>
          <button
            className={sortKey === 'totalCalls' ? styles['is-active'] : undefined}
            onClick={() => toggleSort('totalCalls')}
          >
            调用次数
          </button>
          <button
            className={sortKey === 'successRate' ? styles['is-active'] : undefined}
            onClick={() => toggleSort('successRate')}
          >
            成功率
          </button>
          <button
            className={sortKey === 'avgDurationMs' ? styles['is-active'] : undefined}
            onClick={() => toggleSort('avgDurationMs')}
          >
            耗时
          </button>
        </div>

        {loading && <div className="sm-settings-loading">加载中...</div>}

        {!loading && sortedStats.length === 0 && (
          <div className="sm-settings-empty">
            暂无工具调用统计数据。开始使用聊天功能后，统计数据将自动记录。
          </div>
        )}

        {!loading && sortedStats.length > 0 && (
          <div className={styles['tool-stats-table']}>
            <div className={styles['tool-stats-table__header']}>
              <span>工具名称</span>
              <span>调用次数</span>
              <span>成功率</span>
              <span>平均耗时</span>
            </div>

            {sortedStats.map((tool) => (
              <div key={tool.toolName}>
                <div
                  className={styles['tool-stats-table__row']}
                  onClick={() => toggleExpand(tool.toolName)}
                >
                  <span className={styles['tool-stats-table__name']}>{tool.toolName}</span>
                  <span>{formatNumber(tool.totalCalls)}</span>
                  <span
                    className={
                      tool.successRate < 0.8 ? styles['tool-stats-table--danger'] : undefined
                    }
                  >
                    {(tool.successRate * 100).toFixed(1)}%
                  </span>
                  <span>{formatDuration(tool.avgDurationMs)}</span>
                </div>

                {expandedTool === tool.toolName && toolDetail && (
                  <div className={styles['tool-stats-table__detail']}>
                    <div className={styles['tool-stats-detail-grid']}>
                      <div className={styles['tool-stats-detail-item']}>
                        <span className={styles['tool-stats-detail-label']}>来源服务器</span>
                        <span className={styles['tool-stats-detail-value']}>
                          {toolDetail.serverName}
                        </span>
                      </div>
                      <div className={styles['tool-stats-detail-item']}>
                        <span className={styles['tool-stats-detail-label']}>P50 耗时</span>
                        <span className={styles['tool-stats-detail-value']}>
                          {formatDuration(toolDetail.p50DurationMs)}
                        </span>
                      </div>
                      <div className={styles['tool-stats-detail-item']}>
                        <span className={styles['tool-stats-detail-label']}>P95 耗时</span>
                        <span className={styles['tool-stats-detail-value']}>
                          {formatDuration(toolDetail.p95DurationMs)}
                        </span>
                      </div>
                      <div className={styles['tool-stats-detail-item']}>
                        <span className={styles['tool-stats-detail-label']}>错误次数</span>
                        <span className={styles['tool-stats-detail-value']}>
                          {toolDetail.errorCount}
                        </span>
                      </div>
                      <div className={styles['tool-stats-detail-item']}>
                        <span className={styles['tool-stats-detail-label']}>最后调用</span>
                        <span className={styles['tool-stats-detail-value']}>
                          {formatTime(toolDetail.lastCalledAt)}
                        </span>
                      </div>
                    </div>

                    {toolDetail.topErrors && toolDetail.topErrors.length > 0 && (
                      <div className={styles['tool-stats-errors']}>
                        <span className={styles['tool-stats-errors-title']}>高频错误：</span>
                        {toolDetail.topErrors.map((err, idx) => (
                          <div key={idx} className={styles['tool-stats-error-item']}>
                            {err.message} ({err.count}次)
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
