<script setup lang="ts">
/**
 * 文件卡片组件
 * 显示单个文件的信息和操作按钮
 */
import type { FileItem } from '@renderer/types'
import { useFileStore } from '@renderer/stores'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
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

function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return fileName.substring(0, lastDotIndex)
  }
  return fileName
}
</script>

<template>
  <div class="file-card" @click="emit('preview', file)">
    <div class="file-card__top">
      <FileIcon :file-type="file.fileType" :size="28" />

      <div class="file-actions">
        <div v-if="file.usedByKBIds.length > 0" class="usage-badge">使用中</div>
        <button
          class="sm-icon-button delete-btn"
          :disabled="isDeleting"
          :title="file.usedByKBIds.length > 0 ? '文件被知识库使用，删除需谨慎' : '删除文件'"
          @click.stop="emit('delete', file)"
        >
          <span v-if="isDeleting" class="sm-spinner"></span>
          <SvgIcon v-else name="trash" :size="12" />
        </button>
      </div>
    </div>

    <div class="file-info">
      <div class="file-name" :title="file.name">{{ getFileNameWithoutExtension(file.name) }}</div>
    </div>

    <div class="file-meta">
      <span class="badge file-type-badge">{{ file.fileType.toUpperCase() }}</span>
      <span>{{ fileStore.formatFileSize(file.size) }}</span>
      <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
    </div>
  </div>
</template>

<style scoped>
.file-card {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  min-height: 220px;
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
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sm-space-2);
  min-width: 0;
  min-height: 0;
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
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  margin-top: auto;
  font-size: 11px;
  color: var(--sm-color-text-secondary);
}

.file-meta > span {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
}

.file-type-badge {
  color: var(--sm-color-text-primary);
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
  color: var(--sm-color-text-tertiary);
}

.delete-btn:disabled {
  opacity: 0.45;
}

.file-card:hover .delete-btn:not(:disabled) {
  opacity: 1;
}

.delete-btn:hover:not(:disabled),
.delete-btn:focus-visible:not(:disabled) {
  color: var(--sm-color-danger);
  background: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
}
</style>
