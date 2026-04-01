<script setup lang="ts">
/**
 * 上传标签页组件
 * 支持拖拽上传和点击上传
 */
import { ref } from 'vue'
import { FileUploadZone } from '../../shared/components'
import type { UploadResult } from '../../shared/composables/useFileUpload'
import type { FileItem } from '@renderer/types'

defineProps<{
  /** 知识库 ID */
  kbId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'uploadComplete', result: UploadResult): void
}>()

// 本次打开窗口上传的文件（临时列表，重新打开会清空）
const uploadedFiles = ref<FileItem[]>([])

function handleUploadComplete(result: UploadResult): void {
  const newFiles = [...result.uploaded, ...result.duplicates]
  uploadedFiles.value.push(...newFiles)
  emit('uploadComplete', result)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<template>
  <div class="tab-content">
    <div class="upload-copy">
      <p>新文件会先进入文件资源池，再自动挂载到当前知识库。文件删除需重建索引，请在知识库中操作。</p>
    </div>

    <div class="upload-wrapper">
      <FileUploadZone
        :auto-link-to-k-b="true"
        :kb-id="kbId"
        @upload-complete="handleUploadComplete"
      />
    </div>

    <div v-if="uploadedFiles.length > 0" class="upload-result-list">
      <div
        v-for="file in uploadedFiles"
        :key="file.id"
        class="upload-result-item"
      >
        <span class="upload-result-item__name">{{ file.name }}</span>
        <span class="upload-result-item__size">{{ formatSize(file.size) }}</span>
      </div>
    </div>

    <div class="upload-actions">
      <button class="sm-button sm-button--secondary" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.upload-copy {
  padding: 0 var(--sm-space-5) var(--sm-space-4);
}

.upload-copy p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.upload-wrapper {
  margin: 0 var(--sm-space-5) var(--sm-space-4);
}

.upload-result-list {
  margin: 0 var(--sm-space-5) var(--sm-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--sm-space-1);
  max-height: 160px;
  overflow-y: auto;
}

.upload-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sm-space-2) var(--sm-space-3);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-1);
  font-size: 12px;
}

.upload-result-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--sm-color-text-primary);
}

.upload-result-item__size {
  flex-shrink: 0;
  margin-left: var(--sm-space-3);
  color: var(--sm-color-text-tertiary);
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 var(--sm-space-5) var(--sm-space-5);
}

@media (max-width: 720px) {
  .upload-copy,
  .upload-wrapper,
  .upload-result-list,
  .upload-actions {
    margin-left: var(--sm-space-4);
    margin-right: var(--sm-space-4);
    padding-left: 0;
    padding-right: 0;
  }
}
</style>
