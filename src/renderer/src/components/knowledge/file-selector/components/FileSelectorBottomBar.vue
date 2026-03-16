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
      <button class="btn" @click="emit('close')">取消</button>
      <button class="btn btn-primary" :disabled="!hasSelectedFiles" @click="emit('linkSelected')">
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
  padding: 16px 24px;
  border-top: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
}

.left-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.selection-count {
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.selection-actions {
  display: flex;
  gap: 12px;
}

.btn-link {
  background: transparent;
  border: none;
  color: var(--theme-accent);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.btn-link:hover {
  background-color: rgba(63, 185, 80, 0.1);
}

.actions {
  display: flex;
  gap: 12px;
}

/* 按钮样式 */
.btn {
  padding: 8px 16px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background-color: var(--theme-bg-hover);
}

.btn-primary {
  background-color: var(--theme-accent);
  border-color: var(--theme-accent);
  color: white;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
