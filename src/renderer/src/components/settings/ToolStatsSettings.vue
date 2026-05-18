<script setup lang="ts">
import { useToolStats } from '@renderer/composables/useToolStats'
import type { TimeRangeKey, CategoryFilter } from '@renderer/composables/useToolStats'
import styles from './ToolStatsSettings.module.css'

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
  <div :class="['sm-settings-page', styles['tool-stats-settings']]">
    <header class="sm-settings-page__header">
      <h2 class="sm-settings-page__title">工具调用统计</h2>
      <p class="sm-settings-page__description">查看工具调用量、成功率和耗时分布。</p>
    </header>

    <section class="sm-settings-page__section">
      <div :class="styles['tool-stats-toolbar']">
        <div :class="styles['tool-stats-toolbar__filters']">
          <div :class="styles['tool-stats-btn-group']">
            <button
              :class="{ [styles['is-active']]: timeRange === 'today' }"
              @click="setTimeRange('today')"
            >
              今天
            </button>
            <button
              :class="{ [styles['is-active']]: timeRange === '7d' }"
              @click="setTimeRange('7d')"
            >
              近 7 天
            </button>
            <button
              :class="{ [styles['is-active']]: timeRange === '30d' }"
              @click="setTimeRange('30d')"
            >
              近 30 天
            </button>
          </div>

          <div :class="styles['tool-stats-btn-group']">
            <button
              :class="{ [styles['is-active']]: categoryFilter === 'all' }"
              @click="setCategory('all')"
            >
              全部
            </button>
            <button
              :class="{ [styles['is-active']]: categoryFilter === 'lab' }"
              @click="setCategory('lab')"
            >
              实验室
            </button>
            <button
              :class="{ [styles['is-active']]: categoryFilter === 'knowledge' }"
              @click="setCategory('knowledge')"
            >
              知识库
            </button>
            <button
              :class="{ [styles['is-active']]: categoryFilter === 'mcp' }"
              @click="setCategory('mcp')"
            >
              MCP
            </button>
          </div>
        </div>

        <button class="sm-button sm-button--danger" @click="handleClearStats">清除统计</button>
      </div>
    </section>

    <section class="sm-settings-page__section">
      <div :class="styles['tool-stats-metrics']">
        <div :class="styles['tool-stats-metric']">
          <span :class="styles['tool-stats-metric__label']">总调用</span>
          <span :class="styles['tool-stats-metric__value']">{{
            formatNumber(overviewMetrics.totalCalls)
          }}</span>
          <span :class="styles['tool-stats-metric__unit']">次</span>
        </div>
        <div :class="styles['tool-stats-metric']">
          <span :class="styles['tool-stats-metric__label']">成功率</span>
          <span :class="styles['tool-stats-metric__value']"
            >{{ (overviewMetrics.successRate * 100).toFixed(1) }}%</span
          >
        </div>
        <div :class="styles['tool-stats-metric']">
          <span :class="styles['tool-stats-metric__label']">平均耗时</span>
          <span :class="styles['tool-stats-metric__value']">{{
            formatDuration(overviewMetrics.avgDurationMs)
          }}</span>
        </div>
        <div :class="styles['tool-stats-metric']">
          <span :class="styles['tool-stats-metric__label']">P95 耗时</span>
          <span :class="styles['tool-stats-metric__value']">{{
            formatDuration(overviewMetrics.p95DurationMs)
          }}</span>
        </div>
      </div>
    </section>

    <section class="sm-settings-page__section">
      <div :class="styles['tool-stats-sort-bar']">
        <span>排序：</span>
        <button
          :class="{ [styles['is-active']]: sortKey === 'totalCalls' }"
          @click="toggleSort('totalCalls')"
        >
          调用次数
        </button>
        <button
          :class="{ [styles['is-active']]: sortKey === 'successRate' }"
          @click="toggleSort('successRate')"
        >
          成功率
        </button>
        <button
          :class="{ [styles['is-active']]: sortKey === 'avgDurationMs' }"
          @click="toggleSort('avgDurationMs')"
        >
          耗时
        </button>
      </div>

      <div v-if="loading" class="sm-settings-loading">加载中...</div>

      <div v-else-if="sortedStats.length === 0" class="sm-settings-empty">
        暂无工具调用统计数据。开始使用聊天功能后，统计数据将自动记录。
      </div>

      <div v-else :class="styles['tool-stats-table']">
        <div :class="styles['tool-stats-table__header']">
          <span>工具名称</span>
          <span>调用次数</span>
          <span>成功率</span>
          <span>平均耗时</span>
        </div>

        <template v-for="tool in sortedStats" :key="tool.toolName">
          <div :class="styles['tool-stats-table__row']" @click="toggleExpand(tool.toolName)">
            <span :class="styles['tool-stats-table__name']">{{ tool.toolName }}</span>
            <span>{{ formatNumber(tool.totalCalls) }}</span>
            <span :class="{ [styles['tool-stats-table--danger']]: tool.successRate < 0.8 }">
              {{ (tool.successRate * 100).toFixed(1) }}%
            </span>
            <span>{{ formatDuration(tool.avgDurationMs) }}</span>
          </div>

          <div
            v-if="expandedTool === tool.toolName && toolDetail"
            :class="styles['tool-stats-table__detail']"
          >
            <div :class="styles['tool-stats-detail-grid']">
              <div :class="styles['tool-stats-detail-item']">
                <span :class="styles['tool-stats-detail-label']">来源服务器</span>
                <span :class="styles['tool-stats-detail-value']">{{ toolDetail.serverName }}</span>
              </div>
              <div :class="styles['tool-stats-detail-item']">
                <span :class="styles['tool-stats-detail-label']">P50 耗时</span>
                <span :class="styles['tool-stats-detail-value']">{{
                  formatDuration(toolDetail.p50DurationMs)
                }}</span>
              </div>
              <div :class="styles['tool-stats-detail-item']">
                <span :class="styles['tool-stats-detail-label']">P95 耗时</span>
                <span :class="styles['tool-stats-detail-value']">{{
                  formatDuration(toolDetail.p95DurationMs)
                }}</span>
              </div>
              <div :class="styles['tool-stats-detail-item']">
                <span :class="styles['tool-stats-detail-label']">错误次数</span>
                <span :class="styles['tool-stats-detail-value']">{{ toolDetail.errorCount }}</span>
              </div>
              <div :class="styles['tool-stats-detail-item']">
                <span :class="styles['tool-stats-detail-label']">最后调用</span>
                <span :class="styles['tool-stats-detail-value']">{{
                  formatTime(toolDetail.lastCalledAt)
                }}</span>
              </div>
            </div>

            <div v-if="toolDetail.topErrors?.length" :class="styles['tool-stats-errors']">
              <span :class="styles['tool-stats-errors-title']">高频错误：</span>
              <div
                v-for="(err, idx) in toolDetail.topErrors"
                :key="idx"
                :class="styles['tool-stats-error-item']"
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
