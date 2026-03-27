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
  if (score >= 0.8) return 'var(--theme-success, #22c55e)'
  if (score >= 0.6) return 'var(--theme-warning, #f59e0b)'
  return 'var(--theme-error, #ef4444)'
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
  <div class="pe-table-container">
    <!-- 批量操作栏 -->
    <div v-if="selectedIds && selectedIds.length > 0" class="pe-batch-actions">
      <span class="pe-batch-info">已选择 {{ selectedIds.length }} 项</span>
      <div class="pe-batch-buttons">
        <button class="pe-btn pe-btn-danger pe-btn-sm" @click="handleBatchDelete">批量删除</button>
      </div>
    </div>

    <!-- 表格 -->
    <div class="pe-table-wrapper" :class="{ 'pe-loading': loading }">
      <div v-if="loading" class="pe-table-loading-mask" aria-live="polite">
        <span class="pe-loading-spinner"></span>
        <span class="pe-loading-text">正在加载示例...</span>
      </div>

      <!-- 左侧滚动阴影 -->
      <div v-if="canScrollLeft" class="pe-scroll-shadow pe-scroll-shadow-left"></div>
      <!-- 右侧滚动阴影 -->
      <div v-if="canScrollRight" class="pe-scroll-shadow pe-scroll-shadow-right"></div>

      <div ref="scrollContainerRef" class="pe-table-scroll" @mousedown="handleMouseDown">
        <table class="pe-table">
          <thead>
            <tr class="pe-table-header">
              <th class="pe-table-cell pe-checkbox-cell">
                <input
                  type="checkbox"
                  class="pe-checkbox"
                  :checked="allSelected"
                  :indeterminate="indeterminate"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="pe-table-cell">用户查询</th>
              <th class="pe-table-cell">思考过程</th>
              <th class="pe-table-cell pe-sortable-cell">
                质量分数
                <span class="pe-sort-icon">↓</span>
              </th>
              <th class="pe-table-cell">使用的工具</th>
              <th class="pe-table-cell pe-action-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="examples.length === 0" class="pe-table-row pe-empty-row">
              <td colspan="6" class="pe-table-cell pe-empty-cell">
                <div class="pe-empty-state">
                  <p class="pe-empty-text">{{ loading ? '加载中...' : '暂无示例数据' }}</p>
                </div>
              </td>
            </tr>
            <tr
              v-for="example in examples"
              :key="example.id"
              class="pe-table-row"
              :class="{ 'pe-selected': selectedIds?.includes(example.id) }"
            >
              <td class="pe-table-cell pe-checkbox-cell">
                <input
                  type="checkbox"
                  class="pe-checkbox"
                  :checked="selectedIds?.includes(example.id)"
                  @change="toggleSelection(example.id)"
                />
              </td>
              <td class="pe-table-cell pe-query-cell">
                <div class="pe-cell-content" :title="example.userQuery">
                  {{ truncateText(example.userQuery, 50) }}
                </div>
              </td>
              <td class="pe-table-cell pe-thought-cell">
                <div class="pe-cell-content" :title="example.thought">
                  {{ truncateText(example.thought, 50) }}
                </div>
              </td>
              <td class="pe-table-cell pe-score-cell">
                <span
                  class="pe-quality-badge"
                  :style="{ backgroundColor: getQualityScoreColor(example.qualityScore) }"
                >
                  {{ formatQualityScore(example.qualityScore) }}
                </span>
              </td>
              <td class="pe-table-cell pe-tools-cell">
                <div v-if="example.toolsUsed && example.toolsUsed.length > 0" class="pe-tools-list">
                  <span
                    v-for="(tool, index) in example.toolsUsed.slice(0, 2)"
                    :key="index"
                    class="pe-tool-tag"
                  >
                    {{ tool }}
                  </span>
                  <span v-if="example.toolsUsed.length > 2" class="pe-tool-more">
                    +{{ example.toolsUsed.length - 2 }}
                  </span>
                </div>
                <span v-else class="pe-no-tools">-</span>
              </td>
              <td class="pe-table-cell pe-action-cell">
                <div class="pe-action-buttons">
                  <button
                    class="pe-btn pe-btn-icon pe-btn-delete"
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
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 分页信息 -->
    <div v-if="examples.length > 0" class="pe-table-footer">
      <span class="pe-table-info">共 {{ examples.length }} 条示例</span>
    </div>
  </div>
