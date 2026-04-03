<script setup lang="ts">
/**
 * 文件卡片组件
 * 显示单个文件的信息和操作按钮
 */
import type { FileItem } from '@renderer/types'
import { useFileStore } from '@renderer/stores'
import { FileIcon } from '../../shared/components'

defineProps<{
  /** 文件信息 */
  file: FileItem
  /** 是否正在删除 */
  isDeleting?: boolean
}>()

const emit = defineEmits<{
  (e: 'delete', file: FileItem): void
  (e: 'preview', file: FileItem): void
}>()

const fileStore = useFileStore()
</script>

<template>
  <div class="file-card" @click="emit('preview', file)">
    <div class="file-card__top">
      <FileIcon :file-type="file.fileType" :size="28" />

      <div class="file-actions">
        <div v-if="file.usedByKBIds.length > 0" class="usage-badge">使用中</div>
        <button
          class="sm-button sm-button--danger sm-button--small delete-btn"
          :disabled="isDeleting"
          :title="file.usedByKBIds.length > 0 ? '文件被知识库使用，删除需谨慎' : '删除文件'"
          @click.stop="emit('delete', file)"
        >
          <span v-if="isDeleting" class="sm-spinner"></span>
          <span v-else class="delete-text">删除</span>
        </button>
      </div>
    </div>

    <div class="file-info">
      <div class="file-name" :title="file.name">{{ file.name }}</div>
      <div class="file-meta">
        <span class="badge">{{ file.fileType.toUpperCase() }}</span>
        <span class="file-size">{{ fileStore.formatFileSize(file.size) }}</span>
        <span class="file-date">{{ fileStore.formatDate(file.uploadedAt) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-card {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  padding: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.file-card:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.file-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  line-height: 1.5;
  word-break: break-word;
}

.file-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.file-actions {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.usage-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid var(--sm-color-accent-28);
  border-radius: 999px;
  background: var(--sm-color-accent-08);
  font-size: 11px;
  font-weight: 500;
  color: var(--sm-color-accent-hover);
}

.delete-btn {
  flex-shrink: 0;
}

.delete-btn:disabled {
  opacity: 0.45;
}

.delete-text {
  font-size: 12px;
}
</style>
