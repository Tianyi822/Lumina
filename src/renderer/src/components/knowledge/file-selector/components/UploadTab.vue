<script setup lang="ts">
/**
 * 上传标签页组件
 * 支持拖拽上传和点击上传
 */
import { FileUploadZone } from '../../shared/components'
import type { UploadResult } from '../../shared/composables/useFileUpload'

defineProps<{
  /** 知识库 ID */
  kbId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'uploadComplete', result: UploadResult): void
}>()

function handleUploadComplete(result: UploadResult): void {
  emit('uploadComplete', result)
}
</script>

<template>
  <div class="tab-content">
    <div class="upload-wrapper">
      <FileUploadZone
        :auto-link-to-k-b="true"
        :kb-id="kbId"
        @upload-complete="handleUploadComplete"
      />
    </div>

    <div class="upload-actions">
      <button class="btn" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 400px;
}

.upload-wrapper {
  flex: 1;
  margin: 24px;
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 24px 24px;
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
</style>
