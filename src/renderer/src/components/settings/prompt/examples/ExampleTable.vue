<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { EnhancedFewShotExample } from '@shared/types/prompt'

interface Props {
  examples: EnhancedFewShotExample[]
  loading?: boolean
  selectedIds?: string[]
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  selectedIds: () => []
})

const emit = defineEmits<{
  delete: [ids: string[]]
  'update:selectedIds': [ids: string[]]
}>()

// 滚动容器引用
const scrollContainerRef = ref<HTMLElement | null>(null)

// 滚动状态
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

// 拖拽滚动状态
const isDragging = ref(false)
const dragStartX = ref(0)
const scrollStartLeft = ref(0)

// 全选状态
const allSelected = computed(() => {
  return props.examples.length > 0 && props.selectedIds?.length === props.examples.length
})

// 部分选中状态
const indeterminate = computed(() => {
  const selectedCount = props.selectedIds?.length || 0
  return selectedCount > 0 && selectedCount < props.examples.length
})

// 更新滚动指示器
function updateScrollIndicators(): void {
  const el = scrollContainerRef.value
  if (!el) return

  canScrollLeft.value = el.scrollLeft > 5
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 5
}

// 鼠标按下开始拖拽
function handleMouseDown(event: MouseEvent): void {
  const el = scrollContainerRef.value
  if (!el) return

  isDragging.value = true
  dragStartX.value = event.pageX
  scrollStartLeft.value = el.scrollLeft
  el.style.cursor = 'grabbing'
  el.style.userSelect = 'none'
}

// 鼠标移动时滚动
function handleMouseMove(event: MouseEvent): void {
  if (!isDragging.value) return

  const el = scrollContainerRef.value
  if (!el) return

  const dx = event.pageX - dragStartX.value
  el.scrollLeft = scrollStartLeft.value - dx
  updateScrollIndicators()
}

// 鼠标释放结束拖拽
function handleMouseUp(): void {
  const el = scrollContainerRef.value
  if (el) {
    el.style.cursor = 'grab'
    el.style.userSelect = ''
  }
  isDragging.value = false
}

// 切换单个选中状态
function toggleSelection(id: string): void {
  const newIds = props.selectedIds?.includes(id)
    ? props.selectedIds.filter((itemId) => itemId !== id)
    : [...props.selectedIds, id]
  emit('update:selectedIds', newIds)
}

// 切换全选状态
function toggleSelectAll(): void {
  emit('update:selectedIds', allSelected.value ? [] : props.examples.map((e) => e.id))
}

// 处理删除
function handleDelete(id: string): void {
  emit('delete', [id])
}

// 处理批量删除
function handleBatchDelete(): void {
  if (props.selectedIds && props.selectedIds.length > 0) {
    emit('delete', props.selectedIds)
  }
}

// 格式化质量分数
function formatQualityScore(score: number): string {
  return (score * 100).toFixed(0) + '%'
}

// 获取质量分数颜色
function getQualityScoreColor(score: number): string {
  if (score >= 0.8) return 'rgba(127, 176, 138, 0.92)'
  if (score >= 0.6) return 'rgba(197, 161, 101, 0.92)'
  return 'rgba(199, 120, 120, 0.92)'
}

// 截断长文本
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// 生命周期
onMounted(() => {
  const el = scrollContainerRef.value
  if (el) {
    el.addEventListener('scroll', updateScrollIndicators)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('mousemove', handleMouseMove)
    // 初始检查
    setTimeout(updateScrollIndicators, 100)
  }
})

onUnmounted(() => {
  const el = scrollContainerRef.value
  if (el) {
    el.removeEventListener('scroll', updateScrollIndicators)
  }
  window.removeEventListener('mouseup', handleMouseUp)
  window.removeEventListener('mousemove', handleMouseMove)
})
</script>

