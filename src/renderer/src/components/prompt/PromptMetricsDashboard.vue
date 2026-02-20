<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { PromptEffectivenessMetrics, MetricsTrendPoint, PromptVersion } from '@renderer/types'

// ==================== Props & Emits ====================
const emit = defineEmits<{
  (e: 'error', message: string): void
}>()

// ==================== State ====================
const currentMetrics = ref<PromptEffectivenessMetrics | null>(null)
const trendData = ref<MetricsTrendPoint[]>([])
const versions = ref<PromptVersion[]>([])
const loading = ref(false)

// 时间范围选择
const timeRange = ref<'7d' | '30d' | '90d'>('7d')
const selectedVersion = ref<string>('current')

// 版本对比数据
const compareMetrics = ref<PromptEffectivenessMetrics | null>(null)
const loadingCompare = ref(false)

// ==================== Computed ====================
const timeRangeLabel = computed(() => {
  const labels: Record<string, string> = {
    '7d': '最近7天',
    '30d': '最近30天',
    '90d': '最近90天'
  }
  return labels[timeRange.value]
})

// 图表数据
const chartData = computed(() => {
  return trendData.value.map((point) => ({
    time: new Date(point.timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
    successRate: point.toolCallSuccessRate * 100,
    tokenEfficiency: point.tokenEfficiency,
    responseTime: point.avgResponseTime
  }))
})

// 成功率趋势路径
const successRatePath = computed(() => {
  if (chartData.value.length === 0) return ''
  const maxRate = 100
  const width = 100
  const height = 60
  const points = chartData.value.map((d, i) => {
    const x = (i / (chartData.value.length - 1 || 1)) * width
    const y = height - (d.successRate / maxRate) * height
    return `${x},${y}`
  })
  return `M ${points.join(' L ')}`
})

// Token 效率趋势路径
const tokenEfficiencyPath = computed(() => {
  if (chartData.value.length === 0) return ''
  const maxEff = Math.max(...chartData.value.map((d) => d.tokenEfficiency), 1)
  const width = 100
  const height = 60
  const points = chartData.value.map((d, i) => {
    const x = (i / (chartData.value.length - 1 || 1)) * width
    const y = height - (d.tokenEfficiency / maxEff) * height
    return `${x},${y}`
  })
  return `M ${points.join(' L ')}`
})

// 响应时间趋势路径
const responseTimePath = computed(() => {
  if (chartData.value.length === 0) return ''
  const maxTime = Math.max(...chartData.value.map((d) => d.responseTime), 1000)
  const width = 100
  const height = 60
  const points = chartData.value.map((d, i) => {
    const x = (i / (chartData.value.length - 1 || 1)) * width
    const y = height - (d.responseTime / maxTime) * height
    return `${x},${y}`
  })
  return `M ${points.join(' L ')}`
})

// 是否有对比数据
const hasCompareData = computed(() => {
  return selectedVersion.value !== 'current' && compareMetrics.value !== null
})

// ==================== Lifecycle ====================
onMounted(() => {
  loadData()
})

// ==================== Methods ====================
async function loadData(): Promise<void> {
  loading.value = true
  try {
    await Promise.all([loadCurrentMetrics(), loadTrendData(), loadVersions()])
  } catch (error) {
    emit('error', '加载数据失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function loadCurrentMetrics(): Promise<void> {
  try {
    currentMetrics.value = await window.api.promptMetrics.getCurrentMetrics()
  } catch (error) {
    console.error('加载当前指标失败:', error)
  }
}

async function loadTrendData(): Promise<void> {
  try {
    const endTime = new Date().toISOString()
    const startTime = new Date(Date.now() - getTimeRangeMs()).toISOString()

    trendData.value = await window.api.promptMetrics.getMetricsTrend({
      startTime,
      endTime,
      interval: timeRange.value === '7d' ? 'day' : 'week'
    })
  } catch (error) {
    console.error('加载趋势数据失败:', error)
  }
}

async function loadVersions(): Promise<void> {
  try {
    versions.value = await window.api.promptVersion.getVersions()
  } catch (error) {
    console.error('加载版本列表失败:', error)
  }
}

// 加载指定版本的指标
async function loadCompareMetrics(): Promise<void> {
  if (selectedVersion.value === 'current') {
    compareMetrics.value = null
    return
  }

  loadingCompare.value = true
  try {
    compareMetrics.value = await window.api.promptMetrics.getMetricsByVersion(selectedVersion.value)
  } catch (error) {
    console.error('加载对比版本指标失败:', error)
    compareMetrics.value = null
  } finally {
    loadingCompare.value = false
  }
}

// 计算对比差异
function getCompareDiff(current: number, compare: number): { value: string; positive: boolean } {
  const diff = current - compare
  const percent = compare !== 0 ? (diff / compare) * 100 : 0
  return {
    value: `${diff >= 0 ? '+' : ''}${percent.toFixed(1)}%`,
    positive: diff >= 0
  }
}

function getTimeRangeMs(): number {
  const days = parseInt(timeRange.value)
  return days * 24 * 60 * 60 * 1000
}

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getSuccessRateClass(rate: number): string {
  if (rate >= 0.8) return 'success-high'
  if (rate >= 0.5) return 'success-medium'
  return 'success-low'
}

function getCompareClass(diff: { positive: boolean }): string {
  return diff.positive ? 'compare-positive' : 'compare-negative'
}

async function exportReport(): Promise<void> {
  try {
    const endTime = new Date().toISOString()
    const startTime = new Date(Date.now() - getTimeRangeMs()).toISOString()

    const result = await window.api.promptMetrics.exportReport({
      format: 'json',
      startTime,
      endTime,
      versions: selectedVersion.value === 'current' ? undefined : [selectedVersion.value]
    })

    if (result.success && result.data) {
      // 创建下载
      const blob = new Blob([result.data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `prompt-metrics-${timeRange.value}.json`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      emit('error', result.error || '导出失败')
    }
  } catch (error) {
    emit('error', '导出报表失败')
    console.error(error)
  }
}
</script>

<template>
  <div class="metrics-dashboard">
    <!-- 头部 -->
    <div class="dashboard-header">
      <h3 class="dashboard-title">提示词效果监控</h3>
      <div class="header-actions">
        <select v-model="timeRange" class="input input-sm" @change="loadTrendData">
          <option value="7d">最近7天</option>
          <option value="30d">最近30天</option>
          <option value="90d">最近90天</option>
        </select>
        <button class="btn btn-sm" :disabled="loading" @click="loadData">
          <span v-if="loading">刷新中...</span>
          <span v-else>刷新</span>
        </button>
        <button class="btn btn-sm" @click="exportReport">导出报表</button>
      </div>
    </div>

    <!-- 指标卡片 -->
    <div class="metrics-cards">
      <div class="metric-card">
        <div class="metric-label">工具调用成功率</div>
        <div class="metric-value">
          {{ currentMetrics ? formatPercentage(currentMetrics.toolCallSuccessRate) : '--' }}
        </div>
        <div v-if="hasCompareData && compareMetrics" class="metric-compare" :class="getCompareClass(getCompareDiff(currentMetrics!.toolCallSuccessRate, compareMetrics.toolCallSuccessRate))">
          {{ getCompareDiff(currentMetrics!.toolCallSuccessRate, compareMetrics.toolCallSuccessRate).value }}
        </div>
        <div class="metric-sub">总会话: {{ currentMetrics?.totalSessions || 0 }}</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">Token 效率</div>
        <div class="metric-value">
          {{ currentMetrics ? currentMetrics.tokenEfficiency.toFixed(2) : '--' }}
        </div>
        <div v-if="hasCompareData && compareMetrics" class="metric-compare" :class="getCompareClass(getCompareDiff(currentMetrics!.tokenEfficiency, compareMetrics.tokenEfficiency))">
          {{ getCompareDiff(currentMetrics!.tokenEfficiency, compareMetrics.tokenEfficiency).value }}
        </div>
        <div class="metric-sub">输出/输入比</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">平均响应时间</div>
        <div class="metric-value">
          {{ currentMetrics ? formatDuration(currentMetrics.avgResponseTime) : '--' }}
        </div>
        <div v-if="hasCompareData && compareMetrics" class="metric-compare" :class="getCompareClass(getCompareDiff(compareMetrics!.avgResponseTime, currentMetrics!.avgResponseTime))">
          {{ getCompareDiff(compareMetrics!.avgResponseTime, currentMetrics!.avgResponseTime).value }}
        </div>
        <div class="metric-sub">每会话</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">平均工具调用数</div>
        <div class="metric-value">
          {{ currentMetrics ? currentMetrics.avgToolCallsPerSession.toFixed(1) : '--' }}
        </div>
        <div v-if="hasCompareData && compareMetrics" class="metric-compare" :class="getCompareClass(getCompareDiff(currentMetrics!.avgToolCallsPerSession, compareMetrics.avgToolCallsPerSession))">
          {{ getCompareDiff(currentMetrics!.avgToolCallsPerSession, compareMetrics.avgToolCallsPerSession).value }}
        </div>
        <div class="metric-sub">每会话</div>
      </div>

      <div class="metric-card">
        <div class="metric-label">用户满意度</div>
        <div class="metric-value">
          {{
            currentMetrics?.userSatisfactionScore
              ? currentMetrics.userSatisfactionScore.toFixed(1)
              : '--'
          }}
        </div>
        <div v-if="hasCompareData && compareMetrics?.userSatisfactionScore" class="metric-compare" :class="getCompareClass(getCompareDiff(currentMetrics!.userSatisfactionScore || 0, compareMetrics.userSatisfactionScore || 0))">
          {{ getCompareDiff(currentMetrics!.userSatisfactionScore || 0, compareMetrics.userSatisfactionScore || 0).value }}
        </div>
        <div class="metric-sub">1-5 分</div>
      </div>
    </div>

    <!-- 趋势图表 -->
    <div class="trend-section">
      <h4 class="section-title">趋势分析 - {{ timeRangeLabel }}</h4>

      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="trendData.length === 0" class="empty-state">暂无趋势数据</div>
      <div v-else class="trend-content">
        <!-- 迷你图表 -->
        <div class="mini-charts">
          <div class="mini-chart">
            <div class="chart-title">成功率趋势 (%)</div>
            <svg viewBox="0 0 100 60" class="chart-svg">
              <path :d="successRatePath" class="chart-line success" fill="none" stroke-width="2" />
              <circle
                v-for="(d, i) in chartData"
                :key="i"
                :cx="(i / (chartData.length - 1 || 1)) * 100"
                :cy="60 - (d.successRate / 100) * 60"
                r="2"
                class="chart-dot success"
              />
            </svg>
          </div>
          <div class="mini-chart">
            <div class="chart-title">Token 效率趋势</div>
            <svg viewBox="0 0 100 60" class="chart-svg">
              <path :d="tokenEfficiencyPath" class="chart-line efficiency" fill="none" stroke-width="2" />
              <circle
                v-for="(d, i) in chartData"
                :key="i"
                :cx="(i / (chartData.length - 1 || 1)) * 100"
                :cy="60 - (d.tokenEfficiency / Math.max(...chartData.map(x => x.tokenEfficiency), 1)) * 60"
                r="2"
                class="chart-dot efficiency"
              />
            </svg>
          </div>
          <div class="mini-chart">
            <div class="chart-title">响应时间趋势 (ms)</div>
            <svg viewBox="0 0 100 60" class="chart-svg">
              <path :d="responseTimePath" class="chart-line response" fill="none" stroke-width="2" />
              <circle
                v-for="(d, i) in chartData"
                :key="i"
                :cx="(i / (chartData.length - 1 || 1)) * 100"
                :cy="60 - (d.responseTime / Math.max(...chartData.map(x => x.responseTime), 1000)) * 60"
                r="2"
                class="chart-dot response"
              />
            </svg>
          </div>
        </div>

        <!-- 趋势表格 -->
        <div class="trend-table">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>成功率</th>
                <th>Token 效率</th>
                <th>响应时间</th>
                <th>满意度</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(point, index) in trendData" :key="index">
                <td>{{ new Date(point.timestamp).toLocaleDateString('zh-CN') }}</td>
                <td :class="getSuccessRateClass(point.toolCallSuccessRate)">
                  {{ formatPercentage(point.toolCallSuccessRate) }}
                </td>
                <td>{{ point.tokenEfficiency.toFixed(2) }}</td>
                <td>{{ formatDuration(point.avgResponseTime) }}</td>
                <td>
                  {{ point.userSatisfactionScore ? point.userSatisfactionScore.toFixed(1) : '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 版本对比 -->
    <div class="version-compare-section">
      <h4 class="section-title">版本对比</h4>
      <div class="compare-selector">
        <label>选择对比版本:</label>
        <select v-model="selectedVersion" class="input input-sm" @change="loadCompareMetrics">
          <option value="current">当前版本</option>
          <option v-for="v in versions" :key="v.id" :value="v.version">
            {{ v.version }} {{ v.tag ? `(${v.tag})` : '' }}
          </option>
        </select>
        <span v-if="loadingCompare" class="loading-hint">加载中...</span>
      </div>

      <!-- 对比详情 -->
      <div v-if="hasCompareData && compareMetrics" class="compare-details">
        <div class="compare-header">
          <span class="compare-current">当前版本</span>
          <span class="compare-vs">VS</span>
          <span class="compare-target">{{ selectedVersion }}</span>
        </div>
        <div class="compare-metrics">
          <div class="compare-item">
            <span class="compare-label">成功率</span>
            <span class="compare-value current">{{ formatPercentage(currentMetrics!.toolCallSuccessRate) }}</span>
            <span class="compare-arrow">→</span>
            <span class="compare-value target">{{ formatPercentage(compareMetrics.toolCallSuccessRate) }}</span>
          </div>
          <div class="compare-item">
            <span class="compare-label">Token 效率</span>
            <span class="compare-value current">{{ currentMetrics!.tokenEfficiency.toFixed(2) }}</span>
            <span class="compare-arrow">→</span>
            <span class="compare-value target">{{ compareMetrics.tokenEfficiency.toFixed(2) }}</span>
          </div>
          <div class="compare-item">
            <span class="compare-label">响应时间</span>
            <span class="compare-value current">{{ formatDuration(currentMetrics!.avgResponseTime) }}</span>
            <span class="compare-arrow">→</span>
            <span class="compare-value target">{{ formatDuration(compareMetrics.avgResponseTime) }}</span>
          </div>
          <div class="compare-item">
            <span class="compare-label">平均工具调用</span>
            <span class="compare-value current">{{ currentMetrics!.avgToolCallsPerSession.toFixed(1) }}</span>
            <span class="compare-arrow">→</span>
            <span class="compare-value target">{{ compareMetrics.avgToolCallsPerSession.toFixed(1) }}</span>
          </div>
        </div>
      </div>
      <div v-else-if="selectedVersion !== 'current' && !loadingCompare" class="compare-empty">
        暂无该版本的统计数据
      </div>
    </div>
  </div>
</template>

<style scoped>
.metrics-dashboard {
  padding: 16px;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.dashboard-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* 指标卡片 */
.metrics-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.metric-card {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  padding: 16px;
  text-align: center;
}

.metric-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

.metric-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--theme-accent);
  margin-bottom: 4px;
}

.metric-sub {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.metric-compare {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
}

.compare-positive {
  color: var(--theme-success);
}

.compare-negative {
  color: var(--theme-danger);
}

/* 趋势区域 */
.trend-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--theme-border);
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--theme-text-secondary);
}

.trend-table {
  overflow-x: auto;
}

.trend-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.trend-table th,
.trend-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--theme-border);
}

.trend-table th {
  font-weight: 600;
  color: var(--theme-text);
  background-color: var(--theme-bg-secondary);
}

.trend-table td {
  color: var(--theme-text);
}

.trend-table tr:hover td {
  background-color: var(--theme-bg-hover);
}

/* 迷你图表 */
.trend-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.mini-charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.mini-chart {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  padding: 12px;
}

.chart-title {
  font-size: 11px;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
  text-align: center;
}

.chart-svg {
  width: 100%;
  height: 60px;
  overflow: visible;
}

.chart-line {
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chart-line.success {
  stroke: var(--theme-success);
}

.chart-line.efficiency {
  stroke: var(--theme-accent-secondary);
}

.chart-line.response {
  stroke: var(--theme-warning);
}

.chart-dot {
  fill: var(--theme-bg);
  stroke-width: 1.5;
}

.chart-dot.success {
  stroke: var(--theme-success);
}

.chart-dot.efficiency {
  stroke: var(--theme-accent-secondary);
}

.chart-dot.response {
  stroke: var(--theme-warning);
}

/* 成功率颜色 */
.success-high {
  color: var(--theme-success);
}

.success-medium {
  color: var(--theme-warning);
}

.success-low {
  color: var(--theme-danger);
}

/* 版本对比 */
.version-compare-section {
  margin-bottom: 24px;
}

.compare-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.compare-selector label {
  font-size: 13px;
  color: var(--theme-text);
}

.loading-hint {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.compare-details {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: var(--theme-radius);
  padding: 16px;
}

.compare-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--theme-border);
}

.compare-current {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-accent);
}

.compare-vs {
  font-size: 12px;
  color: var(--theme-text-secondary);
  padding: 2px 8px;
  background-color: var(--theme-bg-hover);
  border-radius: 4px;
}

.compare-target {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-accent-secondary);
}

.compare-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.compare-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--theme-bg);
  border-radius: 6px;
  font-size: 13px;
}

.compare-label {
  color: var(--theme-text-secondary);
  flex-shrink: 0;
}

.compare-value {
  font-weight: 600;
  font-family: var(--theme-font);
}

.compare-value.current {
  color: var(--theme-accent);
}

.compare-value.target {
  color: var(--theme-accent-secondary);
}

.compare-arrow {
  color: var(--theme-text-secondary);
  font-size: 11px;
}

.compare-empty {
  text-align: center;
  padding: 24px;
  color: var(--theme-text-secondary);
  font-size: 13px;
  background-color: var(--theme-bg-secondary);
  border: 1px dashed var(--theme-border);
  border-radius: var(--theme-radius);
}

/* 工具类 */
.input-sm {
  padding: 6px 10px;
  font-size: 13px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}
</style>
