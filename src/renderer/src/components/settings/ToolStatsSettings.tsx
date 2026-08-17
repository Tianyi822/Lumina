import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()

  const handleClearStats = useCallback(() => {
    if (window.confirm(t('settings.toolStats.clearConfirm'))) {
      void clearStats()
    }
  }, [clearStats, t])

  return (
    <div className={['sm-settings-page', styles['tool-stats-settings']].join(' ')}>
      <header className="sm-settings-page__header">
        <h2 className="sm-settings-page__title">{t('settings.toolStats.title')}</h2>
        <p className="sm-settings-page__description">{t('settings.toolStats.description')}</p>
      </header>

      <section className="sm-settings-page__section">
        <div className={styles['tool-stats-toolbar']}>
          <div className={styles['tool-stats-toolbar__filters']}>
            <div className={styles['tool-stats-btn-group']}>
              <button
                className={timeRange === 'today' ? styles['is-active'] : undefined}
                onClick={() => setTimeRange('today' as TimeRangeKey)}
              >
                {t('settings.toolStats.rangeToday')}
              </button>
              <button
                className={timeRange === '7d' ? styles['is-active'] : undefined}
                onClick={() => setTimeRange('7d' as TimeRangeKey)}
              >
                {t('settings.toolStats.range7d')}
              </button>
              <button
                className={timeRange === '30d' ? styles['is-active'] : undefined}
                onClick={() => setTimeRange('30d' as TimeRangeKey)}
              >
                {t('settings.toolStats.range30d')}
              </button>
            </div>

            <div className={styles['tool-stats-btn-group']}>
              <button
                className={categoryFilter === 'all' ? styles['is-active'] : undefined}
                onClick={() => setCategoryFilter('all' as CategoryFilter)}
              >
                {t('settings.toolStats.filterAll')}
              </button>
              <button
                className={categoryFilter === 'knowledge' ? styles['is-active'] : undefined}
                onClick={() => setCategoryFilter('knowledge' as CategoryFilter)}
              >
                {t('settings.toolStats.filterKnowledge')}
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
            {t('settings.toolStats.clear')}
          </button>
        </div>
      </section>

      <section className="sm-settings-page__section">
        <div className={styles['tool-stats-metrics']}>
          <div className={styles['tool-stats-metric']}>
            <span className={styles['tool-stats-metric__label']}>
              {t('settings.toolStats.totalCalls')}
            </span>
            <span className={styles['tool-stats-metric__value']}>
              {formatNumber(overviewMetrics.totalCalls)}
            </span>
            <span className={styles['tool-stats-metric__unit']}>
              {t('settings.toolStats.callsUnit')}
            </span>
          </div>
          <div className={styles['tool-stats-metric']}>
            <span className={styles['tool-stats-metric__label']}>
              {t('settings.toolStats.successRate')}
            </span>
            <span className={styles['tool-stats-metric__value']}>
              {(overviewMetrics.successRate * 100).toFixed(1)}%
            </span>
          </div>
          <div className={styles['tool-stats-metric']}>
            <span className={styles['tool-stats-metric__label']}>
              {t('settings.toolStats.avgDuration')}
            </span>
            <span className={styles['tool-stats-metric__value']}>
              {formatDuration(overviewMetrics.avgDurationMs)}
            </span>
          </div>
          <div className={styles['tool-stats-metric']}>
            <span className={styles['tool-stats-metric__label']}>
              {t('settings.toolStats.p95Duration')}
            </span>
            <span className={styles['tool-stats-metric__value']}>
              {formatDuration(overviewMetrics.p95DurationMs)}
            </span>
          </div>
        </div>
      </section>

      <section className="sm-settings-page__section">
        <div className={styles['tool-stats-sort-bar']}>
          <span>{t('settings.toolStats.sortBy')}</span>
          <button
            className={sortKey === 'totalCalls' ? styles['is-active'] : undefined}
            onClick={() => toggleSort('totalCalls')}
          >
            {t('settings.toolStats.sortCalls')}
          </button>
          <button
            className={sortKey === 'successRate' ? styles['is-active'] : undefined}
            onClick={() => toggleSort('successRate')}
          >
            {t('settings.toolStats.successRate')}
          </button>
          <button
            className={sortKey === 'avgDurationMs' ? styles['is-active'] : undefined}
            onClick={() => toggleSort('avgDurationMs')}
          >
            {t('settings.toolStats.sortDuration')}
          </button>
        </div>

        {loading && <div className="sm-settings-loading">{t('common.loading')}</div>}

        {!loading && sortedStats.length === 0 && (
          <div className="sm-settings-empty">{t('settings.toolStats.empty')}</div>
        )}

        {!loading && sortedStats.length > 0 && (
          <div className={styles['tool-stats-table']}>
            <div className={styles['tool-stats-table__header']}>
              <span>{t('settings.toolStats.colName')}</span>
              <span>{t('settings.toolStats.colCalls')}</span>
              <span>{t('settings.toolStats.successRate')}</span>
              <span>{t('settings.toolStats.avgDuration')}</span>
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
                        <span className={styles['tool-stats-detail-label']}>
                          {t('settings.toolStats.serverName')}
                        </span>
                        <span className={styles['tool-stats-detail-value']}>
                          {toolDetail.serverName}
                        </span>
                      </div>
                      <div className={styles['tool-stats-detail-item']}>
                        <span className={styles['tool-stats-detail-label']}>
                          {t('settings.toolStats.p50Duration')}
                        </span>
                        <span className={styles['tool-stats-detail-value']}>
                          {formatDuration(toolDetail.p50DurationMs)}
                        </span>
                      </div>
                      <div className={styles['tool-stats-detail-item']}>
                        <span className={styles['tool-stats-detail-label']}>
                          {t('settings.toolStats.p95Duration')}
                        </span>
                        <span className={styles['tool-stats-detail-value']}>
                          {formatDuration(toolDetail.p95DurationMs)}
                        </span>
                      </div>
                      <div className={styles['tool-stats-detail-item']}>
                        <span className={styles['tool-stats-detail-label']}>
                          {t('settings.toolStats.errorCount')}
                        </span>
                        <span className={styles['tool-stats-detail-value']}>
                          {toolDetail.errorCount}
                        </span>
                      </div>
                      <div className={styles['tool-stats-detail-item']}>
                        <span className={styles['tool-stats-detail-label']}>
                          {t('settings.toolStats.lastCalled')}
                        </span>
                        <span className={styles['tool-stats-detail-value']}>
                          {formatTime(toolDetail.lastCalledAt)}
                        </span>
                      </div>
                    </div>

                    {toolDetail.topErrors && toolDetail.topErrors.length > 0 && (
                      <div className={styles['tool-stats-errors']}>
                        <span className={styles['tool-stats-errors-title']}>
                          {t('settings.toolStats.topErrors')}
                        </span>
                        {toolDetail.topErrors.map((err, idx) => (
                          <div key={idx} className={styles['tool-stats-error-item']}>
                            {err.message} (
                            {t('settings.toolStats.errorTimes', { count: err.count })})
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
