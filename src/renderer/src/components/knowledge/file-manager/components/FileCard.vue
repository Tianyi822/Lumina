<script setup lang="ts">
/**
 * 文件卡片组件
 * 显示单个文件的信息和操作按钮
 */
import type { FileItem } from '@renderer/types'
import { useFileStore } from '@renderer/stores'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { FileIcon } from '../../shared/components'
import {
  canDeleteFile,
  getFileSourceClass,
  getFileSourceLabel,
  getFileSubtitle
} from '../../utils/fileSource'

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
  <div class="file-row" @click="emit('preview', file)">
    <div class="file-row__main">
      <div class="file-row__title-line">
        <FileIcon class="file-row__icon" :file-type="file.fileType" :size="14" />
        <div class="file-name" :title="file.name">{{ getFileNameWithoutExtension(file.name) }}</div>
        <span :class="['source-badge', getFileSourceClass(file)]">
          {{ getFileSourceLabel(file) }}
        </span>
        <div class="file-meta">
          <span class="badge file-type-badge">{{ file.fileType.toUpperCase() }}</span>
          <span>{{ fileStore.formatFileSize(file.size) }}</span>
          <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
        </div>
        <div v-if="file.usedByKBIds.length > 0" class="usage-badge">使用中</div>
        <button
          v-if="canDeleteFile(file)"
          class="delete-btn"
          :disabled="isDeleting"
          :title="file.usedByKBIds.length > 0 ? '文件被知识库使用，删除需谨慎' : '删除文件'"
          @click.stop="emit('delete', file)"
        >
          <span v-if="isDeleting" class="sm-spinner"></span>
          <SvgIcon v-else name="trash" :size="14" />
        </button>
      </div>
      <div class="file-subtitle" :title="getFileSubtitle(file)">
        {{ getFileSubtitle(file) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-row {
  display: flex;
  align-items: center;
  min-height: 72px;
  padding: var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast);
}

.file-row:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.file-row__icon {
  width: 1em;
  height: 1em;
  flex-shrink: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.file-row__main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.file-row__title-line {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  min-width: 0;
  width: 100%;
  font-size: 14px;
}

.file-name {
  min-width: 0;
  flex: 1;
  font-size: 1em;
  font-weight: 600;
  color: var(--sm-color-text-primary);
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-subtitle {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.file-meta {
  display: flex;
  align-items: center;
  gap: var(--sm-space-2);
  font-size: 11px;
  color: var(--sm-color-text-secondary);
  flex-shrink: 0;
  justify-content: flex-end;
  white-space: nowrap;
}

.file-meta > span {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
}

.file-type-badge {
  color: var(--sm-color-text-primary);
}

.usage-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
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
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.delete-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.file-row:hover .delete-btn:not(:disabled) {
  opacity: 1;
}

.delete-btn:hover:not(:disabled),
.delete-btn:focus-visible:not(:disabled) {
  background-color: rgba(199, 120, 120, 0.12);
  border-color: rgba(199, 120, 120, 0.28);
  color: rgba(199, 120, 120, 0.92);
}

.source-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  min-height: 20px;
  padding: 0 7px;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 999px;
  font-size: 11px;
  color: var(--sm-color-text-secondary);
  background: var(--sm-color-surface-1);
}

.source-paper_file,
.source-paper_note {
  border-color: var(--sm-color-accent-28);
  color: var(--sm-color-accent-hover);
  background: var(--sm-color-accent-08);
}

@media (max-width: 720px) {
  .file-row__title-line {
    flex-wrap: wrap;
  }

  .file-meta {
    order: 3;
    width: 100%;
    justify-content: flex-start;
    padding-left: calc(1em + var(--sm-space-2));
  }

  .usage-badge {
    margin-left: auto;
  }

  .delete-btn {
    margin-left: 0;
  }
}
</style>
