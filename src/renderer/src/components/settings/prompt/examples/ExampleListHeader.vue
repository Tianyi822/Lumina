<script setup lang="ts">
import { computed } from 'vue'
import type { ExampleStats, ExampleFilter } from '@shared/types/prompt'

const props = defineProps<{
  stats: ExampleStats | null
  filter: ExampleFilter
  searchQuery?: string
  loading?: boolean
  availableTools?: string[]
}>()

const emit = defineEmits<{
  'update:filter': [filter: Partial<ExampleFilter>]
  'update:searchQuery': [value: string]
  extract: []
  import: []
  export: []
  'clear-dynamic': []
}>()

// 分数选项
const scoreOptions = [
  { label: '全部 (0+)', value: 0 },
  { label: '优秀 (0.8+)', value: 0.8 },
  { label: '良好 (0.6+)', value: 0.6 },
  { label: '一般 (0.4+)', value: 0.4 }
]

// 工具选项（动态生成，缩短显示名）
const toolOptions = computed(() => {
  const options = [{ label: '全部', value: '' }]
  for (const tool of props.availableTools ?? []) {
    // 缩短工具名显示
    const shortName = shortenToolName(tool)
    options.push({ label: shortName, value: tool })
  }
  return options
})

/**
 * 缩短工具名显示
 * 保留最后一个 "__" 及其两边的内容
 * 例如：amap-maps__amap-maps__amap-maps__maps_distance -> amap-maps__maps_distance
 */
function shortenToolName(name: string): string {
  const lastDoubleUnderscoreIndex = name.lastIndexOf('__')
  if (lastDoubleUnderscoreIndex === -1) {
    return name
  }

  // 找倒数第二个 "__"
  const secondLastIndex = name.lastIndexOf('__', lastDoubleUnderscoreIndex - 1)
  if (secondLastIndex === -1) {
    // 只有一个 __，保留原样
    return name
  }

  // 保留最后一个 __ 及其两边的内容
  return name.slice(secondLastIndex + 2)
}

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
        <span class="pe-stat-label">示例</span>
        <span class="pe-stat-value pe-stat-dynamic">{{ stats?.total ?? 0 }}</span>
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

      <div class="pe-filter-group pe-filter-tool">
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
          placeholder="搜索查询、思考或工具..."
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <!-- 操作按钮区域 -->
    <div class="pe-actions-row">
      <button class="pe-btn pe-btn-secondary" :disabled="loading" @click="emit('extract')">
        提取
      </button>
      <button class="pe-btn pe-btn-secondary" :disabled="loading" @click="emit('import')">
        导入
      </button>
      <button class="pe-btn pe-btn-secondary" :disabled="loading" @click="emit('export')">
        导出
      </button>
      <button
        class="pe-btn pe-btn-danger"
        :disabled="loading || (stats?.total ?? 0) === 0"
        @click="emit('clear-dynamic')"
      >
        清除
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 容器 */
.pe-header-container {
  padding: 16px;
  background: var(--theme-bg-secondary);
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
  background: var(--theme-bg-tertiary);
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
  min-width: 80px;
}

.pe-filter-tool {
  max-width: 120px;
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
  background: var(--theme-bg-tertiary);
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
    var(--theme-bg-tertiary);
  background-size: 10px;
  padding-right: 28px;
  cursor: pointer;
  min-width: 80px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pe-select:hover {
  background:
    var(--icon-arrow-down-svg) no-repeat right 8px center,
    var(--theme-bg-hover, var(--theme-bg-tertiary));
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
  background: var(--theme-bg-tertiary);
  color: var(--theme-text);
  border: 1px solid var(--theme-border);
}

.pe-btn-secondary:hover:not(:disabled) {
  background: var(--theme-bg-hover, var(--theme-bg-tertiary));
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