</template>

<style scoped>
/* 容器 */
.pe-table-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 批量操作栏 */
.pe-batch-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
}

.pe-batch-info {
  font-size: 13px;
  color: var(--theme-text);
}

.pe-batch-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 表格包装器 */
.pe-table-wrapper {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-bg-secondary);
  min-height: 260px;
}

.pe-table-scroll {
  overflow-x: auto;
  cursor: grab;
}

/* 滚动阴影指示器 */
.pe-scroll-shadow {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 24px;
  z-index: 1;
  pointer-events: none;
}

.pe-scroll-shadow-left {
  left: 0;
  background: linear-gradient(to right, var(--theme-bg-secondary), transparent);
}

.pe-scroll-shadow-right {
  right: 0;
  background: linear-gradient(to left, var(--theme-bg-secondary), transparent);
}

.pe-table-wrapper.pe-loading .pe-table-scroll {
  opacity: 0.5;
  pointer-events: none;
  user-select: none;
}

.pe-table-loading-mask {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--theme-text-secondary);
}

.pe-loading-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid rgba(70, 170, 143, 0.18);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: pe-table-spin 0.8s linear infinite;
}

.pe-loading-text {
  font-size: 13px;
}

@keyframes pe-table-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* 表格 */
.pe-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

/* 表头 */
.pe-table-header {
  background: var(--theme-bg-tertiary);
}

.pe-table-header .pe-table-cell {
  font-weight: 600;
  color: var(--theme-text);
  padding: 12px;
  text-align: left;
  white-space: nowrap;
}

.pe-sortable-cell {
  cursor: pointer;
  user-select: none;
}

.pe-sortable-cell:hover {
  background: var(--theme-bg-tertiary);
}

.pe-sort-icon {
  margin-left: 4px;
  opacity: 0.5;
  font-size: 12px;
}

/* 表格行 */
.pe-table-row {
  border-top: 1px solid var(--theme-border);
  transition: background 0.15s ease;
}

.pe-table-row:hover {
  background: var(--theme-bg-tertiary);
}

.pe-table-row.pe-selected {
  background: rgba(var(--theme-accent-rgb, 59, 130, 246), 0.1);
}

/* 表格单元格 */
.pe-table-cell {
  padding: 12px;
  color: var(--theme-text);
  vertical-align: middle;
}

/* 复选框单元格 */
.pe-checkbox-cell {
  width: 40px;
  text-align: center;
}

.pe-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--theme-accent);
}

/* 内容单元格 */
.pe-cell-content {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
}

/* 质量分数单元格 */
.pe-score-cell {
  width: 100px;
}

.pe-quality-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: white;
  line-height: 1;
  box-sizing: border-box;
}

/* 工具单元格 */
.pe-tools-cell {
  width: 150px;
}

.pe-tools-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.pe-tool-tag,
.pe-tool-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  padding: 0 6px;
  background: var(--theme-bg-tertiary);
  border-radius: 3px;
  font-size: 11px;
  color: var(--theme-text-secondary);
  line-height: 1;
  box-sizing: border-box;
  white-space: nowrap;
}

.pe-no-tools {
  color: var(--theme-text-secondary);
}

/* 操作单元格 */
.pe-action-cell {
  width: 60px;
  text-align: center;
}

.pe-action-buttons {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 按钮 */
.pe-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pe-btn-sm {
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 4px;
  line-height: 1;
}

.pe-btn-danger {
  background: rgba(239, 68, 68, 0.1);
  color: var(--theme-error, #ef4444);
}

.pe-btn-danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

.pe-btn-icon {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 4px;
  color: var(--theme-text-secondary);
}

.pe-btn-icon svg {
  display: block;
}

.pe-btn-icon:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--theme-error, #ef4444);
}

/* 空状态 */
.pe-empty-row {
  height: 120px;
}

.pe-empty-cell {
  padding: 0 !important;
}

.pe-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
}

.pe-empty-text {
  font-size: 14px;
  color: var(--theme-text-secondary);
}

/* 表格底部 */
.pe-table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
}

.pe-table-info {
  font-size: 12px;
  color: var(--theme-text-secondary);
}
</style>
