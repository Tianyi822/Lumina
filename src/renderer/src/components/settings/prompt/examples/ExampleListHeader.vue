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
  <div class="sm-settings-card sm-prompt-example-header">
    <div class="sm-prompt-example-header__stats">
      <div class="sm-prompt-example-header__stat-card">
        <span class="sm-prompt-example-header__stat-label">示例</span>
        <span class="sm-prompt-example-header__stat-value sm-prompt-example-header__stat-value--accent">
          {{ stats?.total ?? 0 }}
        </span>
      </div>
      <div class="sm-prompt-example-header__stat-card">
        <span class="sm-prompt-example-header__stat-label">平均质量</span>
        <span class="sm-prompt-example-header__stat-value sm-prompt-example-header__stat-value--success">
          {{ stats ? formatScore(stats.avgQualityScore) : '-' }}
        </span>
      </div>
    </div>

    <div class="sm-prompt-example-header__filters">
      <div class="sm-prompt-example-header__filter-group">
        <label class="sm-prompt-example-header__label">最低分数</label>
        <select
          :value="filter.minQualityScore ?? 0"
          class="sm-select"
          @change="
            updateFilter('minQualityScore', Number(($event.target as HTMLSelectElement).value))
          "
        >
          <option v-for="option in scoreOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="sm-prompt-example-header__filter-group sm-prompt-example-header__filter-group--tool">
        <label class="sm-prompt-example-header__label">工具</label>
        <select
          :value="filter.toolName ?? ''"
          class="sm-select"
          @change="
            updateFilter('toolName', ($event.target as HTMLSelectElement).value || undefined)
          "
        >
          <option v-for="option in toolOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div class="sm-prompt-example-header__filter-group sm-prompt-example-header__filter-group--search">
        <label class="sm-prompt-example-header__label">搜索</label>
        <input
          type="text"
          :value="searchQuery ?? ''"
          class="sm-input"
          placeholder="搜索查询、思考或工具..."
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="sm-prompt-example-header__actions">
      <button class="sm-button sm-button--secondary" :disabled="loading" @click="emit('extract')">
        提取
      </button>
      <button class="sm-button sm-button--secondary" :disabled="loading" @click="emit('import')">
        导入
      </button>
      <button class="sm-button sm-button--secondary" :disabled="loading" @click="emit('export')">
        导出
      </button>
      <button
        class="sm-button sm-button--danger"
        :disabled="loading || (stats?.total ?? 0) === 0"
        @click="emit('clear-dynamic')"
      >
        清除
      </button>
    </div>
  </div>
</template>

<style scoped>
.sm-prompt-example-header {
  gap: var(--sm-space-4);
}

.sm-prompt-example-header__stats {
  display: flex;
  gap: var(--sm-space-3);
}

.sm-prompt-example-header__stat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
}

.sm-prompt-example-header__stat-label,
.sm-prompt-example-header__label {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.sm-prompt-example-header__stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.sm-prompt-example-header__stat-value--accent {
  color: var(--sm-color-accent-hover);
}

.sm-prompt-example-header__stat-value--success {
  color: #7fb08a;
}

.sm-prompt-example-header__filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-3);
}

.sm-prompt-example-header__filter-group {
  min-width: 80px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sm-prompt-example-header__filter-group--tool {
  max-width: 120px;
}

.sm-prompt-example-header__filter-group--search {
  flex: 1;
  min-width: 150px;
}

.sm-prompt-example-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-3);
}

@media (max-width: 640px) {
  .sm-prompt-example-header__stats {
    flex-direction: column;
  }

  .sm-prompt-example-header__actions .sm-button {
    width: 100%;
  }
}
</style>
