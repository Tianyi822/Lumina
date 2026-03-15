<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import type { FileItem } from '@renderer/types'
import { useFileStore } from '@renderer/stores'

defineProps<{
  linkedFiles: FileItem[]
  loadingFiles: boolean
  isDragging: boolean
  unlinkingFileId: string | null
  indexingStatus: boolean
  kbIndexingFiles: Record<string, { progress?: number }>
}>()

const emit = defineEmits<{
  (e: 'dragenter', event: DragEvent): void
  (e: 'dragleave', event: DragEvent): void
  (e: 'dragover', event: DragEvent): void
  (e: 'drop', event: DragEvent): void
  (e: 'add-files'): void
  (e: 'unlink-file', fileId: string): void
}>()

const fileStore = useFileStore()

function getFileIconClass(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'file-icon-pdf'
    case 'txt':
      return 'file-icon-txt'
    case 'md':
      return 'file-icon-md'
    case 'doc':
    case 'docx':
      return 'file-icon-doc'
    case 'csv':
      return 'file-icon-csv'
    default:
      return 'file-icon-default'
  }
}

function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return fileName.substring(0, lastDotIndex)
  }
  return fileName
}
</script>

<template>
  <div
    class="documents-section"
    :class="{ 'drag-over': isDragging }"
    @dragenter="emit('dragenter', $event)"
    @dragleave="emit('dragleave', $event)"
    @dragover="emit('dragover', $event)"
    @drop="emit('drop', $event)"
  >
    <div class="section-header">
      <h3>文档列表</h3>
      <span v-if="linkedFiles.length > 0" class="document-count"
        >{{ linkedFiles.length }} 个文件</span
      >
    </div>

    <!-- 拖拽提示遮罩 -->
    <div v-if="isDragging" class="drag-overlay">
      <div class="drag-content">
        <div class="drag-icon">+</div>
        <div class="drag-text">释放文件以上传</div>
      </div>
    </div>

    <div v-if="loadingFiles" class="loading-state">
      <div class="spinner-small"></div>
      <span>加载中...</span>
    </div>

    <div v-else-if="linkedFiles.length === 0" class="documents-grid">
      <!-- 添加文件卡片（空状态时显示） -->
      <div class="add-file-card" @click="emit('add-files')">
        <div class="add-file-icon">+</div>
        <div class="add-file-text">添加文件</div>
      </div>
    </div>

    <div v-else class="documents-grid">
      <!-- 已关联的文件卡片 -->
      <div
        v-for="file in linkedFiles"
        :key="file.id"
        :class="[
          'document-card',
          {
            unlinking: unlinkingFileId === file.id,
            'indexing-disabled': indexingStatus
          }
        ]"
      >
        <div class="document-card-header">
          <div :class="['document-icon', getFileIconClass(file.fileType)]">
            <SvgIcon v-if="file.fileType === 'pdf'" name="file-pdf" class="file-icon-svg" />
            <SvgIcon v-else-if="file.fileType === 'txt'" name="file-txt" class="file-icon-svg" />
            <SvgIcon v-else-if="file.fileType === 'md'" name="file-md" class="file-icon-svg" />
            <SvgIcon v-else name="file" class="file-icon-svg" />
          </div>
          <button
            class="document-remove-btn"
            :disabled="unlinkingFileId === file.id || indexingStatus"
            title="取消关联"
            @click.stop="emit('unlink-file', file.id)"
          >
            <span v-if="unlinkingFileId === file.id" class="spinner-tiny"></span>
            <SvgIcon v-else name="close" :size="12" />
          </button>
        </div>
        <div class="document-info">
          <div class="document-name" :title="file.name">
            {{ getFileNameWithoutExtension(file.name) }}
          </div>
          <div v-if="kbIndexingFiles[file.id]" class="bottom-group">
            <div class="file-progress">
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  :style="{ width: `${kbIndexingFiles[file.id].progress || 0}%` }"
                ></div>
              </div>
            </div>
            <div class="document-meta">
              <span class="document-type">{{ file.fileType.toUpperCase() }}</span>
              <span>{{ fileStore.formatFileSize(file.size) }}</span>
              <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
            </div>
          </div>
          <div v-else class="document-meta">
            <span class="document-type">{{ file.fileType.toUpperCase() }}</span>
            <span>{{ fileStore.formatFileSize(file.size) }}</span>
            <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- 添加文件卡片 -->
      <div class="add-file-card" @click="emit('add-files')">
        <div class="add-file-icon">+</div>
        <div class="add-file-text">添加文件</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.documents-section {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  position: relative;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.document-count {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--theme-text-secondary);
  font-size: 13px;
}

.documents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

/* 文档卡片 */
.document-card {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.2s ease;
  cursor: default;
  min-height: 160px;
}

.document-card:hover {
  border-color: var(--theme-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.document-card.unlinking,
.document-card.indexing-disabled {
  opacity: 0.7;
  pointer-events: none;
}

.document-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.document-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
}

.file-icon-pdf {
  background-color: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.file-icon-txt {
  background-color: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.file-icon-md {
  background-color: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.file-icon-doc {
  background-color: rgba(43, 87, 154, 0.15);
  color: #2b579a;
}

.file-icon-csv {
  background-color: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.file-icon-default {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.file-icon-svg {
  width: 24px;
  height: 24px;
}

.document-remove-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.document-remove-btn:hover {
  background-color: var(--theme-bg-hover);
  color: var(--theme-danger);
}

.document-remove-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.document-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.bottom-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: auto;
}

.document-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 8px;
}

.file-progress {
  margin-bottom: 4px;
}

.progress-bar {
  height: 3px;
  background-color: var(--theme-bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--theme-accent);
  transition: width 0.3s ease;
}

.document-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--theme-text-secondary);
  margin-top: auto;
}

.file-progress:last-child + .document-meta {
  margin-top: 0;
}

.document-type {
  font-size: 11px;
  color: var(--theme-accent);
  font-weight: 500;
}

/* Spinner */
.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-tiny {
  width: 12px;
  height: 12px;
  border: 2px solid var(--theme-border);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 添加文件卡片 */
.add-file-card {
  background-color: var(--theme-bg-secondary);
  border: 2px dashed var(--theme-border);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 160px;
}

.add-file-card:hover {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.add-file-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--theme-border);
  border-radius: 50%;
  font-size: 24px;
  color: var(--theme-text-secondary);
  transition: all 0.2s ease;
}

.add-file-card:hover .add-file-icon {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

.add-file-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text-secondary);
}

/* 拖拽相关样式 */
.documents-section.drag-over {
  border: 2px dashed var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(63, 185, 80, 0.1);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  border: 2px dashed var(--theme-accent);
  border-radius: 12px;
}

.drag-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
  background-color: var(--theme-bg);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.drag-icon {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 300;
  color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.1);
  border-radius: 50%;
}

.drag-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--theme-text);
}

.documents-section::-webkit-scrollbar {
  width: 6px;
}

.documents-section::-webkit-scrollbar-track {
  background: transparent;
}

.documents-section::-webkit-scrollbar-thumb {
  background-color: var(--theme-border);
  border-radius: 3px;
}
</style>
