<script setup lang="ts">
/**
 * 文件管理模态框
 * 管理文件的上传、删除等操作
 */
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useFileStore } from '@renderer/stores'
import type { FileItem } from '@renderer/types'
import { FileUploadZone } from './shared/components'
import type { UploadResult } from './shared/composables/useFileUpload'
import {
  FileManagerHeader,
  FileManagerToolbar,
  FileCard,
  FileListState,
  ConfirmDeleteDialog
} from './file-manager'
import { useFileDelete } from './file-manager/composables/useFileDelete'
import FilePreviewDialog from './FilePreviewDialog.vue'

const emit = defineEmits<{
  (e: 'close'): void
}>()

// 文件管理
const fileStore = useFileStore()
const { filteredFiles } = storeToRefs(fileStore)
const { loadFiles } = fileStore

const feedback = ref<{ type: 'info' | 'error'; message: string } | null>(null)

// 删除逻辑
const {
  deletingFileId,
  showConfirmDialog,
  fileToDelete,
  deleteError,
  handleDeleteClick,
  performDelete,
  cancelDelete
} = useFileDelete()

// 上传完成回调
function handleUploadComplete(result: UploadResult): void {
  const messages: string[] = []

  if (result.duplicates.length > 0) {
    const names = result.duplicates.map((f) => f.name).join(', ')
    messages.push(`以下文件已存在，已自动关联：${names}`)
  }

  if (result.errors.length > 0) {
    feedback.value = {
      type: 'error',
      message: `部分文件上传失败：${result.errors.join('；')}`
    }
    return
  }

  feedback.value =
    messages.length > 0
      ? {
          type: 'info',
          message: messages.join(' ')
        }
      : null
}

// 文件预览
const previewFile = ref<FileItem | null>(null)
const showPreview = ref(false)

function handlePreview(file: FileItem): void {
  previewFile.value = file
  showPreview.value = true
}

function handleClosePreview(): void {
  showPreview.value = false
  setTimeout(() => {
    previewFile.value = null
  }, 300)
}

// 生命周期
onMounted(async () => {
  await loadFiles()
})
</script>

<template>
  <div class="sm-modal__overlay file-manager-overlay" @click.self="emit('close')">
    <div class="sm-modal__surface file-manager-container">
      <FileManagerHeader @close="emit('close')" />

      <div
        v-if="feedback"
        class="sm-notice file-manager-feedback"
        :class="feedback.type === 'error' ? 'sm-notice--error' : 'sm-notice--info'"
      >
        {{ feedback.message }}
      </div>

      <FileManagerToolbar />

      <div class="drop-zone-wrapper">
        <FileUploadZone @upload-complete="handleUploadComplete" />
      </div>

      <FileListState>
        <FileCard
          v-for="file in filteredFiles"
          :key="file.id"
          :file="file"
          :is-deleting="deletingFileId === file.id"
          @delete="handleDeleteClick"
          @preview="handlePreview"
        />
      </FileListState>
    </div>

    <ConfirmDeleteDialog
      :show="showConfirmDialog"
      :file="fileToDelete"
      :is-deleting="!!deletingFileId"
      :error="deleteError"
      @confirm="performDelete"
      @cancel="cancelDelete"
    />

    <FilePreviewDialog :visible="showPreview" :file="previewFile" @close="handleClosePreview" />
  </div>
</template>

<style scoped>
.file-manager-overlay {
  z-index: 1000;
}

.file-manager-container {
  width: min(960px, calc(100vw - 72px));
  max-height: min(820px, calc(100vh - 104px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-manager-feedback {
  margin: var(--sm-space-4) var(--sm-space-5) 0;
}

.drop-zone-wrapper {
  margin: var(--sm-space-4) var(--sm-space-5);
}

.drop-zone-wrapper :deep(.upload-zone) {
  min-height: 180px;
}

@media (max-width: 720px) {
  .file-manager-container {
    width: calc(100vw - 32px);
  }
}
</style>
