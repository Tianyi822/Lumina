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
}>()

const fileStore = useFileStore()
</script>

<template>
  <div class="file-card">
    <!-- 文件图标 -->
    <div class="file-icon-wrapper">
      <FileIcon :file-type="file.fileType" :size="28" />
    </div>

    <!-- 文件信息 -->
    <div class="file-info">
      <div class="file-name" :title="file.name">{{ file.name }}</div>
      <div class="file-meta">
        <span class="file-size">{{ fileStore.formatFileSize(file.size) }}</span>
        <span class="file-date">{{ fileStore.formatDate(file.uploadedAt) }}</span>
      </div>
    </div>

    <!-- 操作按钮容器 -->
    <div class="file-actions">
      <!-- 使用状态标签 -->
      <div v-if="file.usedByKBIds.length > 0" class="usage-badge">使用中</div>

      <!-- 删除按钮 -->
      <button
        class="delete-btn"
        :disabled="isDeleting"
        :title="file.usedByKBIds.length > 0 ? '文件被知识库使用，删除需谨慎' : '删除文件'"
        @click="emit('delete', file)"
      >
        <span v-if="isDeleting" class="spinner-small"></span>
        <span v-else class="delete-text">删除</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-card {
  position: relative;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.2s ease;
}

.file-card:hover {
  border-color: var(--theme-accent);
  box-shadow: var(--theme-shadow);
}

.file-icon-wrapper {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  color: var(--theme-text-secondary);
}

/* 文件操作按钮容器 */
.file-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.usage-badge {
  padding: 5px 8px;
  border: 1px solid var(--theme-accent);
  background-color: var(--theme-accent);
  color: white;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.delete-btn {
  padding: 5px 8px;
  border: 1px solid var(--theme-border);
  background-color: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  opacity: 0;
  flex-shrink: 0;
  line-height: 1;
}

.file-card:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background-color: var(--theme-danger);
  border-color: var(--theme-danger);
  color: white;
}

.delete-btn:disabled {
  opacity: 0.5 !important;
  cursor: not-allowed;
}

.delete-text {
  font-size: 12px;
}

.spinner-small {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--theme-border);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
