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
        <span>{{ fileStore.formatFileSize(file.size) }}</span>
        <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
      </div>
    </div>

    <div v-if="linking" class="linking-indicator">
      <div class="spinner-small"></div>
    </div>
  </div>
</template>

<style scoped>
.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.file-item:hover {
  background-color: var(--theme-bg-secondary);
}

.file-item.selected {
  background-color: rgba(63, 185, 80, 0.1);
  border-color: var(--theme-accent);
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
  accent-color: var(--theme-accent);
}

.file-details {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.linking-indicator {
  flex-shrink: 0;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
