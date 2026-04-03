<script setup lang="ts">
/**
 * 文件选择器底部操作栏组件
 */
import type { FileItem } from '@renderer/types'

defineProps<{
  /** 选中的文件数量 */
  selectedCount: number
  /** 是否有选中的文件 */
  hasSelectedFiles: boolean
  /** 可选的文件列表 */
  availableFiles: FileItem[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectAll'): void
  (e: 'deselectAll'): void
  (e: 'linkSelected'): void
}>()
</script>

<template>
  <div class="bottom-bar">
    <div class="left-actions">
      <span class="selection-count">已选择 {{ selectedCount }} 个文件</span>
      <div class="selection-actions">
        <button class="btn-link" @click="emit('selectAll')">全选</button>
        <button class="btn-link" @click="emit('deselectAll')">取消全选</button>
      </div>
    </div>
    <div class="actions">
      <button class="sm-button sm-button--secondary" @click="emit('close')">取消</button>
      <button
        class="sm-button sm-button--primary"
        :disabled="!hasSelectedFiles"
        @click="emit('linkSelected')"
      >
        添加到知识库
      </button>
    </div>
  </div>
</template>

<style scoped>
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-4);
  padding: var(--sm-space-4) var(--sm-space-5) var(--sm-space-5);
  border-top: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
}

.left-actions {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  flex-wrap: wrap;
}

.selection-count {
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}

.selection-actions {
  display: flex;
  gap: var(--sm-space-2);
}

.btn-link {
  background: transparent;
  border: none;
  color: var(--sm-color-accent-hover);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--sm-radius-sm);
  transition:
    background-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.btn-link:hover {
  background: var(--sm-color-accent-08);
}

.actions {
  display: flex;
  gap: var(--sm-space-3);
}

@media (max-width: 720px) {
  .bottom-bar,
  .actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
