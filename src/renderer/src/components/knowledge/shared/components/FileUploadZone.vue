<script setup lang="ts">
/**
 * 文件上传区域组件
 * 支持拖拽上传和点击上传
 */
import { SUPPORTED_DOCUMENT_ACCEPT, SUPPORTED_DOCUMENT_LABEL } from '@shared/constants/document'
import { useFileUpload, type UploadResult } from '../composables/useFileUpload'
import styles from './FileUploadZone.module.css'

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
    :class="[
      styles['upload-zone'],
      { [styles.dragging]: isDragging, [styles.uploading]: isUploading }
    ]"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <div v-if="!isUploading" :class="styles['upload-content']">
      <p :class="styles['upload-text']">拖放文件到这里，或点击选择文件</p>
      <p :class="styles['upload-hint']">系统会自动校验格式与大小。</p>
      <p :class="styles['upload-types']">支持 {{ SUPPORTED_DOCUMENT_LABEL }}，最大 50MB</p>
    </div>
    <div v-else :class="styles['uploading-content']">
      <span class="sm-spinner sm-spinner--large"></span>
      <p>正在上传...</p>
    </div>
    <input
      type="file"
      multiple
      :accept="SUPPORTED_DOCUMENT_ACCEPT"
      :class="styles['upload-file-input']"
      @change="handleFileSelect"
    />
  </div>
</template>
