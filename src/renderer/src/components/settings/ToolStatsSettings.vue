<script setup lang="ts">
import { useToolStats } from '@renderer/composables/useToolStats'
import type { TimeRangeKey, CategoryFilter } from '@renderer/composables/useToolStats'

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
  toggleSort
} = useToolStats()

function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

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

function handleClearStats(): void {
  if (window.confirm('确定要清除所有工具调用统计数据吗？此操作不可撤销。')) {
    clearStats()
  }
}

function setTimeRange(range: TimeRangeKey): void {
  timeRange.value = range
}

function setCategory(category: CategoryFilter): void {
  categoryFilter.value = category
}
</script>

<template>
  <div class="sm-settings-page tool-stats-settings">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">工具调用统计</h2>
      <p class="sm-settings-page__description">查看工具调用量、成功率和耗时分布。</p>
    </header>

    <section class="sm-settings-page__section">
      <div class="tool-stats-toolbar">
        <div class="tool-stats-toolbar__filters">
          <div class="tool-stats-btn-group">
            <button :class="{ 'is-active': timeRange === 'today' }" @click="setTimeRange('today')">
              今天
            </button>
            <button :class="{ 'is-active': timeRange === '7d' }" @click="setTimeRange('7d')">
              近 7 天
            </button>
            <button :class="{ 'is-active': timeRange === '30d' }" @click="setTimeRange('30d')">
              近 30 天
            </button>
          </div>

          <div class="tool-stats-btn-group">
            <button :class="{ 'is-active': categoryFilter === 'all' }" @click="setCategory('all')">
              全部
            </button>
            <button :class="{ 'is-active': categoryFilter === 'lab' }" @click="setCategory('lab')">
              实验室
            </button>
            <button
              :class="{ 'is-active': categoryFilter === 'knowledge' }"
              @click="setCategory('knowledge')"
            >
              知识库
            </button>
            <button :class="{ 'is-active': categoryFilter === 'mcp' }" @click="setCategory('mcp')">
              MCP
            </button>
            <button
              :class="{ 'is-active': categoryFilter === 'skill' }"
              @click="setCategory('skill')"
            >
              Skill
            </button>
          </div>
        </div>

        <button class="sm-button sm-button--danger" @click="handleClearStats">清除统计</button>
      </div>
    </section>

    <section class="sm-settings-page__section">
      <div class="tool-stats-metrics">
        <div class="tool-stats-metric">
          <span class="tool-stats-metric__label">总调用</span>
          <span class="tool-stats-metric__value">{{
            formatNumber(overviewMetrics.totalCalls)
          }}</span>
          <span class="tool-stats-metric__unit">次</span>
        </div>
        <div class="tool-stats-metric">
          <span class="tool-stats-metric__label">成功率</span>
          <span class="tool-stats-metric__value"
            >{{ (overviewMetrics.successRate * 100).toFixed(1) }}%</span
          >
        </div>
        <div class="tool-stats-metric">
          <span class="tool-stats-metric__label">平均耗时</span>
          <span class="tool-stats-metric__value">{{
            formatDuration(overviewMetrics.avgDurationMs)
          }}</span>
        </div>
        <div class="tool-stats-metric">
          <span class="tool-stats-metric__label">P95 耗时</span>
          <span class="tool-stats-metric__value">{{
            formatDuration(overviewMetrics.p95DurationMs)
          }}</span>
        </div>
      </div>
    </section>

    <section class="sm-settings-page__section">
      <div class="tool-stats-sort-bar">
        <span>排序：</span>
        <button
          :class="{ 'is-active': sortKey === 'totalCalls' }"
          @click="toggleSort('totalCalls')"
        >
          调用次数
        </button>
        <button
          :class="{ 'is-active': sortKey === 'successRate' }"
          @click="toggleSort('successRate')"
        >
          成功率
        </button>
        <button
          :class="{ 'is-active': sortKey === 'avgDurationMs' }"
          @click="toggleSort('avgDurationMs')"
        >
          耗时
        </button>
      </div>

      <div v-if="loading" class="sm-settings-loading">加载中...</div>

      <div v-else-if="sortedStats.length === 0" class="sm-settings-empty">
        暂无工具调用统计数据。开始使用聊天功能后，统计数据将自动记录。
      </div>

      <div v-else class="tool-stats-table">
        <div class="tool-stats-table__header">
          <span>工具名称</span>
          <span>调用次数</span>
          <span>成功率</span>
          <span>平均耗时</span>
        </div>

        <template v-for="tool in sortedStats" :key="tool.toolName">
          <div class="tool-stats-table__row" @click="toggleExpand(tool.toolName)">
            <span class="tool-stats-table__name">{{ tool.toolName }}</span>
            <span>{{ formatNumber(tool.totalCalls) }}</span>
            <span :class="{ 'tool-stats-table--danger': tool.successRate < 0.8 }">
              {{ (tool.successRate * 100).toFixed(1) }}%
            </span>
            <span>{{ formatDuration(tool.avgDurationMs) }}</span>
          </div>

          <div v-if="expandedTool === tool.toolName && toolDetail" class="tool-stats-table__detail">
            <div class="tool-stats-detail-grid">
              <div class="tool-stats-detail-item">
                <span class="tool-stats-detail-label">来源服务器</span>
                <span class="tool-stats-detail-value">{{ toolDetail.serverName }}</span>
              </div>
              <div class="tool-stats-detail-item">
                <span class="tool-stats-detail-label">P50 耗时</span>
                <span class="tool-stats-detail-value">{{
                  formatDuration(toolDetail.p50DurationMs)
                }}</span>
              </div>
              <div class="tool-stats-detail-item">
                <span class="tool-stats-detail-label">P95 耗时</span>
                <span class="tool-stats-detail-value">{{
                  formatDuration(toolDetail.p95DurationMs)
                }}</span>
              </div>
              <div class="tool-stats-detail-item">
                <span class="tool-stats-detail-label">错误次数</span>
                <span class="tool-stats-detail-value">{{ toolDetail.errorCount }}</span>
              </div>
              <div class="tool-stats-detail-item">
                <span class="tool-stats-detail-label">最后调用</span>
                <span class="tool-stats-detail-value">{{
                  formatTime(toolDetail.lastCalledAt)
                }}</span>
              </div>
            </div>

            <div v-if="toolDetail.topErrors?.length" class="tool-stats-errors">
              <span class="tool-stats-errors-title">高频错误：</span>
              <div
                v-for="(err, idx) in toolDetail.topErrors"
                :key="idx"
                class="tool-stats-error-item"
              >
                {{ err.message }} ({{ err.count }}次)
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tool-stats-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.tool-stats-toolbar__filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.tool-stats-btn-group {
  display: inline-flex;
  gap: 0;
}

