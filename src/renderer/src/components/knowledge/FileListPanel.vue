<script setup lang="ts">
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import { FileIcon } from './shared'

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

function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return fileName.substring(0, lastDotIndex)
  }
  return fileName
}
</script>

<template>
  <section
    class="documents-section"
    :class="{ 'drag-over': isDragging }"
    @dragenter="emit('dragenter', $event)"
    @dragleave="emit('dragleave', $event)"
    @dragover="emit('dragover', $event)"
    @drop="emit('drop', $event)"
  >
    <div class="section-header">
      <div>
        <span class="section-eyebrow">文档挂载</span>
        <h3>关联文档</h3>
      </div>
      <div class="section-header__actions">
        <span class="document-count">{{ linkedFiles.length }} 个文件</span>
        <button class="sm-button sm-button--secondary sm-button--small" @click="emit('add-files')">
          添加文档
        </button>
      </div>
    </div>

    <div v-if="isDragging" class="drag-overlay">
      <div class="drag-content">
        <span class="drag-icon">+</span>
        <div class="drag-copy">
          <strong>释放文件以上传并挂载</strong>
          <span>支持 TXT、Markdown、PDF、Word 和 CSV。</span>
        </div>
      </div>
    </div>

    <div v-if="loadingFiles" class="loading-state">
      <span class="sm-spinner sm-spinner--large"></span>
      <span>正在加载文档...</span>
    </div>

    <div v-else-if="linkedFiles.length === 0" class="sm-empty documents-empty">
      <h4>当前知识库还没有挂载文档</h4>
      <p>从文件资源池中选择已有文档，或直接拖拽文件到这里上传。</p>
      <button class="sm-button sm-button--primary" @click="emit('add-files')">
        添加第一份文档
      </button>
    </div>

    <div v-else class="documents-grid">
      <article
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
        <div class="document-card__header">
          <FileIcon :file-type="file.fileType" :size="20" />
          <button
            class="sm-icon-button document-remove-btn"
            :disabled="unlinkingFileId === file.id || indexingStatus"
            title="取消关联"
            @click.stop="emit('unlink-file', file.id)"
          >
            <span v-if="unlinkingFileId === file.id" class="sm-spinner"></span>
            <SvgIcon v-else name="close" :size="12" />
          </button>
        </div>

        <div class="document-info">
          <div class="document-name" :title="file.name">
            {{ getFileNameWithoutExtension(file.name) }}
          </div>
          <div class="document-filename">{{ file.name }}</div>

          <div v-if="kbIndexingFiles[file.id]" class="file-progress">
            <div class="file-progress__meta">
              <span>索引同步中</span>
              <span>{{ kbIndexingFiles[file.id].progress || 0 }}%</span>
            </div>
            <div class="progress-bar">
              <div
                class="progress-fill"
                :style="{ width: `${kbIndexingFiles[file.id].progress || 0}%` }"
              ></div>
            </div>
          </div>
        </div>

        <div class="document-meta">
          <span class="badge document-type">{{ file.fileType.toUpperCase() }}</span>
          <span>{{ fileStore.formatFileSize(file.size) }}</span>
          <span>{{ fileStore.formatDate(file.uploadedAt) }}</span>
        </div>
      </article>

      <button class="add-file-card" @click="emit('add-files')">
        <span class="add-file-icon">+</span>
        <span class="add-file-text">添加更多文档</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.documents-section {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: var(--sm-space-5) var(--sm-space-6) var(--sm-space-6);
  border: 1px solid var(--sm-color-border-subtle);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-1);
  overflow-y: auto;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-4);
  margin-bottom: var(--sm-space-5);
}

.section-eyebrow {
  display: inline-block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--sm-color-text-tertiary);
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.section-header__actions {
  display: flex;
  align-items: center;
  gap: var(--sm-space-3);
}

.document-count {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.loading-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sm-space-3);
  color: var(--sm-color-text-secondary);
  font-size: 13px;
}

.documents-empty {
  flex: 1;
  min-height: 240px;
}

.documents-empty h4 {
  margin: 0;
  font-size: 16px;
  color: var(--sm-color-text-primary);
}

.documents-empty p {
  margin: 0;
  max-width: 420px;
  line-height: 1.6;
}

.documents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--sm-space-4);
}

.document-card {
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-4);
  min-height: 220px;
  padding: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: var(--sm-color-surface-2);
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    opacity var(--sm-transition-fast);
}

.document-card:hover {
  background: var(--sm-color-surface-hover);
  border-color: var(--sm-color-border-strong);
}

.document-card.unlinking,
.document-card.indexing-disabled {
  opacity: 0.7;
}

.document-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.document-remove-btn {
  flex-shrink: 0;
}

.document-info {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sm-space-2);
  min-height: 0;
}

.document-name {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--sm-color-text-primary);
  word-break: break-word;
}

.document-filename {
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
  word-break: break-all;
}

.file-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: auto;
}

.file-progress__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-2);
  font-size: 11px;
  color: var(--sm-color-text-secondary);
  font-family: var(--sm-font-mono);
}

.progress-bar {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--sm-color-accent);
  transition: width 0.3s ease;
}

.document-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  margin-top: auto;
  font-size: 11px;
  color: var(--sm-color-text-secondary);
}

.document-type {
  color: var(--sm-color-text-primary);
}

.add-file-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sm-space-3);
  min-height: 220px;
  padding: var(--sm-space-5);
  border: 1px dashed var(--sm-color-border-default);
  border-radius: var(--sm-radius-md);
  background: rgba(255, 255, 255, 0.02);
  color: var(--sm-color-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    color var(--sm-transition-fast);
}

.add-file-card:hover {
  border-color: var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.08);
  color: var(--sm-color-text-primary);
}

.add-file-icon {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed currentColor;
  border-radius: 999px;
  font-size: 24px;
}

.add-file-text {
  font-size: 13px;
  font-weight: 500;
}

.drag-over {
  border-color: var(--sm-color-border-accent);
  background: rgba(142, 149, 217, 0.05);
}

.drag-overlay {
  position: absolute;
  inset: var(--sm-space-4);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--sm-color-border-accent);
  border-radius: var(--sm-radius-lg);
  background: rgba(11, 11, 12, 0.68);
  z-index: 1;
}

.drag-content {
  display: flex;
  align-items: center;
  gap: var(--sm-space-4);
  padding: var(--sm-space-5);
  border: 1px solid var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-2);
}

.drag-icon {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--sm-color-border-accent);
  border-radius: 999px;
  color: var(--sm-color-accent-hover);
  font-size: 24px;
}

.drag-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drag-copy strong {
  font-size: 14px;
  color: var(--sm-color-text-primary);
}

.drag-copy span {
  font-size: 12px;
  color: var(--sm-color-text-secondary);
}

.documents-section::-webkit-scrollbar {
  width: var(--sm-scrollbar-size);
}

.documents-section::-webkit-scrollbar-track {
  background: transparent;
}

.documents-section::-webkit-scrollbar-thumb {
  background-color: var(--sm-color-border-default);
  border-radius: 999px;
}

@media (max-width: 960px) {
  .documents-section {
    padding: var(--sm-space-4);
  }

  .section-header,
  .section-header__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .documents-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
