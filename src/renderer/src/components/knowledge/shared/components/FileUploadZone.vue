<script setup lang="ts">
/**
 * 文件上传区域组件
 * 支持拖拽上传和点击上传
 */
import { useFileUpload, type UploadResult } from '../composables/useFileUpload'

const props = defineProps<{
  /** 上传成功后是否自动关联到知识库 */
  autoLinkToKB?: boolean
  /** 知识库 ID（用于自动关联） */
  kbId?: string
}>()

const emit = defineEmits<{
  (e: 'uploadComplete', result: UploadResult): void
}>()

const { isDragging, isUploading, handleDragOver, handleDragLeave, handleDrop, handleFileSelect } =
  useFileUpload({
    autoLinkToKB: props.autoLinkToKB,
    kbId: props.kbId,
    onUploadComplete: (result) => emit('uploadComplete', result)
  })
</script>

<template>
  <div
    :class="['upload-zone', { dragging: isDragging, uploading: isUploading }]"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div v-if="!isUploading" class="upload-content">
      <p class="upload-text">拖放文件到这里上传</p>
      <p class="upload-hint">或</p>
      <label class="btn btn-primary upload-btn">
        选择文件
        <input
          type="file"
          multiple
          accept=".txt,.md,.pdf,.doc,.docx,.csv"
          @change="handleFileSelect"
        />
      </label>
      <p class="upload-types">支持 .txt、.md、.pdf、.doc、.docx、.csv，最大 50MB</p>
    </div>
    <div v-else class="uploading-content">
      <div class="spinner"></div>
      <p>正在上传...</p>
    </div>
  </div>
</template>

<style scoped>
.upload-zone {
  flex: 1;
  border: 2px dashed var(--theme-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: all 0.2s ease;
  background-color: var(--theme-bg-secondary);
}

.upload-zone.dragging {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.upload-zone.uploading {
  opacity: 0.7;
  pointer-events: none;
}

.upload-content {
  padding: 24px;
}

.upload-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.upload-hint {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 4px 0;
}

.upload-btn {
  position: relative;
  overflow: hidden;
  margin-top: 12px;
}

.upload-btn input[type='file'] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.upload-types {
  font-size: 12px;
  color: var(--theme-text-secondary);
  margin-top: 12px;
}

.uploading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
}

/* Spinner */
.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
</style>