.tool-stats-btn-group button {
  padding: 4px 12px;
  font-size: 13px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition:
    background var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.tool-stats-btn-group button:first-child {
  border-radius: var(--sm-radius-sm) 0 0 var(--sm-radius-sm);
}

.tool-stats-btn-group button:last-child {
  border-radius: 0 var(--sm-radius-sm) var(--sm-radius-sm) 0;
}

.tool-stats-btn-group button:not(:first-child):not(:last-child) {
  border-radius: 0;
}

.tool-stats-btn-group button:hover {
  background: var(--sm-color-surface-1);
}

.tool-stats-btn-group button.is-active {
  background: var(--sm-color-surface-selected);
  border-color: var(--sm-color-border-selected);
  color: var(--sm-color-text-primary);
}

.sm-button--danger {
  padding: 6px 16px;
  font-size: 13px;
  border: none;
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-status-danger);
  color: white;
  cursor: pointer;
  transition: opacity var(--sm-transition-fast);
}

.sm-button--danger:hover {
  opacity: 0.85;
}

.tool-stats-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

@media (max-width: 640px) {
  .tool-stats-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}

.tool-stats-metric {
  background: var(--sm-color-surface-1);
  border-radius: var(--sm-radius-md);
  padding: var(--sm-space-4);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-stats-metric__label {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.tool-stats-metric__value {
  font-size: 24px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.tool-stats-metric__unit {
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.tool-stats-sort-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}

.tool-stats-sort-bar button {
  padding: 4px 10px;
  font-size: 13px;
  border: none;
  border-radius: var(--sm-radius-sm);
  background: transparent;
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition: color var(--sm-transition-fast);
}

.tool-stats-sort-bar button:hover {
  color: var(--sm-color-text-primary);
}

.tool-stats-sort-bar button.is-active {
  color: var(--sm-color-accent);
  font-weight: 600;
}

.sm-settings-loading,
.sm-settings-empty {
  padding: var(--sm-space-5);
  text-align: center;
  color: var(--sm-color-text-tertiary);
  font-size: 14px;
}

.tool-stats-table {
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  overflow: hidden;
}

.tool-stats-table__header {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 12px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
  background: var(--sm-color-surface-2);
  border-bottom: 1px solid var(--sm-color-border-default);
}

.tool-stats-table__row {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 12px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
  border-bottom: 1px solid var(--sm-color-border-subtle);
  cursor: pointer;
  transition: background var(--sm-transition-fast);
}

.tool-stats-table__row:hover {
  background: var(--sm-color-surface-1);
}

.tool-stats-table__row:last-child {
  border-bottom: none;
}

.tool-stats-table__name {
  color: var(--sm-color-text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-stats-table--danger {
  color: var(--sm-color-status-danger);
}

.tool-stats-table__detail {
  padding: 12px 16px;
  background: var(--sm-color-surface-1);
  margin: 4px 12px;
  border-radius: var(--sm-radius-sm);
  font-size: 13px;
  color: var(--sm-color-text-secondary);
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tool-stats-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 16px;
}

@media (max-width: 480px) {
  .tool-stats-detail-grid {
    grid-template-columns: 1fr;
  }
}

.tool-stats-detail-item {
  display: flex;
  gap: 8px;
}

.tool-stats-detail-label {
  color: var(--sm-color-text-tertiary);
  min-width: 80px;
}

.tool-stats-detail-value {
  color: var(--sm-color-text-secondary);
}

.tool-stats-errors {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--sm-color-border-subtle);
}

.tool-stats-errors-title {
  display: block;
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
  margin-bottom: 8px;
}

.tool-stats-error-item {
  padding: 4px 0;
  font-size: 12px;
  color: var(--sm-color-status-danger);
  font-family: ui-monospace, 'SF Mono', 'Monaco', 'Andale Mono', monospace;
}
</style>
