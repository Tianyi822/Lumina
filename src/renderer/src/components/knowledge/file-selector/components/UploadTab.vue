<script setup lang="ts">
/**
 * 上传标签页组件
 * 支持拖拽上传和点击上传
 */
import { ref } from 'vue'
import { FileUploadZone } from '../../shared/components'
import type { UploadResult } from '../../shared/composables/useFileUpload'
import type { FileItem } from '@renderer/types'
import styles from './UploadTab.module.css'

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
  <div :class="styles['tab-content']">
    <div :class="styles['upload-copy']">
      <p>
        新文件会先进入文件资源池，再自动挂载到当前知识库。文件删除需重建索引，请在知识库中操作。
      </p>
    </div>

    <div :class="styles['upload-wrapper']">
      <FileUploadZone
        :auto-link-to-k-b="true"
        :kb-id="kbId"
        @upload-complete="handleUploadComplete"
      />
    </div>

    <div v-if="uploadedFiles.length > 0" :class="styles['upload-result-list']">
      <div v-for="file in uploadedFiles" :key="file.id" :class="styles['upload-result-item']">
        <span :class="styles['upload-result-item__name']">{{ file.name }}</span>
        <span :class="styles['upload-result-item__size']">{{ formatSize(file.size) }}</span>
      </div>
    </div>

    <div :class="styles['upload-actions']">
      <button class="sm-button sm-button--secondary" @click="emit('close')">关闭</button>
    </div>
  </div>
</template>