<template>
  <div class="sm-prompt-example-table">
    <div v-if="selectedIds && selectedIds.length > 0" class="sm-settings-card sm-prompt-example-table__selection-bar">
      <span class="sm-prompt-example-table__selection-info">已选择 {{ selectedIds.length }} 项</span>
      <button class="sm-button sm-button--danger sm-button--small" @click="handleBatchDelete">
        批量删除
      </button>
    </div>

    <div class="sm-prompt-example-table__wrapper" :class="{ 'is-loading': loading }">
      <div v-if="loading" class="sm-prompt-example-table__loading" aria-live="polite">
        <span class="sm-spinner sm-spinner--large"></span>
        <span>正在加载示例...</span>
      </div>

      <div v-if="canScrollLeft" class="sm-prompt-example-table__shadow sm-prompt-example-table__shadow--left"></div>
      <div v-if="canScrollRight" class="sm-prompt-example-table__shadow sm-prompt-example-table__shadow--right"></div>

      <div ref="scrollContainerRef" class="sm-prompt-example-table__scroll" @mousedown="handleMouseDown">
        <table class="sm-prompt-example-table__table">
          <thead>
            <tr class="sm-prompt-example-table__head-row">
              <th class="sm-prompt-example-table__cell sm-prompt-example-table__cell--checkbox">
                <input
                  type="checkbox"
                  class="sm-prompt-example-table__checkbox"
                  :checked="allSelected"
                  :indeterminate="indeterminate"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="sm-prompt-example-table__cell">用户查询</th>
              <th class="sm-prompt-example-table__cell">思考过程</th>
              <th class="sm-prompt-example-table__cell sm-prompt-example-table__cell--sortable">
                质量分数
                <span class="sm-prompt-example-table__sort-icon">↓</span>
              </th>
              <th class="sm-prompt-example-table__cell">使用的工具</th>
              <th class="sm-prompt-example-table__cell sm-prompt-example-table__cell--action">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="examples.length === 0" class="sm-prompt-example-table__row sm-prompt-example-table__row--empty">
              <td colspan="6" class="sm-prompt-example-table__empty-cell">
                <div class="sm-empty sm-prompt-example-table__empty">
                  <p>{{ loading ? '加载中...' : '暂无示例数据' }}</p>
                </div>
              </td>
            </tr>
            <tr
              v-for="example in examples"
              :key="example.id"
              class="sm-prompt-example-table__row"
              :class="{ 'is-selected': selectedIds?.includes(example.id) }"
            >
              <td class="sm-prompt-example-table__cell sm-prompt-example-table__cell--checkbox">
                <input
                  type="checkbox"
                  class="sm-prompt-example-table__checkbox"
                  :checked="selectedIds?.includes(example.id)"
                  @change="toggleSelection(example.id)"
                />
              </td>
              <td class="sm-prompt-example-table__cell">
                <div class="sm-prompt-example-table__cell-content" :title="example.userQuery">
                  {{ truncateText(example.userQuery, 50) }}
                </div>
              </td>
              <td class="sm-prompt-example-table__cell">
                <div class="sm-prompt-example-table__cell-content" :title="example.thought">
                  {{ truncateText(example.thought, 50) }}
                </div>
              </td>
              <td class="sm-prompt-example-table__cell sm-prompt-example-table__cell--score">
                <span
                  class="sm-prompt-example-table__score-badge"
                  :style="{ backgroundColor: getQualityScoreColor(example.qualityScore) }"
                >
                  {{ formatQualityScore(example.qualityScore) }}
                </span>
              </td>
              <td class="sm-prompt-example-table__cell sm-prompt-example-table__cell--tools">
                <div
                  v-if="example.toolsUsed && example.toolsUsed.length > 0"
                  class="sm-prompt-example-table__tool-list"
                >
                  <span
                    v-for="(tool, index) in example.toolsUsed.slice(0, 2)"
                    :key="index"
                    class="sm-prompt-example-table__tool-tag"
                  >
                    {{ tool }}
                  </span>
                  <span v-if="example.toolsUsed.length > 2" class="sm-prompt-example-table__tool-tag">
                    +{{ example.toolsUsed.length - 2 }}
                  </span>
                </div>
                <span v-else class="sm-prompt-example-table__no-tools">-</span>
              </td>
              <td class="sm-prompt-example-table__cell sm-prompt-example-table__cell--action">
                <button
                  class="sm-icon-button sm-prompt-example-table__delete-button"
                  title="删除"
                  @click="handleDelete(example.id)"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <path
                      d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="examples.length > 0" class="sm-settings-card sm-prompt-example-table__footer">
      <span class="sm-prompt-example-table__footer-info">共 {{ examples.length }} 条示例</span>
    </div>
  </div>
