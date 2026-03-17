<script setup lang="ts">
import { computed } from 'vue'
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
  edit: [id: string]
  delete: [ids: string[]]
  'update:selectedIds': [ids: string[]]
}>()

// 全选状态
const allSelected = computed(() => {
  return props.examples.length > 0 && props.selectedIds?.length === props.examples.length
})

// 部分选中状态
const indeterminate = computed(() => {
  const selectedCount = props.selectedIds?.length || 0
  return selectedCount > 0 && selectedCount < props.examples.length
})

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

// 处理编辑
function handleEdit(id: string): void {
  emit('edit', id)
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
            <th class="pe-table-cell">最终答案</th>
            <th class="pe-table-cell pe-sortable-cell">
              质量分数
              <span class="pe-sort-icon">↓</span>
            </th>
            <th class="pe-table-cell">来源</th>
            <th class="pe-table-cell">使用的工具</th>
            <th class="pe-table-cell pe-action-cell">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="examples.length === 0" class="pe-table-row pe-empty-row">
            <td colspan="8" class="pe-table-cell pe-empty-cell">
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
            <td class="pe-table-cell pe-answer-cell">
              <div class="pe-cell-content" :title="example.finalAnswer">
                {{ truncateText(example.finalAnswer, 50) }}
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
            <td class="pe-table-cell pe-source-cell">
              <span
                class="pe-source-badge"
                :class="{
                  'pe-source-static': example.source === 'static',
                  'pe-source-dynamic': example.source === 'dynamic'
                }"
              >
                {{ example.source === 'static' ? '静态' : '动态' }}
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
                  class="pe-btn pe-btn-icon pe-btn-edit"
                  title="编辑"
                  @click="handleEdit(example.id)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
                <button
                  class="pe-btn pe-btn-icon pe-btn-delete"
                  title="删除"
                  @click="handleDelete(example.id)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
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
  background: var(--theme-background-secondary);
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
  overflow-x: auto;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-background-secondary);
}

.pe-table-wrapper.pe-loading::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1;
}

/* 表格 */
.pe-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

/* 表头 */
.pe-table-header {
  background: var(--theme-background-tertiary);
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
  background: var(--theme-background-tertiary);
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
  background: var(--theme-background-tertiary);
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

/* 来源单元格 */
.pe-source-cell {
  width: 80px;
}

.pe-source-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  box-sizing: border-box;
}

.pe-source-static {
  background: rgba(59, 130, 246, 0.15);
  color: var(--theme-accent);
}

.pe-source-dynamic {
  background: rgba(34, 197, 94, 0.15);
  color: var(--theme-success, #22c55e);
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
  background: var(--theme-background-tertiary);
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
  width: 100px;
  text-align: center;
}

.pe-action-buttons {
  display: flex;
  justify-content: center;
  gap: 8px;
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
  background: var(--theme-background-tertiary);
  color: var(--theme-text);
}

.pe-btn-edit:hover {
  background: rgba(59, 130, 246, 0.1);
  color: var(--theme-accent);
}

.pe-btn-delete:hover {
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
  background: var(--theme-background-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 4px;
}

.pe-table-info {
  font-size: 12px;
  color: var(--theme-text-secondary);
}
</style>
