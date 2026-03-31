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
    <div class="upload-copy">
      <span class="upload-copy__label">上传到资源池</span>
      <p>新文件会先进入文件资源池，再自动挂载到当前知识库。</p>
    </div>

    <div class="upload-wrapper">
      <FileUploadZone
        :auto-link-to-k-b="true"
        :kb-id="kbId"
        @upload-complete="handleUploadComplete"
      />
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
  overflow: hidden;
  min-height: 400px;
}

.upload-copy {
  padding: 0 var(--sm-space-5) var(--sm-space-4);
}

.upload-copy__label {
  display: inline-block;
  margin-bottom: 6px;
  font-size: 12px;
  color: var(--sm-color-text-tertiary);
}

.upload-copy p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sm-color-text-secondary);
}

.upload-wrapper {
  flex: 1;
  margin: 0 var(--sm-space-5) var(--sm-space-4);
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 var(--sm-space-5) var(--sm-space-5);
}

@media (max-width: 720px) {
  .upload-copy,
  .upload-wrapper,
  .upload-actions {
    margin-left: var(--sm-space-4);
    margin-right: var(--sm-space-4);
    padding-left: 0;
    padding-right: 0;
  }
}
</style>