</template>

<style scoped>
.sm-prompt-example-table {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-3);
}

.sm-prompt-example-table__selection-bar,
.sm-prompt-example-table__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.sm-prompt-example-table__selection-info,
.sm-prompt-example-table__footer-info {
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}

.sm-prompt-example-table__wrapper {
  position: relative;
  min-height: 260px;
  overflow: hidden;
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
}

.sm-prompt-example-table__scroll {
  overflow-x: auto;
  cursor: grab;
}

.sm-prompt-example-table__shadow {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 24px;
  z-index: 1;
  pointer-events: none;
}

.sm-prompt-example-table__shadow--left {
  left: 0;
  background: linear-gradient(to right, var(--sm-color-surface-2), transparent);
}

.sm-prompt-example-table__shadow--right {
  right: 0;
  background: linear-gradient(to left, var(--sm-color-surface-2), transparent);
}

.sm-prompt-example-table__wrapper.is-loading .sm-prompt-example-table__scroll {
  opacity: 0.48;
  pointer-events: none;
  user-select: none;
}

.sm-prompt-example-table__loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sm-space-3);
  background: rgba(11, 11, 12, 0.32);
  color: var(--sm-color-text-secondary);
}

.sm-prompt-example-table__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.sm-prompt-example-table__head-row {
  background: var(--sm-color-surface-1);
}

.sm-prompt-example-table__cell {
  padding: 12px;
  color: var(--sm-color-text-primary);
  text-align: left;
  vertical-align: middle;
}

.sm-prompt-example-table__head-row .sm-prompt-example-table__cell {
  font-weight: 600;
  white-space: nowrap;
}

.sm-prompt-example-table__cell--sortable {
  cursor: pointer;
  user-select: none;
}

.sm-prompt-example-table__sort-icon {
  margin-left: 4px;
  opacity: 0.5;
  font-size: 12px;
}

.sm-prompt-example-table__row {
  border-top: 1px solid var(--sm-color-border-default);
  transition: background-color var(--sm-transition-fast);
}

.sm-prompt-example-table__row:hover {
  background: var(--sm-color-surface-hover);
}

.sm-prompt-example-table__row.is-selected {
  background: rgba(142, 149, 217, 0.08);
}

.sm-prompt-example-table__cell--checkbox {
  width: 40px;
  text-align: center;
}

.sm-prompt-example-table__checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--sm-color-accent);
}

.sm-prompt-example-table__cell-content {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
}

.sm-prompt-example-table__cell--score {
  width: 100px;
}

.sm-prompt-example-table__score-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  font-weight: 600;
}

.sm-prompt-example-table__cell--tools {
  width: 150px;
}

.sm-prompt-example-table__tool-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.sm-prompt-example-table__tool-tag {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
  font-size: 11px;
}

.sm-prompt-example-table__no-tools {
  color: var(--sm-color-text-secondary);
}

.sm-prompt-example-table__cell--action {
  width: 60px;
  text-align: center;
}

.sm-prompt-example-table__delete-button:hover {
  background: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: #c77878;
}

.sm-prompt-example-table__row--empty {
  height: 120px;
}

.sm-prompt-example-table__empty-cell {
  padding: 0 !important;
}

.sm-prompt-example-table__empty {
  min-height: 120px;
  border: none;
  background: transparent;
}

@media (max-width: 640px) {
  .sm-prompt-example-table__selection-bar,
  .sm-prompt-example-table__footer {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
