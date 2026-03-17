<script setup lang="ts">
import type { ExampleStats, ExampleFilter } from '@shared/types/prompt'

defineProps<{
  stats: ExampleStats | null
  filter: ExampleFilter
  searchQuery?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:filter': [filter: Partial<ExampleFilter>]
  'update:searchQuery': [value: string]
  add: []
  extract: []
  import: []
  export: []
  'clear-dynamic': []
}>()

// 来源选项
const sourceOptions = [
  { label: '全部', value: 'all' },
  { label: '静态', value: 'static' },
  { label: '动态', value: 'dynamic' }
]

// 分数选项
const scoreOptions = [
  { label: '全部 (0+)', value: 0 },
  { label: '优秀 (0.8+)', value: 0.8 },
  { label: '良好 (0.6+)', value: 0.6 },
  { label: '一般 (0.4+)', value: 0.4 }
]

// 工具选项（示例，实际应该从配置中获取）
const toolOptions = [
  { label: '全部工具', value: '' },
  { label: 'knowledge__search', value: 'knowledge__search' },
  { label: 'knowledge__list', value: 'knowledge__list' },
  { label: 'knowledge__documents', value: 'knowledge__documents' }
]

// 更新筛选条件
function updateFilter(key: keyof ExampleFilter, value: unknown): void {
  emit('update:filter', { [key]: value })
}

// 格式化质量分数
function formatScore(score: number): string {
  return (score * 100).toFixed(0) + '%'
}
</script>

<template>
  <div class="pe-header-container">
    <!-- 统计卡片区域 -->
    <div class="pe-stats-row">
      <div class="pe-stat-card">
        <span class="pe-stat-label">总数</span>
        <span class="pe-stat-value">{{ stats?.total ?? 0 }}</span>
      </div>
      <div class="pe-stat-card">
        <span class="pe-stat-label">静态</span>
        <span class="pe-stat-value pe-stat-static">{{ stats?.static ?? 0 }}</span>
      </div>
      <div class="pe-stat-card">
        <span class="pe-stat-label">动态</span>
        <span class="pe-stat-value pe-stat-dynamic">{{ stats?.dynamic ?? 0 }}</span>
      </div>
      <div class="pe-stat-card">
        <span class="pe-stat-label">平均质量</span>
        <span class="pe-stat-value pe-stat-quality">{{
          stats ? formatScore(stats.avgQualityScore) : '-'
        }}</span>
      </div>
    </div>

    <!-- 筛选器区域 -->
    <div class="pe-filter-row">
      <div class="pe-filter-group">
        <label class="pe-filter-label">来源</label>
        <select
          :value="filter.source ?? 'all'"
          class="pe-select pe-filter-select"
          @change="updateFilter('source', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in sourceOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="pe-filter-group">
        <label class="pe-filter-label">最低分数</label>
        <select
          :value="filter.minQualityScore ?? 0"
          class="pe-select pe-filter-select"
          @change="
            updateFilter('minQualityScore', Number(($event.target as HTMLSelectElement).value))
          "
        >
          <option v-for="option in scoreOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="pe-filter-group">
        <label class="pe-filter-label">工具</label>
        <select
          :value="filter.toolName ?? ''"
          class="pe-select pe-filter-select"
          @change="
            updateFilter('toolName', ($event.target as HTMLSelectElement).value || undefined)
          "
        >
          <option v-for="option in toolOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="pe-filter-group pe-filter-search">
        <label class="pe-filter-label">搜索</label>
        <input
          type="text"
          :value="searchQuery ?? ''"
          class="pe-input pe-filter-input"
          placeholder="搜索查询或答案..."
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <!-- 操作按钮区域 -->
    <div class="pe-actions-row">
      <button class="pe-btn pe-btn-primary" :disabled="loading" @click="emit('add')">
        <span class="pe-btn-icon">+</span>
        添加示例
      </button>
      <button class="pe-btn pe-btn-secondary" :disabled="loading" @click="emit('extract')">
        从会话提取
      </button>
      <button class="pe-btn pe-btn-secondary" :disabled="loading" @click="emit('import')">
        导入
      </button>
      <button class="pe-btn pe-btn-secondary" :disabled="loading" @click="emit('export')">
        导出
      </button>
      <button
        class="pe-btn pe-btn-danger"
        :disabled="loading || (stats?.dynamic ?? 0) === 0"
        @click="emit('clear-dynamic')"
      >
        清空动态
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 容器 */
.pe-header-container {
  padding: 16px;
  background: var(--theme-background-secondary);
  border-bottom: 1px solid var(--theme-border);
}

/* 统计卡片区域 */
.pe-stats-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.pe-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  padding: 12px 8px;
  background: var(--theme-background-tertiary);
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  min-width: 0;
}

.pe-stat-label {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-bottom: 4px;
}

.pe-stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
}

.pe-stat-static {
  color: var(--theme-info, #3b82f6);
}

.pe-stat-dynamic {
  color: var(--theme-accent);
}

.pe-stat-quality {
  color: var(--theme-success, #22c55e);
}

/* 筛选器区域 */
.pe-filter-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.pe-filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 100px;
}

.pe-filter-search {
  flex: 1;
  min-width: 150px;
}

.pe-filter-label {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: var(--theme-text-secondary);
  line-height: 1.2;
}

.pe-filter-select,
.pe-filter-input {
  padding: 6px 10px;
  min-height: 34px;
  font-size: 13px;
  color: var(--theme-text);
  background: var(--theme-background-tertiary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.pe-filter-select:focus,
.pe-filter-input:focus {
  outline: none;
  border-color: var(--theme-accent);
}

.pe-filter-input {
  width: 100%;
}

.pe-filter-input::placeholder {
  color: var(--theme-text-tertiary);
}

/* 下拉框样式 */
.pe-select {
  appearance: none;
  -webkit-appearance: none;
  background:
    var(--icon-arrow-down-svg) no-repeat right 8px center,
    var(--theme-background-tertiary);
  background-size: 10px;
  padding-right: 28px;
  cursor: pointer;
  min-width: 100px;
}

.pe-select:hover {
  background:
    var(--icon-arrow-down-svg) no-repeat right 8px center,
    var(--theme-background-hover, var(--theme-background-tertiary));
  background-size: 10px;
}

/* 操作按钮区域 */
.pe-actions-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.pe-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  line-height: 1.2;
  box-sizing: border-box;
}

.pe-btn-icon {
  font-size: 16px;
  line-height: 1;
}

.pe-btn-primary {
  background: var(--theme-accent);
  color: white;
  border: none;
}

.pe-btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.pe-btn-secondary {
  background: var(--theme-background-tertiary);
  color: var(--theme-text);
  border: 1px solid var(--theme-border);
}

.pe-btn-secondary:hover:not(:disabled) {
  background: var(--theme-background-hover, var(--theme-background-tertiary));
}

.pe-btn-danger {
  background: transparent;
  color: var(--theme-error, #ef4444);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.pe-btn-danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.1);
}

.pe-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
