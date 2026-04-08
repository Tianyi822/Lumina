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
      <p class="upload-text">拖放文件到这里，或点击选择文件</p>
      <p class="upload-hint">系统会自动校验格式与大小。</p>
      <p class="upload-types">支持 .txt、.md、.pdf、.doc、.docx、.csv、.xls、.xlsx，最大 50MB</p>
    </div>
    <div v-else class="uploading-content">
      <span class="sm-spinner sm-spinner--large"></span>
      <p>正在上传...</p>
    </div>
    <input
      type="file"
      multiple
      accept=".txt,.md,.pdf,.doc,.docx,.csv,.xls,.xlsx"
      class="upload-file-input"
      @change="handleFileSelect"
    />
  </div>
</template>

<style scoped>
.upload-zone {
  min-height: 180px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sm-space-4);
  padding: var(--sm-space-6);
  border: 1px dashed var(--sm-color-border-default);
  border-radius: var(--sm-radius-lg);
  background: var(--sm-color-surface-1);
  text-align: center;
  cursor: pointer;
  transition:
    background-color var(--sm-transition-fast),
    border-color var(--sm-transition-fast),
    opacity var(--sm-transition-fast);
}

.upload-zone.dragging {
  border-color: var(--sm-color-border-accent);
  background: var(--sm-color-accent-08);
}

.upload-zone.uploading {
  opacity: 0.7;
  pointer-events: none;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sm-space-3);
  max-width: 360px;
}

.upload-text {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--sm-color-text-primary);
}

.upload-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
}

.upload-file-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.upload-types {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--sm-color-text-tertiary);
}

.uploading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sm-space-3);
}

.uploading-content p {
  margin: 0;
  font-size: 13px;
  color: var(--sm-color-text-secondary);
}
</style>
