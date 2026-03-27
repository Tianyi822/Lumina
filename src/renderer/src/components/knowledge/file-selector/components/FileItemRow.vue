<script setup lang="ts">
/**
 * 文件行项组件
 * 显示单个文件的选择状态和信息
 */
import type { FileItem } from '@renderer/types'
import { useFileStore } from '@renderer/stores'
import { FileIcon } from '../../shared/components'

defineProps<{
  /** 文件信息 */
  file: FileItem
  /** 是否被选中 */
  selected?: boolean
  /** 是否正在关联 */
  linking?: boolean
}>()

const emit = defineEmits<{
  (e: 'toggle', fileId: string): void
}>()

const fileStore = useFileStore()
</script>

<template>
  <div :class="['file-item', { selected, linking }]" @click="emit('toggle', file.id)">
    <div class="file-checkbox">
      <input type="checkbox" :checked="selected" @click.stop @change="emit('toggle', file.id)" />
    </div>

    <FileIcon :file-type="file.fileType" :size="24" />

    <div class="file-details">
      <div class="file-name">{{ file.name }}</div>
      <div class="file-meta">
        <span class="badge">{{ file.fileType.toUpperCase() }}</span>
        <span>{{ fileStore.formatFileSize(file.size) }}</span>
        <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
      </div>
    </div>

    <div v-if="linking" class="linking-indicator">
      <span class="sm-spinner"></span>
    </div>
  </div>
</template>

<style scoped>
.file-item {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
  padding: var(--sm-space-3);
  border: 1px solid transparent;
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-1);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    opacity var(--sm-transition-fast);
}

.file-item:hover {
  background: var(--sm-color-surface-2);
  border-color: var(--sm-color-border-default);
}

.file-item.selected {
  background: rgba(142, 149, 217, 0.08);
  border-color: var(--sm-color-border-accent);
}

.file-item.linking {
  opacity: 0.7;
  pointer-events: none;
}

.file-checkbox {
  flex-shrink: 0;
}

.file-checkbox input[type='checkbox'] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--sm-color-accent);
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.linking-indicator {
  flex-shrink: 0;
}
</style>
